// Page « Mentions légales et données personnelles » : lien depuis chaque écran,
// contenu attendu, lisible sur téléphone et en mode nuit.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = process.cwd();
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  try {
    res.setHeader(
      'Content-Type',
      file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : undefined),
  headless: true
});
let count = 0;
const ok = name => {
  count++;
  console.log('✓ ' + name);
};
try {
  const html = fs.readFileSync('confidentialite.html', 'utf8');
  const placeholders = (html.match(/À COMPLÉTER/g) || []).length;
  if (process.env.GITHUB_REF_NAME === 'main')
    assert.equal(placeholders, 0, 'Mentions légales : informations de l’éditeur à compléter');
  else if (placeholders) console.log(`! ${placeholders} information(s) de l’éditeur à compléter`);

  for (const f of ['index.html', 'employee.html', 'pilotage.html']) {
    const s = fs.readFileSync(f, 'utf8');
    assert.ok(s.includes('href="confidentialite.html"'), f);
  }
  assert.ok(fs.readFileSync('sw.js', 'utf8').includes("'./confidentialite.html'"));
  ok('Lien présent sur l’accueil, l’espace salarié et le Pilotage ; page disponible hors ligne');

  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    serviceWorkers: 'block'
  });
  await context.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort()
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/employee.html');
  await page.locator('#invalidView a[href="confidentialite.html"]').click();
  await page.waitForURL(/confidentialite\.html$/);
  for (const id of ['editeur', 'hebergement', 'donnees', 'conservation', 'droits', 'stockage'])
    assert.equal(await page.locator('#' + id).count(), 1, id);
  const text = await page.locator('main').innerText();
  for (const re of [/Supabase/, /Francfort/, /L3245-1/, /CNIL/, /aucun cookie/i, /géolocalisation/])
    assert.match(text, re);
  ok(
    'Écran « lien invalide » → page complète (éditeur, hébergement, données, durées, droits, stockage)'
  );
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true
  );
  ok('Téléphone : aucun défilement horizontal');
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({
      path: `${process.env.SCREENSHOT_DIR}/mentions-mobile.png`,
      fullPage: true
    });
  await page.locator('#legalBack').click();
  await page.waitForURL(/employee\.html$/);
  ok('« Retour à l’application » ramène à l’écran précédent');

  await page.evaluate(() => localStorage.setItem('hours_theme_preference_v1', 'dark'));
  await page.goto(base + '/confidentialite.html');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.notEqual(bg, 'rgb(246, 247, 249)');
  assert.equal(await page.locator('#legalBack').getAttribute('href'), 'index.html');
  ok('Mode nuit respecté ; sans page précédente, le retour mène à l’accueil');
  assert.deepEqual(errors, []);
  ok('Aucune erreur JavaScript');
  await context.close();
  console.log(`\n${count} contrôles des mentions légales passés.`);
} finally {
  await browser.close();
  server.close();
}

// Menus du Pilotage : menu flottant (mode nuit sans fermeture, clic à côté, roue, Échap)
// et tableau des employeurs dans « Outils et réglages » (sans zone de défilement imbriquée).
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
const shots = process.env.SCREENSHOT_DIR;
let count = 0;
const ok = name => {
  count++;
  console.log('✓ ' + name);
};

async function openPilotage(viewport) {
  const context = await browser.newContext({
    viewport,
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block'
  });
  await context.route('**/*', route =>
    route.request().url().startsWith(base) ? route.continue() : route.abort()
  );
  const page = await context.newPage(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-18T10:00:00+01:00') });
  await page.goto(base + '/pilotage.html');
  await page.evaluate(() => {
    EMPLOYEES = ['Alice', 'Bruno', 'Chloé', 'David'].map((name, i) => ({
      id: 'e' + i,
      name,
      weeklyObjectiveMinutes: 2460,
      overtimeThresholdMinutes: 2460
    }));
    APP_DATA = { entries: [], settings: { plannedDays: {}, employeeSettings: {} } };
    hydrateEmployeeSettings();
    V2_DATA = {
      employers: ['Ferme du haut', 'Scierie', 'Vergers', 'Coopérative', 'Ancien client'].map(
        (name, i) => ({
          id: 'r' + i,
          name,
          active: i < 4
        })
      ),
      assignments: [
        { employeeId: 'e0', employerId: 'r0', active: true },
        { employeeId: 'e1', employerId: 'r1', active: true }
      ],
      segments: [],
      leaves: []
    };
    window.assignCalls = [];
    toggleEmployerAssignment = async (...args) => window.assignCalls.push(args);
    getSession = () => ({ sessionToken: 'fixture-owner' });
    loadOwnerData = async () => {};
    refreshOwnerPushUI = async () => {};
    invalidView.classList.add('hidden');
    applyTheme('light');
    showApp();
  });
  return { context, page, errors };
}

try {
  // --- Menu flottant ---
  const { context, page, errors } = await openPilotage({ width: 1100, height: 850 });
  const menuOpen = () => page.evaluate(() => floatingActions.classList.contains('open'));
  await page.click('#floatingSettings');
  assert.equal(await menuOpen(), true);
  await page.click('#floatingThemeAction');
  assert.equal(await menuOpen(), true, 'le mode nuit ne doit pas fermer le menu');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.click('#floatingThemeAction');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await menuOpen(), true);
  ok('Mode jour / nuit : le menu reste ouvert');
  await page.mouse.click(300, 300);
  assert.equal(await menuOpen(), false);
  ok('Clic à côté : le menu se ferme');
  await page.click('#floatingSettings');
  await page.click('#floatingSettings');
  assert.equal(await menuOpen(), false);
  ok('Nouveau clic sur la roue : le menu se ferme');
  await page.click('#floatingSettings');
  await page.keyboard.press('Escape');
  assert.equal(await menuOpen(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'floatingSettings');
  ok('Échap : le menu se ferme et le focus revient sur la roue');
  await page.click('#floatingSettings');
  await page.click('[aria-label="Outils et réglages"]');
  assert.equal(await menuOpen(), false);
  assert.equal(
    await page.locator('#ownerToolsModal').evaluate(m => m.classList.contains('open')),
    true
  );
  ok('Ouvrir « Outils et réglages » ferme le menu');

  // --- Tableau des employeurs ---
  const matrix = page.locator('#employerList .employer-matrix');
  assert.equal(await matrix.count(), 1);
  assert.equal(await matrix.locator('tbody tr').count(), 4);
  assert.equal(await matrix.locator('thead th').count(), 4 + 2);
  assert.equal(await matrix.locator('input[type=checkbox]:checked').count(), 2);
  await matrix.locator('input[aria-label="Chloé travaille pour Vergers"]').check();
  assert.deepEqual(await page.evaluate(() => window.assignCalls), [['e2', 'r2', true]]);
  ok('Employeurs : tableau employeurs × salariés, cases fonctionnelles');
  const archived = page.locator('#employerList .archived-employers-line');
  assert.match(await archived.innerText(), /Archivés :\s*Ancien client\s*Réactiver/);
  assert.equal(await page.locator('#employerList details').count(), 0);
  ok('Employeurs archivés : une ligne, sans menu à déplier');
  const inner = await page.evaluate(() => {
    const el = document.getElementById('employerList'),
      s = getComputedStyle(el);
    return { overflowY: s.overflowY, scrolls: el.scrollHeight > el.clientHeight + 1 };
  });
  assert.equal(inner.scrolls, false);
  assert.notEqual(inner.overflowY, 'auto');
  ok('Pas de zone de défilement dans la fenêtre « Outils et réglages »');
  if (shots)
    await page.locator('#ownerToolsModal .sheet').screenshot({ path: `${shots}/outils-ordi.png` });
  assert.deepEqual(errors, []);
  await context.close();

  // --- Téléphone, mode nuit ---
  const mobile = await openPilotage({ width: 375, height: 812 });
  await mobile.page.evaluate(() => {
    applyTheme('dark');
    openOwnerTools();
  });
  const widths = await mobile.page.evaluate(() => ({
    table: document.querySelector('.employer-matrix').getBoundingClientRect().right,
    viewport: innerWidth
  }));
  assert.ok(
    widths.table <= widths.viewport,
    `tableau trop large sur téléphone (${widths.table}px)`
  );
  ok('Téléphone : le tableau tient dans la largeur de l’écran');
  if (shots) await mobile.page.screenshot({ path: `${shots}/outils-mobile-nuit.png` });
  assert.deepEqual(mobile.errors, []);
  ok('Aucune erreur JavaScript');
  await mobile.context.close();
  console.log(`\n${count} contrôles des menus passés.`);
} finally {
  await browser.close();
  server.close();
}

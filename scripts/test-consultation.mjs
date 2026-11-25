// Compte Pilotage en consultation : bandeau, aucune action de modification visible,
// export disponible ; côté admin, création d'un compte consultation et de son lien.
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
const EDIT_SELECTOR = [
  '[onclick*="openOwnerEdit"]',
  '[onclick*="validateFromPlanning"]',
  '[onclick*="validateEmployeeWeek"]',
  '[onclick*="validateAndRefresh"]',
  '[onclick*="setAllPlanning"]',
  '[onclick*="togglePlanningSelectionMode"]',
  '[onclick*="setSelectedDays"]',
  '[onclick*="savePlanning"]',
  '[onclick*="reviewOwnerLeave"]',
  '[onclick*="deleteOwnerLeave"]',
  '[onclick*="openOwnerLeaveModal"]',
  '[onclick*="openOwnerTools"]',
  '[data-week-edit]',
  '[data-week-validate]'
].join(',');

async function openPilotage(access) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
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
  await page.evaluate(access => {
    OWNER_ACCESS = access;
    EMPLOYEES = [
      { id: 'a', name: 'Salarié A', weeklyObjectiveMinutes: 2460, overtimeThresholdMinutes: 2460 }
    ];
    APP_DATA = {
      entries: [
        {
          employeeId: 'a',
          date: '2026-11-17',
          status: 'worked',
          arrival: '08:00',
          departure: '12:00',
          pause: 0,
          pauseMode: 'manual',
          comment: '',
          validationStatus: 'pending'
        }
      ],
      settings: { plannedDays: {}, employeeSettings: {} }
    };
    hydrateEmployeeSettings();
    V2_DATA = {
      employers: [{ id: 'farm', name: 'Ferme', active: true }],
      assignments: [{ employeeId: 'a', employerId: 'farm', active: true }],
      segments: [
        {
          id: 's1',
          employeeId: 'a',
          date: '2026-11-17',
          employerId: 'farm',
          employerName: 'Ferme',
          start: '08:00',
          end: '12:00'
        }
      ],
      leaves: [
        {
          id: 'l1',
          employeeId: 'a',
          startDate: '2026-11-27',
          endDate: '2026-11-27',
          type: 'rtt',
          status: 'pending',
          note: ''
        }
      ]
    };
    window.rpcCalls = [];
    rpc = async name => {
      window.rpcCalls.push(name);
      if (name === 'api_owner_viewers')
        return [{ id: 'v1', label: 'Comptable', active: true, created_at: '2026-11-18T09:00:00Z' }];
      if (name === 'api_owner_create_viewer') return { id: 'v2', link_token: 'a'.repeat(48) };
      return true;
    };
    getSession = () => ({ sessionToken: 'fixture-owner' });
    loadOwnerData = async () => {};
    refreshOwnerPushUI = async () => {};
    invalidView.classList.add('hidden');
    applyTheme('light');
    showApp();
  }, access);
  return { context, page, errors };
}
const visibleEditActions = page =>
  page.$$eval(EDIT_SELECTOR, els => els.filter(el => el.getClientRects().length > 0).length);

try {
  // --- Compte en consultation ---
  const viewer = await openPilotage('viewer');
  let page = viewer.page;
  assert.equal(await page.locator('#readOnlyBanner').isVisible(), true);
  assert.match(await page.locator('#readOnlyBanner').innerText(), /Consultation seule/);
  ok('Consultation : bandeau « Consultation seule »');
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/consultation.png` });
  assert.ok(
    (await page.$$(EDIT_SELECTOR)).length >= 4,
    'des actions de modification existent dans la page'
  );
  assert.equal(await visibleEditActions(page), 0);
  await page.locator('[data-week-employee="a"]').click();
  assert.equal(await page.locator('#employeeWeekModal').isVisible(), true);
  assert.equal(await visibleEditActions(page), 0);
  await page.evaluate(() => closeEmployeeWeek());
  ok('Consultation : aucune action de modification visible (accueil et fenêtre semaine)');
  await page.click('#floatingSettings');
  assert.equal(await page.locator('[aria-label="Outils et réglages"]').isVisible(), false);
  assert.equal(await page.locator('[aria-label="Changer le PIN"]').isVisible(), true);
  await page.keyboard.press('Escape');
  ok('Consultation : pas d’accès à « Outils et réglages », changement de PIN possible');
  page.once('dialog', d => d.dismiss());
  await page.evaluate(() => toggleEmployerAssignment('a', 'farm', false));
  assert.deepEqual(await page.evaluate(() => window.rpcCalls), []);
  ok('Consultation : toute tentative de modification est bloquée avant le serveur');
  assert.equal(await page.locator('#exportSection').isVisible(), true);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Voir la synthèse' }).click();
  const doc = await popupPromise;
  await doc.locator('.print-team-recap').waitFor();
  assert.match(await doc.locator('.print-team-recap').innerText(), /Salarié A/);
  await doc.close();
  ok('Consultation : export et « Voir la synthèse » disponibles');
  assert.deepEqual(viewer.errors, []);
  await viewer.context.close();

  // --- Compte admin ---
  const admin = await openPilotage('admin');
  page = admin.page;
  assert.equal(await page.locator('#readOnlyBanner').isVisible(), false);
  assert.ok((await visibleEditActions(page)) >= 3);
  ok('Admin : pas de bandeau, actions de modification visibles');
  await page.click('#floatingSettings');
  await page.click('[aria-label="Outils et réglages"]');
  await page.locator('#viewerList .viewer-row').waitFor();
  assert.match(await page.locator('#viewerList').innerText(), /Comptable[\s\S]*Désactiver/);
  await page.fill('#viewerLabel', 'Expert-comptable');
  await page.fill('#viewerPin', '4321');
  await page.fill('#viewerPin2', '4321');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  await page.locator('#viewerLink').waitFor();
  assert.match(
    await page.inputValue('#viewerLink'),
    new RegExp(`/pilotage\\.html\\?access=${'a'.repeat(48)}$`)
  );
  assert.match(await page.locator('#viewerCreated').innerText(), /PIN séparément/);
  assert.equal(await page.inputValue('#viewerPin'), '');
  ok('Admin : création d’un compte en consultation, lien prêt à envoyer, PIN effacé du formulaire');
  if (process.env.SCREENSHOT_DIR)
    await page
      .locator('#viewerPanel')
      .screenshot({ path: `${process.env.SCREENSHOT_DIR}/comptes-consultation.png` });
  page.once('dialog', d => d.dismiss());
  await page.fill('#viewerLabel', 'Test');
  await page.fill('#viewerPin', '4321');
  await page.fill('#viewerPin2', '9999');
  await page.getByRole('button', { name: 'Créer le compte' }).click();
  assert.equal(
    (await page.evaluate(() => window.rpcCalls)).filter(n => n === 'api_owner_create_viewer')
      .length,
    1
  );
  ok('Admin : PIN de confirmation différent refusé');
  assert.deepEqual(admin.errors, []);
  ok('Aucune erreur JavaScript');
  await admin.context.close();
  console.log(`\n${count} contrôles du mode consultation passés.`);
} finally {
  await browser.close();
  server.close();
}

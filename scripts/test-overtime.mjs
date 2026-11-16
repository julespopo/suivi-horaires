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
await page.clock.install({ time: new Date('2026-11-20T10:00:00+01:00') });

// Salarié A : contrat 41h, deux employeurs. Salarié B : seuil 35h, un employeur.
const fixture = () => {
  EMPLOYEES = [
    { id: 'a', name: 'Salarié A', weeklyObjectiveMinutes: 2460, overtimeThresholdMinutes: 2460 },
    { id: 'b', name: 'Salarié B', weeklyObjectiveMinutes: 2100, overtimeThresholdMinutes: 2100 }
  ];
  APP_DATA = { entries: [], settings: { plannedDays: {}, employeeSettings: {} } };
  hydrateEmployeeSettings();
  V2_DATA = {
    employers: [
      { id: 'farm', name: 'Ferme', active: true },
      { id: 'wood', name: 'Bois', active: true }
    ],
    assignments: [],
    segments: [],
    leaves: []
  };
  const add = (employeeId, date, segments, pause) => {
    APP_DATA.entries.push({
      employeeId,
      date,
      status: 'worked',
      arrival: segments[0][0],
      departure: segments.at(-1)[1],
      pause,
      pauseMode: 'manual',
      comment: '',
      validationStatus: 'validated'
    });
    segments.forEach(([start, end, employerId = 'farm'], i) =>
      V2_DATA.segments.push({
        id: `${employeeId}-${date}-${i}`,
        employeeId,
        date,
        employerId,
        employerName: employerId === 'wood' ? 'Bois' : 'Ferme',
        start,
        end
      })
    );
  };
  // Semaine du 2 nov. : 5 × 9h = 45h → 4h supp (Ferme 41h, Bois 4h)
  ['02', '03', '04', '05'].forEach(d => add('a', `2026-11-${d}`, [['07:00', '17:00']], 60));
  add(
    'a',
    '2026-11-06',
    [
      ['07:00', '12:00'],
      ['12:00', '16:00', 'wood']
    ],
    0
  );
  // Semaine du 9 nov. : 42h → 1h supp
  ['09', '10', '11', '12', '13', '14'].forEach(d =>
    add('a', `2026-11-${d}`, [['08:00', '15:00']], 0)
  );
  // Semaine du 30 nov. (jeudi 3 déc.) : 50h, rattachée à décembre
  ['30'].forEach(d => add('a', `2026-11-${d}`, [['06:00', '16:00']], 0));
  ['01', '02', '03', '04'].forEach(d => add('a', `2026-12-${d}`, [['06:00', '16:00']], 0));
  // Salarié B : 36h la semaine du 2 nov. → 1h supp au-dessus de 35h
  ['02', '03', '04', '05'].forEach(d => add('b', `2026-11-${d}`, [['08:00', '17:00', 'wood']], 0));
  getSession = () => ({ sessionToken: 'fixture-owner' });
  loadOwnerData = async () => {};
  invalidView.classList.add('hidden');
  appView.classList.remove('hidden');
  applyTheme('light');
  renderOwner();
};
let count = 0;
const ok = name => {
  count++;
  console.log('✓ ' + name);
};
try {
  await page.goto(base + '/pilotage.html');
  await page.evaluate(fixture);
  const r = await page.evaluate(() => ({
    weekA1: weeklyOvertimeMinutes('a', dateObjFromIso('2026-11-02')),
    novA: monthOvertimeMinutes('a', 2026, 10),
    decA: monthOvertimeMinutes('a', 2026, 11),
    bankA: thirteenthMonthMinutes('a', 2026),
    novB: monthOvertimeMinutes('b', 2026, 10),
    split: Object.fromEntries(
      [
        ...employerTotalsFor('a', new Date(2026, 10, 2, 12), new Date(2026, 10, 8, 12)).values()
      ].map(x => [x.name, x.minutes])
    )
  }));
  assert.equal(r.weekA1, 240);
  ok('Heures supp hebdo au-delà de 41h');
  assert.equal(r.novA, 300);
  ok('Cumul mensuel (semaine à cheval rattachée au jeudi)');
  assert.equal(r.decA, 540);
  ok('Semaine du 30 novembre comptée en décembre');
  assert.equal(r.bankA, 840);
  ok('Cagnotte 13e mois annuelle');
  assert.equal(r.novB, 60);
  ok('Seuil propre à chaque salarié');
  assert.deepEqual(r.split, { Ferme: 41 * 60, Bois: 4 * 60 });
  ok('Répartition par employeur avec pause au prorata');

  const cardA = await page.locator('[data-week-employee="a"]').innerText();
  assert.match(cardA, /Heures supp \(mois\)\s*5h00/);
  assert.match(cardA, /Cagnotte 13e mois 2026\s*5h00/);
  ok('Cartes Pilotage : heures supp du mois et cagnotte à date');

  await page.evaluate(() => buildPrintReport('2026-11', 'all'));
  const recap = page.locator('#printReport .print-team-recap');
  assert.equal(await recap.count(), 1);
  const recapText = await recap.innerText();
  assert.match(recapText, /Heures par employeur/);
  assert.match(recapText, /Bois[\s\S]*Ferme/);
  assert.match(recapText, /Cagnotte 13e mois 2026/);
  assert.match(recapText, /Total équipe/);
  ok('PDF équipe : page de synthèse globale en tête');
  const empText = await page
    .locator('#printReport .print-employee:not(.print-team-recap)')
    .first()
    .innerText();
  assert.match(empText, /Heures supp du mois\s*5h00/);
  assert.match(empText, /Par employeur/);
  assert.match(empText, /\+4h00 supp/);
  ok('PDF salarié : compteurs et ligne par employeur');
  await page.evaluate(() => buildPrintReport('2026-11', 'a'));
  assert.equal(await page.locator('#printReport .print-team-recap').count(), 0);
  ok('Pas de page équipe pour un relevé individuel');
  if (process.env.SCREENSHOT) {
    await page.evaluate(() => buildPrintReport('2026-11', 'all'));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: process.env.SCREENSHOT, format: 'A4' });
  }
  assert.deepEqual(errors, []);
  ok('Aucune erreur JavaScript');
  console.log(`\n${count} contrôles heures supp / 13e mois passés.`);
} finally {
  await browser.close();
  server.close();
}

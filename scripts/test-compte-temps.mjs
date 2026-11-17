// Compte temps (Pilotage) : semaines au-delà du seuil, RTT déduits, remise à zéro au 1er mai,
// affichage sur les cartes, relevé PDF salarié et page de synthèse équipe.
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

// Salarié A : contrat 41 h, deux employeurs. Salarié B : seuil 35 h, un employeur.
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
    leaves: [
      // A : un RTT journée (−8h12) et un RTT après-midi (−4h06) la semaine du 16 nov.
      {
        id: 'r1',
        employeeId: 'a',
        startDate: '2026-11-17',
        endDate: '2026-11-17',
        type: 'rtt',
        status: 'validated'
      },
      {
        id: 'r2',
        employeeId: 'a',
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        type: 'rtt_afternoon',
        status: 'validated'
      },
      // A : RTT en attente, et congé payé validé → ne comptent pas
      {
        id: 'r3',
        employeeId: 'a',
        startDate: '2026-11-19',
        endDate: '2026-11-19',
        type: 'rtt',
        status: 'pending'
      },
      {
        id: 'c1',
        employeeId: 'a',
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        type: 'paid_leave',
        status: 'validated'
      },
      // B : RTT du vendredi au lundi → seuls vendredi et lundi comptent (2 × 7h00)
      {
        id: 'r4',
        employeeId: 'b',
        startDate: '2026-11-20',
        endDate: '2026-11-23',
        type: 'rtt',
        status: 'validated'
      }
    ]
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
  // Semaine du 2 nov. : 5 × 9 h = 45 h → +4 h (Ferme 41 h, Bois 4 h)
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
  // Semaine du 9 nov. : 6 × 7 h = 42 h → +1 h
  ['09', '10', '11', '12', '13', '14'].forEach(d =>
    add('a', `2026-11-${d}`, [['08:00', '15:00']], 0)
  );
  // Semaine du 30 nov. (jeudi 3 déc.) : 50 h → +9 h, rattachée à décembre
  add('a', '2026-11-30', [['06:00', '16:00']], 0);
  ['01', '02', '03', '04'].forEach(d => add('a', `2026-12-${d}`, [['06:00', '16:00']], 0));
  // Salarié B : 36 h la semaine du 2 nov. → +1 h au-dessus de 35 h
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
    week: weekExcessMinutes('a', dateObjFromIso('2026-11-02')),
    novA: compteTempsMonth('a', 2026, 10),
    decA: compteTempsMonth('a', 2026, 11),
    soldeNovA: compteTempsBalance('a', '2026-11-30'),
    soldeDecA: compteTempsBalance('a', '2026-12-31'),
    novB: compteTempsMonth('b', 2026, 10),
    weekendRtt: rttDebitForDate('b', '2026-11-21'),
    periods: ['2026-11-20', '2027-04-30', '2027-05-01'].map(compteTempsPeriodStart),
    afterReset: compteTempsBalance('a', '2027-05-31'),
    split: Object.fromEntries(
      [
        ...employerTotalsFor('a', new Date(2026, 10, 2, 12), new Date(2026, 10, 8, 12)).values()
      ].map(x => [x.name, x.minutes])
    )
  }));
  assert.equal(r.week, 240);
  ok('Semaine au-delà de 41 h : +4h00');
  assert.deepEqual(r.novA, { acquis: 300, rtt: 492 + 246, net: 300 - 738 });
  ok('Mois : heures en plus − RTT journée (8h12) − RTT après-midi (4h06)');
  ok('RTT en attente et congé payé ne sont pas déduits');
  assert.deepEqual(r.decA, { acquis: 540, rtt: 0, net: 540 });
  ok('Semaine du 30 novembre comptée en décembre');
  assert.equal(r.soldeNovA.net, -438);
  assert.equal(r.soldeDecA.net, 102);
  ok('Solde cumulé depuis le 1er mai');
  assert.deepEqual(r.novB, { acquis: 60, rtt: 840, net: -780 });
  assert.equal(r.weekendRtt, 0);
  ok('RTT : week-end non déduit, valeur selon le seuil du salarié (35 h → 7h00)');
  assert.deepEqual(r.periods, ['2026-05-01', '2026-05-01', '2027-05-01']);
  assert.deepEqual(r.afterReset, { acquis: 0, rtt: 0, net: 0 });
  ok('Remise à zéro au 1er mai');
  assert.deepEqual(r.split, { Ferme: 41 * 60, Bois: 4 * 60 });
  ok('Répartition par employeur avec pause au prorata');

  const cardA = await page.locator('[data-week-employee="a"]').innerText();
  assert.match(cardA, /Compte temps\s*depuis le 01\/05\s*−7h18/);
  assert.doesNotMatch(cardA, /13e mois|Heures supp/);
  assert.equal(
    await page.locator('[data-week-employee="a"] .kpi-compte-temps strong.text-warning').count(),
    1
  );
  ok('Carte Pilotage : une seule ligne « Compte temps » à date');

  await page.evaluate(() => buildPrintReport('2026-11', 'all'));
  const recap = await page.locator('#printReport .print-team-recap').innerText();
  assert.match(recap, /Heures par employeur/);
  assert.match(recap, /Compte temps du mois/);
  assert.match(recap, /Compte temps au 30\/11/);
  assert.match(recap, /Total équipe/);
  assert.doesNotMatch(recap, /13e mois|Cagnotte/);
  ok('PDF équipe : compte temps du mois et solde');
  const empText = await page
    .locator('#printReport .print-employee:not(.print-team-recap)')
    .first()
    .innerText();
  assert.match(empText, /Compte temps du mois\s*−7h18/);
  assert.match(empText, /Compte temps au 30\/11\s*−7h18/);
  assert.match(empText, /\+4h00 au compte temps/);
  assert.match(empText, /−12h18 de RTT/);
  assert.match(empText, /Par employeur/);
  assert.doesNotMatch(empText, /13e mois|Cagnotte/);
  ok('PDF salarié : compte temps du mois, solde, détail des RTT et des semaines');
  await page.evaluate(() => buildPrintReport('2026-11', 'a'));
  assert.equal(await page.locator('#printReport .print-team-recap').count(), 0);
  ok('Pas de page équipe pour un relevé individuel');
  if (process.env.SCREENSHOT_DIR) {
    await page
      .locator('[data-week-employee="a"]')
      .screenshot({ path: `${process.env.SCREENSHOT_DIR}/carte.png` });
    await page.evaluate(() => buildPrintReport('2026-11', 'all'));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf.png`, fullPage: false });
  }
  assert.deepEqual(errors, []);
  ok('Aucune erreur JavaScript');
  console.log(`\n${count} contrôles compte temps passés.`);
} finally {
  await browser.close();
  server.close();
}

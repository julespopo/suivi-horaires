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
  assert.deepEqual(r.afterReset, { acquis: 0, rtt: 0, report: 0, net: 0 });
  ok('Remise à zéro au 1er mai');

  // Reports saisis par le Pilotage
  const rep = await page.evaluate(() => {
    COMPTE_TEMPS_REPORTS = [
      { employeeId: 'a', effectiveDate: '2026-11-01', minutes: 354, note: 'Report' },
      { employeeId: 'a', effectiveDate: '2026-04-30', minutes: 999, note: 'Période précédente' }
    ];
    return {
      date: compteTempsReportDate(compteTempsPeriodStart('2026-11-20')),
      nextDate: compteTempsReportDate('2027-05-01'),
      solde: compteTempsBalance('a', '2026-11-30'),
      mois: compteTempsMonth('a', 2026, 10),
      parse: ['5,9', '5.9', '5h54', '-3h30', '−3h30', '+12', '30,8', '', ' 7 h 05 ', 'abc'].map(
        parseHoursInput
      )
    };
  });
  assert.equal(rep.date, '2026-11-01');
  assert.equal(rep.nextDate, '2027-05-01');
  assert.deepEqual(rep.solde, { acquis: 300, rtt: 738, report: 354, net: -438 + 354 });
  assert.equal(rep.mois.net, -438);
  ok('Report au 01/11 ajouté au solde, pas au compte du mois ; période précédente ignorée');
  assert.deepEqual(rep.parse.slice(0, 9), [354, 354, 354, -210, -210, 720, 1848, 0, 425]);
  assert.ok(Number.isNaN(rep.parse[9]));
  ok('Saisie du report : 5,9 · 5h54 · -3h30 · 30,8 acceptés, texte illisible refusé');
  await page.evaluate(() => (COMPTE_TEMPS_REPORTS = []));
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
  const employerPages = page.locator('#printReport .print-employer-page');
  assert.equal(await employerPages.count(), 2);
  const [bois, ferme] = [
    await employerPages.nth(0).innerText(),
    await employerPages.nth(1).innerText()
  ];
  assert.match(bois, /Synthèse par employeur\s*Bois/);
  assert.match(bois, /Salarié A[\s\S]*4h00/);
  assert.match(bois, /Salarié B[\s\S]*36h00/);
  assert.match(bois, /Total[\s\S]*40h00/);
  assert.match(ferme, /Synthèse par employeur\s*Ferme/);
  assert.match(ferme, /Heures du mois\s*93h00/);
  assert.doesNotMatch(ferme, /Salarié B/);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('#printReport > article')].map(a =>
      a.classList.contains('print-team-recap')
        ? 'équipe'
        : a.classList.contains('print-employer-page')
          ? 'employeur'
          : 'salarié'
    )
  );
  assert.deepEqual(order, ['équipe', 'employeur', 'employeur', 'salarié', 'salarié']);
  ok('PDF : une page par employeur (heures par salarié et par semaine), après la synthèse');
  const empText = await page
    .locator('#printReport .print-employee:not(.print-team-recap):not(.print-employer-page)')
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
  assert.equal(await page.locator('#printReport .print-employer-page').count(), 0);
  ok('Pas de page équipe pour un relevé individuel');

  // Export en bas de l'accueil : toute l'équipe / un salarié / un employeur
  const exportSection = page.locator('main #exportSection');
  assert.equal(await exportSection.count(), 1);
  assert.equal(
    await page.evaluate(
      () =>
        document.getElementById('exportSection') ===
        document.querySelector('main > section.card:last-of-type')
    ),
    true
  );
  assert.equal(await page.locator('#ownerToolsModal').getByText('Exporter en PDF').count(), 0);
  assert.equal(await page.locator('#pdfExportModal').count(), 0);
  const options = await page.$$eval('#pdfExportTarget option', os =>
    os.map(o => [o.value, o.textContent, o.parentElement.label || ''])
  );
  assert.deepEqual(options, [
    ['all', 'Toute l’équipe', ''],
    ['a', 'Salarié A', 'Un salarié'],
    ['b', 'Salarié B', 'Un salarié'],
    ['employer:wood', 'Bois', 'Un employeur'],
    ['employer:farm', 'Ferme', 'Un employeur']
  ]);
  assert.equal(await page.inputValue('#pdfExportMonth'), '2026-11');
  ok('Export : section en bas de l’accueil, choix équipe / salarié / employeur, mois en cours');
  await page.evaluate(() => {
    window.printed = [];
    window.print = () => window.printed.push(document.title);
  });
  await page.selectOption('#pdfExportTarget', 'employer:wood');
  assert.match(await page.locator('#pdfExportHint').innerText(), /remettre/);
  await page.evaluate(() => generateMonthlyPDF());
  await page.waitForFunction(() => window.printed.length === 1);
  assert.deepEqual(await page.evaluate(() => window.printed), [
    'Releve-horaires-novembre-2026-Bois'
  ]);
  assert.equal(await page.locator('#printReport .print-employer-page').count(), 1);
  assert.equal(await page.locator('#printReport .print-team-recap').count(), 0);
  const employerOrder = await page.$$eval('#printReport > article', as =>
    as.map(a =>
      a.classList.contains('print-employer-page') ? 'employeur' : a.querySelector('h1').textContent
    )
  );
  assert.deepEqual(employerOrder, ['employeur', 'Salarié A', 'Salarié B']);
  const detailA = await page.locator('#printReport .print-employer-employee').nth(0).innerText();
  assert.match(detailA, /Bois · détail par salarié\s*Salarié A/);
  assert.match(detailA, /Heures chez Bois\s*4h00/);
  assert.match(detailA, /ven\. 06\/11\s*12:00 → 16:00\s*4h00/);
  assert.doesNotMatch(detailA, /07:00|Ferme|Compte temps/);
  const detailB = await page.locator('#printReport .print-employer-employee').nth(1).innerText();
  assert.match(detailB, /Heures chez Bois\s*36h00/);
  assert.match(detailB, /Journées\s*4/);
  assert.match(detailB, /Semaine du 02\/11\s*36h00 chez Bois/);
  assert.match(
    await page.locator('#printReport .print-employer-page').innerText(),
    /Bois[\s\S]*Total[\s\S]*40h00/
  );
  ok(
    'Export employeur : sa page puis une page par salarié, avec le détail chez cet employeur seulement'
  );
  if (process.env.SCREENSHOT_DIR) {
    await page.emulateMedia({ media: 'print' });
    await page
      .locator('#printReport .print-employer-employee')
      .nth(1)
      .screenshot({ path: `${process.env.SCREENSHOT_DIR}/detail-employeur.png` });
    await page.emulateMedia({ media: 'screen' });
  }
  await page.evaluate(() => buildPrintReport('2026-10', 'employer:wood'));
  assert.match(
    await page.locator('#printReport .print-employer-page').innerText(),
    /Aucune heure saisie pour cet employeur/
  );
  assert.equal(await page.locator('#printReport .print-employer-employee').count(), 0);
  ok('Export employeur sans heures : page explicite');
  await page.selectOption('#pdfExportTarget', 'b');
  await page.evaluate(() => generateMonthlyPDF());
  await page.waitForFunction(() => window.printed.length === 2);
  assert.equal(
    await page.evaluate(() => window.printed[1]),
    'Releve-horaires-novembre-2026-Salarie-B'
  );
  assert.equal(await page.locator('#printReport article').count(), 1);
  ok('Export salarié : son relevé seul');

  // Aperçu dans le site (« Voir la synthèse »), identique au PDF
  await page.selectOption('#pdfExportTarget', 'all');
  await page.getByRole('button', { name: 'Voir la synthèse' }).click();
  assert.equal(
    await page.locator('#reportPreviewModal').evaluate(m => m.classList.contains('open')),
    true
  );
  assert.equal(await page.locator('#reportPreviewTitle').innerText(), 'Synthèse · Toute l’équipe');
  assert.match(await page.locator('#reportPreviewSubtitle').innerText(), /novembre 2026/i);
  const preview = page.frameLocator('#reportPreviewFrame');
  await preview.locator('.print-team-recap').waitFor();
  assert.equal(
    await preview.locator('article').count(),
    await page.locator('#printReport article').count()
  );
  assert.match(
    await preview.locator('.print-team-recap').innerText(),
    /Heures par employeur[\s\S]*Total équipe/
  );
  const look = await preview
    .locator('.print-employee')
    .first()
    .evaluate(a => {
      const s = getComputedStyle(a),
        table = a.querySelector('table');
      return {
        bg: s.backgroundColor,
        report: getComputedStyle(a.parentElement).display,
        border: getComputedStyle(table.querySelector('th')).borderTopStyle
      };
    });
  assert.deepEqual(look, { bg: 'rgb(255, 255, 255)', report: 'block', border: 'solid' });
  ok('Aperçu : synthèse affichée dans le site, mêmes pages et mise en page que le PDF');
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/apercu-ordi.png` });
  await page.keyboard.press('Escape');
  assert.equal(
    await page.locator('#reportPreviewModal').evaluate(m => m.classList.contains('open')),
    false
  );
  ok('Aperçu : Échap le ferme');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.selectOption('#pdfExportTarget', 'employer:wood');
  await page.getByRole('button', { name: 'Voir la synthèse' }).click();
  await preview.locator('.print-employer-page').waitFor();
  const zoom = await preview.locator('body').evaluate(b => Number(b.style.zoom));
  assert.ok(zoom > 0.3 && zoom < 0.6, `zoom téléphone ${zoom}`);
  assert.equal(await preview.locator('.print-employer-employee').count(), 2);
  ok('Aperçu sur téléphone : pages réduites pour tenir dans l’écran');
  if (process.env.SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/apercu-mobile.png` });
  await page.evaluate(() => closeReportPreview());
  await page.setViewportSize({ width: 1100, height: 900 });

  // Saisie du report dans « Réglages du temps de travail »
  await page.evaluate(() => {
    window.savedReports = [];
    setEmployeeSettings = async () => {};
    ownerSetCompteTempsReport = async (...args) => {
      window.savedReports.push(args);
      COMPTE_TEMPS_REPORTS = [
        { employeeId: args[0], effectiveDate: args[1], minutes: args[2], note: args[3] }
      ];
    };
    loadOwnerData = async () => {};
    openSettings();
  });
  assert.match(
    await page.locator('#settingsModal').innerText(),
    /Report du compte temps au 01\/11/
  );
  await page.fill('[data-report="a"]', '5,9');
  await page.evaluate(() => saveSettings());
  await page.waitForFunction(() => !saving);
  assert.deepEqual(await page.evaluate(() => window.savedReports), [
    ['a', '2026-11-01', 354, 'Report du compte temps']
  ]);
  assert.match(
    await page.locator('[data-week-employee="a"]').innerText(),
    /Compte temps[\s\S]*−1h24/
  );
  await page.evaluate(() => openSettings());
  assert.equal(await page.inputValue('[data-report="a"]'), '+5h54');
  ok('Réglages : report saisi « 5,9 » enregistré au 01/11 (5h54) et repris dans le solde');
  await page.fill('[data-report="b"]', 'n importe quoi');
  page.once('dialog', d => d.dismiss());
  await page.evaluate(() => saveSettings());
  assert.equal(await page.evaluate(() => window.savedReports.length), 1);
  ok('Réglages : saisie illisible refusée sans rien enregistrer');
  if (process.env.SCREENSHOT_DIR) {
    await page
      .locator('[data-week-employee="a"]')
      .screenshot({ path: `${process.env.SCREENSHOT_DIR}/carte.png` });
    await page.evaluate(() => buildPrintReport('2026-11', 'all'));
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 794, height: 1123 });
    await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/pdf.png`, fullPage: false });
    await page
      .locator('#printReport .print-employer-page')
      .first()
      .screenshot({ path: `${process.env.SCREENSHOT_DIR}/employeur.png` });
  }
  assert.deepEqual(errors, []);
  ok('Aucune erreur JavaScript');
  console.log(`\n${count} contrôles compte temps passés.`);
} finally {
  await browser.close();
  server.close();
}

const params = new URLSearchParams(location.search);
const OWNER_LINK_KEY = 'hours_owner_link_token_v1';
let linkToken =
  params.get('access') || params.get('token') || localStorage.getItem(OWNER_LINK_KEY) || '';
if (params.get('access') || params.get('token')) localStorage.setItem(OWNER_LINK_KEY, linkToken);
let completionCursor = new Date(),
  planningDate = '',
  ownerEditEmployee = '',
  ownerEditDate = '',
  saving = false,
  planningView = 'month',
  planningSelectionMode = false,
  selectedPlanningDates = new Set();
if (!linkToken) {
  invalidView.classList.remove('hidden');
} else {
  bootOwner();
}
async function bootOwner() {
  if (isOwnerSession(linkToken)) {
    try {
      await loadOwnerData();
      showApp();
      return;
    } catch (e) {
      clearSession();
    }
  }
  authView.classList.remove('hidden');
}
function openOwnerTools() {
  document.getElementById('ownerToolsModal')?.classList.add('open');
}
function closeOwnerTools() {
  document.getElementById('ownerToolsModal')?.classList.remove('open');
}
async function login() {
  if (saving) return;
  pinError.textContent = '';
  const v = pin.value.replace(/\D/g, '');
  if (v.length !== 4) {
    pinError.textContent = 'Entrez les 4 chiffres du PIN.';
    return;
  }
  saving = true;
  loginBtn.disabled = true;
  loginBtn.textContent = 'Connexion…';
  try {
    await ownerLogin(linkToken, v);
    await loadOwnerData();
    showApp();
  } catch (e) {
    const msg = friendlyError(e);
    pinError.textContent =
      msg === 'Une erreur est survenue. Réessayez.' &&
      (e?.status === 400 || e?.status === 401 || e?.status === 403)
        ? 'PIN incorrect.'
        : msg;
  } finally {
    saving = false;
    loginBtn.disabled = false;
    loginBtn.textContent = 'Continuer';
  }
}
pin?.addEventListener('input', () => (pin.value = pin.value.replace(/\D/g, '').slice(0, 4)));
pin?.addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});
loginBtn?.addEventListener('click', login);
function showApp() {
  authView.classList.add('hidden');
  appView.classList.remove('hidden');
  floatingSettings.classList.remove('hidden');
  renderOwner();
  refreshOwnerPushUI();
}
async function withOwnerSave(fn) {
  if (saving) return;
  saving = true;
  document.body.classList.add('is-saving');
  try {
    await fn();
  } catch (e) {
    if (String(e.message).includes('unauthorized')) {
      clearSession();
      location.reload();
      return;
    }
    alert(friendlyError(e));
  } finally {
    saving = false;
    document.body.classList.remove('is-saving');
  }
}

async function refreshOwnerPushUI() {
  if (!ownerPushStatus) return;
  if (!pushSupported()) {
    ownerPushStatus.textContent = 'Non compatible';
    ownerPushStatus.className = 'status warn';
    ownerPushToggleBtn.disabled = true;
    ownerPushHelp.textContent = 'Ce navigateur ne prend pas en charge les notifications push.';
    return;
  }
  const ua = navigator.userAgent || '';
  const isiOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isiOS && !isStandalonePWA()) {
    ownerPushStatus.textContent = 'Installation requise';
    ownerPushStatus.className = 'status warn';
    ownerPushToggleBtn.textContent = 'Activer les notifications';
    ownerPushTestBtn.classList.add('hidden');
    ownerPushHelp.textContent =
      'Sur iPhone : Partager → Ajouter à l’écran d’accueil, puis ouvre le pilotage depuis son icône.';
    return;
  }
  const enabled = await ownerPushEnabled();
  if (enabled && Notification.permission === 'granted') {
    ownerPushStatus.textContent = 'Activées';
    ownerPushStatus.className = 'status ok';
    ownerPushToggleBtn.textContent = 'Désactiver les notifications';
    ownerPushToggleBtn.className = 'btn btn-outline';
    ownerPushTestBtn.classList.remove('hidden');
    ownerPushHelp.textContent =
      'À 19h, une synthèse est envoyée s’il y a au moins un employé prévu au travail.';
  } else {
    ownerPushStatus.textContent = Notification.permission === 'denied' ? 'Bloquées' : 'Désactivées';
    ownerPushStatus.className =
      'status ' + (Notification.permission === 'denied' ? 'warn' : 'neutral');
    ownerPushToggleBtn.textContent = 'Activer les notifications';
    ownerPushToggleBtn.className = 'btn btn-primary';
    ownerPushTestBtn.classList.add('hidden');
    ownerPushHelp.textContent =
      Notification.permission === 'denied'
        ? 'Réactive les notifications dans les réglages du navigateur ou du téléphone.'
        : 'Aucune synthèse n’est envoyée tant que tu ne les actives pas.';
  }
}
async function toggleOwnerPushSummary() {
  ownerPushToggleBtn.disabled = true;
  try {
    const enabled = await ownerPushEnabled();
    if (enabled) await disableOwnerPushSummary();
    else await enableOwnerPushSummary();
    await refreshOwnerPushUI();
  } catch (e) {
    alert(friendlyError(e));
    await refreshOwnerPushUI();
  } finally {
    ownerPushToggleBtn.disabled = false;
  }
}
async function testOwnerPushSummary() {
  try {
    await showOwnerLocalTestNotification();
  } catch (e) {
    alert(friendlyError(e));
  }
}

function toggleLog() {
  const open = logPanel.classList.contains('hidden');
  logPanel.classList.toggle('hidden', !open);
  logToggleBtn.textContent = open ? 'Masquer' : 'Afficher';
}
function renderTeamChart(target, values, showObjective = false) {
  const max = Math.max(...values.map(x => Math.max(x.minutes, x.objective || 0)), 1);
  target.innerHTML = values
    .map(x => {
      const pct = Math.max(3, Math.round((x.minutes / max) * 100));
      const objectivePct = x.objective ? Math.min(100, Math.round((x.objective / max) * 100)) : 0;
      return `<div class="team-chart-row"><div class="team-chart-head"><strong>${ownerEscape(x.name)}</strong><span>${fmtMin(x.minutes)}${showObjective ? ` <small class="chart-delta ${x.minutes >= x.objective ? 'positive' : 'negative'}">${fmtSignedMin(x.minutes - x.objective)}</small>` : ''}</span></div><div class="team-chart-track"><div class="team-chart-fill" style="width:${pct}%"></div>${showObjective ? `<i class="objective-marker" style="left:${objectivePct}%" title="Objectif ${fmtMin(x.objective)}"></i>` : ''}</div></div>`;
    })
    .join('');
}
function planningWeekBounds(ref = completionCursor) {
  const start = startOfWeek(ref),
    end = endOfWeek(ref);
  return [start, end];
}
function setPlanningView(view) {
  planningView = view === 'week' ? 'week' : 'month';
  planningMonthBtn.classList.toggle('active-chip', planningView === 'month');
  planningWeekBtn.classList.toggle('active-chip', planningView === 'week');
  selectedPlanningDates.clear();
  syncPlanningSelectionUi();
  renderCompletionCalendar();
}
function shiftPlanningPeriod(step) {
  if (planningView === 'week') {
    completionCursor = new Date(completionCursor);
    completionCursor.setDate(completionCursor.getDate() + step * 7);
  } else {
    completionCursor = new Date(
      completionCursor.getFullYear(),
      completionCursor.getMonth() + step,
      1,
      12
    );
  }
  const min = dateObjFromIso(APP_START_DATE);
  if (completionCursor < min) completionCursor = new Date(min);
  selectedPlanningDates.clear();
  syncPlanningSelectionUi();
  renderCompletionCalendar();
}
function togglePlanningSelectionMode() {
  planningSelectionMode = !planningSelectionMode;
  if (!planningSelectionMode) selectedPlanningDates.clear();
  syncPlanningSelectionUi();
  renderCompletionCalendar();
}
function clearPlanningSelection() {
  selectedPlanningDates.clear();
  planningSelectionMode = false;
  syncPlanningSelectionUi();
  renderCompletionCalendar();
}
function togglePlanningDateSelection(date) {
  if (selectedPlanningDates.has(date)) selectedPlanningDates.delete(date);
  else selectedPlanningDates.add(date);
  syncPlanningSelectionUi();
  renderCompletionCalendar();
}
function syncPlanningSelectionUi() {
  if (!multiSelectBtn) return;
  multiSelectBtn.classList.toggle('active-chip', planningSelectionMode);
  multiSelectBtn.textContent = planningSelectionMode
    ? 'Terminer la sélection'
    : 'Sélection multiple';
  bulkPlanningBar.classList.toggle('hidden', !planningSelectionMode);
  const n = selectedPlanningDates.size;
  bulkPlanningCount.textContent = `${n} jour${n > 1 ? 's' : ''} sélectionné${n > 1 ? 's' : ''}`;
}
async function setSelectedDaysWorking() {
  const dates = [...selectedPlanningDates].sort();
  if (!dates.length) return;
  if (
    !confirm(
      `Mettre ${dates.length} jour${dates.length > 1 ? 's' : ''} en travaillé pour toute l’équipe ?`
    )
  )
    return;
  await withOwnerSave(async () => {
    for (const date of dates) {
      for (const emp of EMPLOYEES) await setPlannedWorkingDay(emp.id, date, true);
    }
    await loadOwnerData();
    selectedPlanningDates.clear();
    planningSelectionMode = false;
    syncPlanningSelectionUi();
    renderOwner();
  });
}
async function setSelectedDaysNonWorking() {
  const dates = [...selectedPlanningDates].sort();
  if (!dates.length) return;
  if (
    !confirm(
      `Mettre ${dates.length} jour${dates.length > 1 ? 's' : ''} en non travaillé pour toute l’équipe ?`
    )
  )
    return;
  await withOwnerSave(async () => {
    for (const date of dates) {
      for (const emp of EMPLOYEES) await setPlannedWorkingDay(emp.id, date, false);
    }
    await loadOwnerData();
    selectedPlanningDates.clear();
    planningSelectionMode = false;
    syncPlanningSelectionUi();
    renderOwner();
  });
}

function renderCompletionCalendar() {
  let start,
    end,
    dates,
    blanks = '';
  if (planningView === 'week') {
    [start, end] = planningWeekBounds();
    dates = listDates(start, end);
    completionMonthLabel.textContent = `${shortDate(iso(start))} – ${shortDate(iso(end))}`;
  } else {
    start = new Date(completionCursor.getFullYear(), completionCursor.getMonth(), 1, 12);
    end = new Date(completionCursor.getFullYear(), completionCursor.getMonth() + 1, 0, 12);
    dates = listDates(start, end);
    completionMonthLabel.textContent = monthLabel(start);
    const firstDow = (start.getDay() + 6) % 7;
    blanks = Array.from({ length: firstDow }, () => '<div class="calendar-empty"></div>').join('');
  }
  const periodKey = planningView + ':' + iso(start);
  const previousScroll =
    completionCalendar.dataset.period === periodKey
      ? completionCalendar.querySelector('.completion-month-calendar,.planning-week-grid')
          ?.scrollLeft || 0
      : 0;
  const today = iso();
  const head = `<div class="calendar-head">${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => `<div>${d}</div>`).join('')}</div>`;
  const cells = dates
    .map(date => {
      const info = completionForDate(date),
        d = dateObjFromIso(date),
        selected = selectedPlanningDates.has(date);
      const cls = [
        'completion-day',
        info.kind,
        date === today ? 'today' : '',
        selected ? 'selected-for-bulk' : '',
        planningView === 'week' ? 'week-detail-day' : ''
      ]
        .filter(Boolean)
        .join(' ');
      const action = planningSelectionMode
        ? `togglePlanningDateSelection('${date}')`
        : `openPlanning('${date}')`;
      const names =
        planningView === 'week'
          ? `<div class="working-names">${info.planned.length ? info.planned.map(e => `<span>${ownerEscape(e.name)}</span>`).join('') : '<span class="nobody">Personne</span>'}</div>`
          : '';
      const holiday = publicHolidayName(date);
      const label = info.kind === 'weekend' ? (holiday ? 'Férié' : 'Repos') : info.label;
      return `<button class="${cls}" ${holiday ? `title="${ownerEscape(holiday)}"` : ''} onclick="${action}"><div class="completion-number">${planningView === 'week' ? new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' }).format(d) : d.getDate()}</div><div class="completion-label">${label}</div>${names}${planningSelectionMode ? `<div class="bulk-check">${selected ? '✓' : ''}</div>` : ''}</button>`;
    })
    .join('');
  completionCalendar.innerHTML = `<div class="${planningView === 'week' ? 'completion-week-calendar' : 'completion-month-calendar'}">${head}<div class="calendar-grid completion-grid ${planningView === 'week' ? 'planning-week-grid' : ''}">${blanks}${cells}</div></div>`;
  completionCalendar.dataset.period = periodKey;
  const scrollSurface = completionCalendar.querySelector(
    '.completion-month-calendar,.planning-week-grid'
  );
  if (scrollSurface) scrollSurface.scrollLeft = previousScroll;
}
function openPlanning(date) {
  planningDate = date;
  planningDateLabel.textContent =
    longDate(date) + (publicHolidayName(date) ? ` · ${publicHolidayName(date)}` : '');
  planningRows.innerHTML = EMPLOYEES.map(emp => planningRow(emp, date)).join('');
  planningModal.classList.add('open');
}

function setAllPlanning(value) {
  document.querySelectorAll('[data-plan-emp]').forEach(x => (x.checked = value));
}
async function savePlanning() {
  const changes = [...document.querySelectorAll('[data-plan-emp]')].map(x => ({
    empId: x.dataset.planEmp,
    value: x.checked
  }));
  await withOwnerSave(async () => {
    await Promise.all(changes.map(x => setPlannedWorkingDay(x.empId, planningDate, x.value)));
    await loadOwnerData();
    closePlanning();
    renderOwner();
  });
}
function closePlanning() {
  planningModal.classList.remove('open');
}
async function validateFromPlanning(empId, date) {
  await withOwnerSave(async () => {
    await validateEntry(empId, date);
    openPlanning(date);
    renderOwner();
  });
}

function closeOwnerEdit() {
  ownerEditModal.classList.remove('open');
}
function toggleOwnerFields() {
  ownerArrival.disabled = ownerOff.checked;
  ownerDeparture.disabled = ownerOff.checked;
  ownerPause.disabled = ownerOff.checked;
}
ownerOff?.addEventListener('change', toggleOwnerFields);

function currentReportDate() {
  return compteTempsReportDate(compteTempsPeriodStart(iso()));
}
function openSettings() {
  const reportDate = currentReportDate();
  settingsRows.innerHTML = EMPLOYEES.map(emp => {
    const s = employeeSettings(emp.id),
      report = compteTempsReportMinutes(emp.id, reportDate, reportDate);
    return `<div class="settings-row"><strong>${ownerEscape(emp.name)}</strong><div class="field"><label>Heures prévues par semaine</label><input type="number" min="0" step="0.25" data-objective="${emp.id}" value="${(s.weeklyObjectiveMinutes / 60).toFixed(2)}"></div><div class="field"><label>Signaler un dépassement à partir de</label><input type="number" min="0" step="0.25" data-threshold="${emp.id}" value="${(s.overtimeThresholdMinutes / 60).toFixed(2)}"></div><div class="field"><label>Report du compte temps au ${shortDate(reportDate)}</label><input type="text" inputmode="decimal" autocomplete="off" placeholder="ex. 5,9 ou 5h54" data-report="${emp.id}" value="${report ? fmtSignedMin(report) : ''}"></div></div>`;
  }).join('');
  settingsModal.classList.add('open');
}
function closeSettings() {
  settingsModal.classList.remove('open');
}
async function saveSettings() {
  const changes = EMPLOYEES.map(emp => ({
    empId: emp.id,
    weeklyObjectiveMinutes: Math.round(
      Number(document.querySelector(`[data-objective="${emp.id}"]`).value || 0) * 60
    ),
    overtimeThresholdMinutes: Math.round(
      Number(document.querySelector(`[data-threshold="${emp.id}"]`).value || 0) * 60
    )
  }));
  const reportDate = currentReportDate(),
    reports = [];
  for (const emp of EMPLOYEES) {
    const input = document.querySelector(`[data-report="${emp.id}"]`),
      minutes = parseHoursInput(input?.value);
    if (Number.isNaN(minutes)) {
      alert(`Report de ${emp.name} illisible. Exemples : 5,9 · 5h54 · -3h30`);
      input?.focus();
      return;
    }
    if (minutes !== compteTempsReportMinutes(emp.id, reportDate, reportDate))
      reports.push({ empId: emp.id, minutes });
  }
  await withOwnerSave(async () => {
    for (const change of changes) await setEmployeeSettings(change.empId, change);
    for (const r of reports)
      await ownerSetCompteTempsReport(r.empId, reportDate, r.minutes, 'Report du compte temps');
    if (reports.length) await loadOwnerData();
    closeSettings();
    renderOwner();
  });
}
// --- Export PDF (section en bas de l'accueil) ---
// « Pour » : toute l'équipe, un salarié (relevé détaillé) ou un employeur (sa page de synthèse).
const EXPORT_HINTS = {
  all: 'Synthèse de l’équipe, une page par employeur, puis le relevé détaillé de chaque salarié.',
  employee: 'Relevé détaillé jour par jour du salarié, avec son compte temps.',
  employer:
    'Synthèse de l’employeur (une ligne par salarié), puis le détail jour par jour de chaque salarié chez lui : document à lui remettre.'
};
function exportTargetKind(value) {
  return value === 'all' ? 'all' : String(value).startsWith('employer:') ? 'employer' : 'employee';
}
function renderExportControls() {
  const monthInput = document.getElementById('pdfExportMonth'),
    select = document.getElementById('pdfExportTarget');
  if (!monthInput || !select) return;
  if (!monthInput.value) {
    const now = new Date();
    monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  monthInput.min = String(APP_START_DATE || '').slice(0, 7);
  const previous = select.value || 'all',
    employers = V2_DATA.employers
      .filter(e => e.active)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  select.innerHTML =
    '<option value="all">Toute l’équipe</option>' +
    (EMPLOYEES.length
      ? `<optgroup label="Un salarié">${EMPLOYEES.map(emp => `<option value="${emp.id}">${ownerEscape(emp.name)}</option>`).join('')}</optgroup>`
      : '') +
    (employers.length
      ? `<optgroup label="Un employeur">${employers.map(e => `<option value="employer:${e.id}">${ownerEscape(e.name)}</option>`).join('')}</optgroup>`
      : '');
  select.value = [...select.options].some(o => o.value === previous) ? previous : 'all';
  const updateHint = () => {
    const hint = document.getElementById('pdfExportHint');
    if (hint)
      hint.textContent = `${EXPORT_HINTS[exportTargetKind(select.value)]} « Voir la synthèse » l’affiche ici ; « Créer le PDF » ouvre l’impression (choisir « Enregistrer au format PDF »).`;
  };
  select.onchange = updateHint;
  updateHint();
}
function pdfMonthBounds(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]) - 1;
  const start = new Date(year, month, 1, 12),
    end = new Date(year, month + 1, 0, 12);
  return { start, end };
}
function pdfFileToken(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// --- Aperçu de la synthèse dans le site ---
// Le relevé est construit comme pour le PDF, puis affiché dans un cadre qui reçoit les mêmes
// styles que l'impression (les règles « @media print » y sont appliquées à l'écran) : l'aperçu
// est donc identique au PDF, page par page.
const REPORT_PREVIEW_CSS = `
html,body{background:#e6e9ec!important;margin:0!important;color:#17211f}
.print-report{display:block!important;padding:14px 0 4px!important}
.print-employee{background:#fff;width:210mm;box-sizing:border-box;margin:0 auto 16px;padding:9mm 8mm 10mm;box-shadow:0 1px 3px rgba(0,0,0,.12),0 6px 18px rgba(0,0,0,.08);border-radius:3px}
.print-global-note{width:210mm;margin:0 auto 18px;box-sizing:border-box;padding:0 8mm}
`;
function reportPreviewStyles() {
  let css = '';
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of rules) {
      if (rule.type === CSSRule.MEDIA_RULE && /\bprint\b/.test(rule.media.mediaText))
        for (const inner of rule.cssRules) css += inner.cssText + '\n';
      else if (rule.type !== CSSRule.PAGE_RULE) css += rule.cssText + '\n';
    }
  }
  return css + REPORT_PREVIEW_CSS;
}
function fitReportPreview() {
  const frame = document.getElementById('reportPreviewFrame'),
    doc = frame?.contentDocument;
  if (!doc?.body) return;
  const pageWidth = (210 / 25.4) * 96 + 24; // A4 + marge
  doc.body.style.zoom = String(Math.min(1, frame.clientWidth / pageWidth));
}
function exportSelectionLabel(target) {
  const kind = exportTargetKind(target);
  if (kind === 'all') return 'Toute l’équipe';
  if (kind === 'employer')
    return employerFor(target.slice('employer:'.length))?.name || 'Employeur';
  return EMPLOYEES.find(e => e.id === target)?.name || 'Salarié';
}
function openReportPreview() {
  const monthValue = document.getElementById('pdfExportMonth')?.value || '',
    target = document.getElementById('pdfExportTarget')?.value || 'all',
    bounds = pdfMonthBounds(monthValue);
  if (!bounds) {
    alert('Choisis un mois à afficher.');
    return;
  }
  buildPrintReport(monthValue, target);
  const frame = document.getElementById('reportPreviewFrame');
  document.getElementById('reportPreviewTitle').textContent =
    `Synthèse · ${exportSelectionLabel(target)}`;
  document.getElementById('reportPreviewSubtitle').textContent = monthLabel(bounds.start);
  frame.onload = fitReportPreview;
  frame.srcdoc = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${reportPreviewStyles()}</style></head><body>${printReport.outerHTML}</body></html>`;
  document.getElementById('reportPreviewModal').classList.add('open');
}
function closeReportPreview() {
  document.getElementById('reportPreviewModal')?.classList.remove('open');
}
window.addEventListener('resize', () => {
  if (document.getElementById('reportPreviewModal')?.classList.contains('open')) fitReportPreview();
});
document.addEventListener('keydown', e => {
  if (
    e.key === 'Escape' &&
    document.getElementById('reportPreviewModal')?.classList.contains('open')
  )
    closeReportPreview();
});
function generateMonthlyPDF() {
  const monthValue = document.getElementById('pdfExportMonth')?.value || '';
  const target = document.getElementById('pdfExportTarget')?.value || 'all';
  const bounds = pdfMonthBounds(monthValue);
  if (!bounds) {
    alert('Choisis un mois à exporter.');
    return;
  }
  buildPrintReport(monthValue, target);
  const previousTitle = document.title;
  const previousUrl = location.href;
  const kind = exportTargetKind(target),
    who =
      kind === 'all'
        ? 'equipe'
        : kind === 'employer'
          ? employerFor(target.slice('employer:'.length))?.name || 'employeur'
          : EMPLOYEES.find(e => e.id === target)?.name || 'salarie';
  const period = monthLabel(bounds.start);
  document.title = `Releve-horaires-${pdfFileToken(period)}-${pdfFileToken(who)}`;
  let urlSanitized = false;
  try {
    const cleanUrl = new URL(location.href);
    history.replaceState(history.state, '', cleanUrl.pathname + cleanUrl.hash);
    urlSanitized = true;
  } catch {}
  const restore = () => {
    document.title = previousTitle;
    if (urlSanitized) {
      try {
        history.replaceState(history.state, '', previousUrl);
      } catch {}
    }
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 80);
}

function renderOwner() {
  const [ws, we] = weekBounds(),
    [ms, me] = monthBounds();
  const weekValues = EMPLOYEES.map(e => ({
      name: e.name,
      minutes: totalFor(e.id, ws, we),
      objective: employeeSettings(e.id).weeklyObjectiveMinutes
    })),
    monthValues = EMPLOYEES.map(e => ({ name: e.name, minutes: totalFor(e.id, ms, me) }));
  cards.innerHTML = EMPLOYEES.map(e => {
    const week = totalFor(e.id, ws, we),
      month = totalFor(e.id, ms, me),
      s = employeeSettings(e.id),
      pendingV = pendingValidationCount(e.id),
      thresholdReached = s.overtimeThresholdMinutes > 0 && week >= s.overtimeThresholdMinutes;
    const badges = `<div class="kpi-badges">${pendingV ? `<span class="status warn">${pendingV} à valider</span>` : '<span class="status ok">À jour</span>'}</div>`;
    return `<div class="card kpi employee-summary-card" role="button" tabindex="0" data-week-employee="${e.id}" aria-haspopup="dialog" aria-controls="employeeWeekModal" aria-label="Voir la semaine de ${ownerEscape(e.name)}"><div class="row"><div class="h3">${ownerEscape(e.name)}</div>${badges}</div><div class="stat-list"><div class="stat-line kpi-week-line"><span class="subtle">Semaine</span><div class="kpi-week-value"><strong>${fmtMin(week)}</strong>${thresholdReached ? '<span class="kpi-threshold-note">Seuil atteint</span>' : ''}</div></div><div class="stat-line"><span class="subtle">Prévu / semaine</span><strong>${fmtMin(s.weeklyObjectiveMinutes)}</strong></div><div class="stat-line"><span class="subtle">Écart</span><strong class="${week >= s.weeklyObjectiveMinutes ? 'text-positive' : 'text-muted'}">${fmtSignedMin(week - s.weeklyObjectiveMinutes)}</strong></div><div class="stat-line"><span class="subtle">Mois</span><strong>${fmtMin(month)}</strong></div></div><span class="employee-summary-link" aria-hidden="true">Voir la semaine <span>→</span></span></div>`;
  }).join('');
  renderTeamChart(weekTeamChart, weekValues, true);
  renderTeamChart(monthTeamChart, monthValues, false);
  planningMonthBtn?.classList.toggle('active-chip', planningView === 'month');
  planningWeekBtn?.classList.toggle('active-chip', planningView === 'week');
  syncPlanningSelectionUi();
  renderCompletionCalendar();
  const tasks = EMPLOYEES.flatMap(e =>
    tasksFor(e.id).map(t => ({ ...t, name: e.name, employeeId: e.id }))
  );
  pendingBadge.textContent = tasks.length
    ? `${tasks.length} saisie${tasks.length > 1 ? 's' : ''} à compléter`
    : 'Tout est à jour';
  pendingBadge.className = 'status ' + (tasks.length ? 'warn' : 'ok');
  pending.innerHTML = tasks.length
    ? tasks
        .map(
          t =>
            `<div class="task row"><div><div class="task-title">${ownerEscape(t.name)}</div><div class="task-meta">${frDate(t.date)} · ${t.missing}</div></div><button class="btn btn-outline btn-small" onclick="openOwnerEdit('${t.employeeId}','${t.date}')">Corriger</button></div>`
        )
        .join('')
    : '<div class="empty">Aucune journée à compléter.</div>';
  const validations = getData()
    .entries.filter(
      e => e.validationStatus === 'pending' && (e.status === 'off' || (e.arrival && e.departure))
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  validationBadge.textContent = validations.length
    ? `${validations.length} à valider`
    : 'Tout est validé';
  validationBadge.className = 'status ' + (validations.length ? 'warn' : 'ok');
  validationList.innerHTML = validations.length
    ? validations
        .map(x => {
          const emp = EMPLOYEES.find(e => e.id === x.employeeId),
            employerNames = [
              ...new Set(
                segmentsFor(x.employeeId, x.date)
                  .map(s => s.employerName)
                  .filter(Boolean)
              )
            ],
            employerLine =
              x.status === 'off'
                ? ''
                : `<div class="subtle">${employerNames.length > 1 ? 'Employeurs' : 'Employeur'} · ${employerNames.length ? employerNames.map(ownerEscape).join(' · ') : 'Non renseigné'}</div>`;
          return `<div class="validation-row"><div><strong>${ownerEscape(emp?.name || x.employeeId)}</strong><div class="subtle">${frDate(x.date)} · ${x.status === 'off' ? 'Non travaillé' : `${x.arrival} – ${x.departure} · ${fmtMin(workMinutesForDay(x.employeeId, x.date))}`}</div>${employerLine}</div><div class="toolbar-actions"><button class="btn btn-green btn-small" onclick="validateAndRefresh('${x.employeeId}','${x.date}')">Valider</button><button class="btn btn-outline btn-small" onclick="openOwnerEdit('${x.employeeId}','${x.date}')">Modifier</button></div></div>`;
        })
        .join('')
    : '<div class="empty">Aucune journée en attente de validation.</div>';
  const data = getData()
    .entries.slice()
    .sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId))
    .slice(0, 50);
  rows.innerHTML = data
    .map(x => {
      const e = EMPLOYEES.find(y => y.id === x.employeeId),
        off = x.status === 'off';
      return `<tr><td>${ownerEscape(e?.name || x.employeeId)}</td><td>${shortDate(x.date)}</td><td>${off ? '—' : x.arrival || '—'}</td><td>${off ? '—' : x.departure || '—'}</td><td>${off ? '—' : fmtDurationMinutes(x.pause || 0)}</td><td><strong>${off ? '0h00' : fmtMin(workMinutesForDay(x.employeeId, x.date))}</strong></td><td><span class="status ${x.validationStatus === 'validated' ? 'ok' : x.validationStatus === 'pending' ? 'warn' : 'neutral'}">${x.validationStatus === 'validated' ? 'Validé' : x.validationStatus === 'pending' ? 'À valider' : '—'}</span></td></tr>`;
    })
    .join('');

  renderV2Pilotage();
  if (typeof refreshEmployeeWeekIfOpen === 'function') refreshEmployeeWeekIfOpen();
}
async function validateAndRefresh(empId, date) {
  await withOwnerSave(async () => {
    await validateEntry(empId, date);
    renderOwner();
  });
}
function openOwnerAccountSettings() {
  ownerCurrentPin.value = '';
  ownerNewPin.value = '';
  ownerConfirmPin.value = '';
  ownerPinError.textContent = '';
  ownerAccountSettingsModal.classList.add('open');
  setTimeout(() => ownerCurrentPin.focus(), 40);
}
function closeOwnerAccountSettings() {
  ownerAccountSettingsModal.classList.remove('open');
}
[ownerCurrentPin, ownerNewPin, ownerConfirmPin].forEach(el =>
  el?.addEventListener('input', () => (el.value = el.value.replace(/\D/g, '').slice(0, 4)))
);
ownerConfirmPin?.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveNewOwnerPin();
});
async function saveNewOwnerPin() {
  ownerPinError.textContent = '';
  const current = ownerCurrentPin.value,
    newPin = ownerNewPin.value,
    confirm = ownerConfirmPin.value;
  if (!/^\d{4}$/.test(current) || !/^\d{4}$/.test(newPin)) {
    ownerPinError.textContent = 'Les PIN doivent contenir 4 chiffres.';
    return;
  }
  if (newPin !== confirm) {
    ownerPinError.textContent = 'La confirmation ne correspond pas.';
    return;
  }
  ownerSavePinBtn.disabled = true;
  ownerSavePinBtn.textContent = 'Modification…';
  try {
    await changeOwnerPin(current, newPin);
    ownerCurrentPin.value = '';
    ownerNewPin.value = '';
    ownerConfirmPin.value = '';
    alert('PIN de pilotage modifié.');
  } catch (e) {
    ownerPinError.textContent = friendlyError(e);
  } finally {
    ownerSavePinBtn.disabled = false;
    ownerSavePinBtn.textContent = 'Changer le PIN';
  }
}

// -------------------- V2.0 : employeurs, congés et créneaux --------------------
function ownerEscape(v) {
  return String(v ?? '').replace(
    /[&<>'"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]
  );
}
function assignmentActive(employeeId, employerId) {
  return V2_DATA.assignments.some(
    a => a.employeeId === employeeId && a.employerId === employerId && a.active
  );
}
function renderEmployersV2() {
  const active = V2_DATA.employers.filter(e => e.active),
    archived = V2_DATA.employers.filter(e => !e.active);
  const archiveIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v3H4zM6 10v8a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-8M10 14h4"/></svg>';
  // Tableau employeurs × salariés : une case cochée = le salarié peut saisir des heures pour cet employeur.
  const activeHtml = active.length
    ? `<table class="employer-matrix">
        <thead><tr><th scope="col">Employeur</th>${EMPLOYEES.map(emp => `<th scope="col">${ownerEscape(emp.name)}</th>`).join('')}<th scope="col"><span class="visually-hidden">Archiver</span></th></tr></thead>
        <tbody>${active
          .map(
            e =>
              `<tr><th scope="row">${ownerEscape(e.name)}</th>${EMPLOYEES.map(
                emp =>
                  `<td><input type="checkbox" ${assignmentActive(emp.id, e.id) ? 'checked' : ''} aria-label="${ownerEscape(emp.name)} travaille pour ${ownerEscape(e.name)}" onchange="toggleEmployerAssignment('${emp.id}','${e.id}',this.checked)"></td>`
              ).join(
                ''
              )}<td><button class="employer-archive-btn" type="button" onclick="archiveEmployer('${e.id}')" aria-label="Archiver ${ownerEscape(e.name)}" title="Archiver">${archiveIcon}</button></td></tr>`
          )
          .join('')}</tbody>
      </table>`
    : '<div class="empty">Aucun employeur actif.</div>';
  const archivedHtml = archived.length
    ? `<div class="archived-employers-line"><span class="subtle">Archivés :</span>${archived
        .map(
          e =>
            `<span class="archived-employer-chip">${ownerEscape(e.name)}<button class="btn btn-outline btn-small" type="button" onclick="restoreEmployer('${e.id}')">Réactiver</button></span>`
        )
        .join('')}</div>`
    : '';
  employerList.innerHTML = activeHtml + archivedHtml;
}
function openEmployerModal() {
  newEmployerName.value = '';
  employerModal.classList.add('open');
  setTimeout(() => newEmployerName.focus(), 30);
}
function closeEmployerModal() {
  employerModal.classList.remove('open');
}
async function createEmployerFromModal() {
  const name = newEmployerName.value.trim();
  if (name.length < 2) {
    alert('Entre un nom d’employeur.');
    return;
  }
  await withOwnerSave(async () => {
    await ownerCreateEmployer(name);
    closeEmployerModal();
    renderOwner();
  });
}
async function archiveEmployer(id) {
  if (!confirm('Archiver cet employeur ? Son historique sera conservé.')) return;
  await withOwnerSave(async () => {
    await ownerSetEmployerActive(id, false);
    renderOwner();
  });
}
async function restoreEmployer(id) {
  await withOwnerSave(async () => {
    await ownerSetEmployerActive(id, true);
    renderOwner();
  });
}
async function toggleEmployerAssignment(employeeId, employerId, active) {
  await withOwnerSave(async () => {
    await ownerSetEmployeeEmployer(employeeId, employerId, active);
    renderOwner();
  });
}

function ownerLeaveStatus(status) {
  return status === 'validated' ? 'Validé' : status === 'rejected' ? 'Refusé' : 'À valider';
}
function renderOwnerLeavesV2() {
  const leaves = [...V2_DATA.leaves].sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : a.status === 'validated' ? 1 : 2,
      pb = b.status === 'pending' ? 0 : b.status === 'validated' ? 1 : 2;
    return pa - pb || b.startDate.localeCompare(a.startDate);
  });
  const pending = leaves.filter(l => l.status === 'pending').length;
  ownerLeaveBadge.textContent = pending
    ? `${pending} demande${pending > 1 ? 's' : ''} en attente`
    : 'Aucune demande en attente';
  ownerLeaveBadge.className = 'status ' + (pending ? 'warn' : 'ok');
  ownerLeaveList.innerHTML = leaves.length
    ? leaves
        .map(l => {
          const emp = EMPLOYEES.find(e => e.id === l.employeeId);
          const statusChip =
            l.status === 'pending'
              ? ''
              : `<span class="status ${l.status === 'validated' ? 'ok' : 'off'}">${ownerLeaveStatus(l.status)}</span>`;
          return `<div class="leave-row leave-${l.status}"><div class="leave-main"><strong>${ownerEscape(emp?.name || 'Salarié')} · ${leaveLabel(l)} · ${shortDate(l.startDate)} → ${shortDate(l.endDate)}</strong><div class="subtle">${l.note ? ownerEscape(l.note) + ' · ' : ''}${l.requestedBy === 'owner' ? 'Ajouté par le pilotage' : 'Demandé par le salarié'}</div></div><div class="leave-actions">${statusChip}${l.status === 'pending' ? `<button class="btn btn-green btn-small" onclick="reviewOwnerLeave('${l.id}','validated')">Valider</button><button class="btn btn-outline btn-small" onclick="reviewOwnerLeave('${l.id}','rejected')">Refuser</button>` : `<button class="btn btn-outline btn-small" onclick="deleteOwnerLeave('${l.id}')">Supprimer</button>`}</div></div>`;
        })
        .join('')
    : '<div class="empty">Aucun congé déclaré.</div>';
}
let ownerLeaveRangeControl = null;
try {
  if (typeof createDateRangePicker === 'function')
    ownerLeaveRangeControl = createDateRangePicker(
      document.getElementById('ownerLeaveRangePicker'),
      ownerLeaveStart,
      ownerLeaveEnd
    );
} catch (e) {
  console.error('Owner range picker unavailable', e);
}
function openOwnerLeaveModal() {
  ownerLeaveEmployee.innerHTML = EMPLOYEES.map(
    e => `<option value="${e.id}">${ownerEscape(e.name)}</option>`
  ).join('');
  ownerLeaveType.value = 'paid_leave';
  ownerLeaveNote.value = '';
  if (ownerLeaveRangeControl) {
    ownerLeaveRangeControl.reset('', '');
  } else {
    ownerLeaveStart.type = 'date';
    ownerLeaveEnd.type = 'date';
    ownerLeaveStart.value = iso();
    ownerLeaveEnd.value = iso();
  }
  ownerLeaveModal.classList.add('open');
}
function closeOwnerLeaveModal() {
  ownerLeaveModal.classList.remove('open');
}
async function createOwnerLeave() {
  if (!ownerLeaveEmployee.value) {
    alert('Choisis un salarié.');
    return;
  }
  if (!ownerLeaveStart.value) {
    alert('Choisis le premier jour de congé.');
    return;
  }
  if (!ownerLeaveEnd.value) ownerLeaveEnd.value = ownerLeaveStart.value;
  await withOwnerSave(async () => {
    await ownerCreateLeave(
      ownerLeaveEmployee.value,
      ownerLeaveStart.value,
      ownerLeaveEnd.value,
      ownerLeaveNote.value,
      ownerLeaveType.value
    );
    closeOwnerLeaveModal();
    renderOwner();
  });
}
async function reviewOwnerLeave(id, status) {
  await withOwnerSave(async () => {
    await ownerReviewLeave(id, status);
    renderOwner();
  });
}
async function deleteOwnerLeave(id) {
  if (!confirm('Supprimer cette période de congé ?')) return;
  await withOwnerSave(async () => {
    await ownerDeleteLeave(id);
    renderOwner();
  });
}

function completionForDate(date) {
  const planned = EMPLOYEES.filter(e => {
    const entry = entryFor(e.id, date, false),
      actual = segmentsFor(e.id, date).length > 0 || entry?.status === 'worked';
    return (
      !isOnValidatedLeave(e.id, date) &&
      entry?.status !== 'off' &&
      (isPlannedWorkingDay(e.id, date) || actual)
    );
  });
  if (!planned.length)
    return { kind: 'weekend', count: 0, total: 0, label: 'Personne prévue', planned };
  const count = planned.filter(e => dayInfoFor(e.id, date).status === 'complete').length;
  if (count === planned.length)
    return { kind: 'all', count, total: planned.length, label: 'Complet', planned };
  if (date >= iso())
    return {
      kind: 'upcoming',
      count,
      total: planned.length,
      label: count ? `${count}/${planned.length} remplis` : date === iso() ? 'En cours' : 'Prévu',
      planned
    };
  if (count === 0)
    return { kind: 'none', count, total: planned.length, label: 'Non rempli', planned };
  return {
    kind: 'partial',
    count,
    total: planned.length,
    label: `${count}/${planned.length} remplis`,
    planned
  };
}

function planningRow(emp, date) {
  const working = isPlannedWorkingDay(emp.id, date),
    info = dayInfoFor(emp.id, date),
    entry = info.entry,
    leave = leaveForDate(emp.id, date, 'validated'),
    segs = segmentsFor(emp.id, date),
    validation =
      entry?.validationStatus === 'validated'
        ? 'Validé'
        : entry?.validationStatus === 'pending'
          ? 'À valider'
          : '—';
  let detail = 'Aucune saisie';
  if (isFullDayLeave(leave))
    detail = `${leaveLabel(leave)} validé · ${shortDate(leave.startDate)} → ${shortDate(leave.endDate)}`;
  else if (entry?.status === 'off') detail = 'Non travaillé déclaré';
  else if (segs.length)
    detail =
      segs.map(s => `${s.employerName} ${s.start}–${s.end || '…'}`).join(' · ') +
      ` · ${fmtMin(info.minutes)}`;
  else if (entry?.arrival && entry?.departure)
    detail = `${entry.arrival} – ${entry.departure} · ${fmtMin(info.minutes)}`;
  else if (entry) detail = 'Saisie incomplète';
  if (leave && !isFullDayLeave(leave)) detail = `${leaveLabel(leave)} validé · ${detail}`;
  return `<div class="planning-row ${leave ? 'is-leave' : ''}"><div class="planning-person"><strong>${ownerEscape(emp.name)}</strong><span class="subtle">${ownerEscape(detail)} · ${validation}</span></div><label class="planning-check"><input type="checkbox" data-plan-emp="${emp.id}" ${working ? 'checked' : ''}> Travaillé</label><div class="planning-actions">${entry && entry.arrival && entry.departure && entry.validationStatus !== 'validated' && !isFullDayLeave(leave) ? `<button class="btn btn-green btn-small" onclick="validateFromPlanning('${emp.id}','${date}')">Valider</button>` : ''}${!isFullDayLeave(leave) ? `<button class="btn btn-outline btn-small" onclick="openOwnerEdit('${emp.id}','${date}')">Modifier</button>` : ''}</div></div>`;
}

let ownerSegmentsDraft = [],
  ownerPauseTouched = false;
function ownerEmployerOptions(empId, selected = '') {
  const assigned = assignedEmployers(empId),
    selectedEmployer = employerFor(selected),
    list = [...assigned];
  if (selectedEmployer && !list.some(e => e.id === selectedEmployer.id))
    list.push(selectedEmployer);
  if (!list.length) V2_DATA.employers.filter(e => e.active).forEach(e => list.push(e));
  return list
    .map(
      e =>
        `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${ownerEscape(e.name)}</option>`
    )
    .join('');
}
function syncOwnerDraftFromDom() {
  ownerSegmentsDraft = ownerSegmentsDraft.map((s, i) => ({
    employerId:
      ownerSegmentsEditor.querySelector(`[data-owner-seg-employer="${i}"]`)?.value || s.employerId,
    start: ownerSegmentsEditor.querySelector(`[data-owner-seg-start="${i}"]`)?.value || '',
    end: ownerSegmentsEditor.querySelector(`[data-owner-seg-end="${i}"]`)?.value || ''
  }));
}
function renderOwnerSegmentsEditor() {
  ownerSegmentsEditor.innerHTML = ownerSegmentsDraft.length
    ? ownerSegmentsDraft
        .map(
          (s, i) =>
            `<div class="segment-edit-row"><div class="field"><label>Employeur</label><select data-owner-seg-employer="${i}">${ownerEmployerOptions(ownerEditEmployee, s.employerId)}</select></div><div class="field"><label>Arrivée</label><input type="time" data-owner-seg-start="${i}" value="${s.start || ''}"></div><div class="field"><label>Départ</label><input type="time" data-owner-seg-end="${i}" value="${s.end || ''}"></div><button class="btn btn-outline btn-small segment-remove" type="button" onclick="removeOwnerSegmentRow(${i})">Retirer</button></div>`
        )
        .join('')
    : '<div class="empty">Aucun créneau saisi.</div>';
  ownerSegmentsEditor.querySelectorAll('input,select').forEach(el =>
    el.addEventListener('input', () => {
      syncOwnerDraftFromDom();
      updateOwnerDayTotal();
    })
  );
}
function addOwnerSegmentRow() {
  syncOwnerDraftFromDom();
  const choices = assignedEmployers(ownerEditEmployee).length
    ? assignedEmployers(ownerEditEmployee)
    : V2_DATA.employers.filter(e => e.active);
  if (!choices.length) {
    alert('Ajoute d’abord un employeur.');
    return;
  }
  ownerSegmentsDraft.push({ employerId: choices[0].id, start: '', end: '' });
  if (ownerSegmentsDraft.length === 2 && !ownerPauseTouched) ownerPause.value = '0h00';
  renderOwnerSegmentsEditor();
  updateOwnerDayTotal();
}
function removeOwnerSegmentRow(i) {
  syncOwnerDraftFromDom();
  ownerSegmentsDraft.splice(i, 1);
  if (ownerSegmentsDraft.length <= 1 && !ownerPauseTouched)
    ownerPause.value = hasHalfDayRTT(ownerEditEmployee, ownerEditDate) ? '0h00' : '1h30';
  renderOwnerSegmentsEditor();
  updateOwnerDayTotal();
}
function addOwnerPauseMinutes(delta) {
  const p = parseDurationMinutes(ownerPause.value);
  ownerPauseTouched = true;
  ownerPause.value = fmtDurationMinutes(
    Math.max(0, Math.min(720, (p === null ? 0 : p) + Number(delta || 0)))
  );
  updateOwnerDayTotal();
}
document
  .querySelectorAll('[data-owner-pause-add]')
  .forEach(btn =>
    btn.addEventListener('click', () => addOwnerPauseMinutes(btn.dataset.ownerPauseAdd))
  );
ownerPause?.addEventListener('input', () => {
  ownerPauseTouched = true;
  updateOwnerDayTotal();
});
ownerPause?.addEventListener('change', () => {
  const p = parseDurationMinutes(ownerPause.value);
  ownerPause.value = fmtDurationMinutes(p === null ? 0 : p);
  updateOwnerDayTotal();
});
ownerOff?.addEventListener('change', () => {
  ownerWorkedFields.classList.toggle('hidden', ownerOff.checked);
  updateOwnerDayTotal();
});

function openOwnerEdit(empId, date) {
  ownerEditEmployee = empId;
  ownerEditDate = date;
  const emp = EMPLOYEES.find(e => e.id === empId),
    entry = entryFor(empId, date, false) || {
      status: 'worked',
      arrival: '',
      departure: '',
      pause: hasHalfDayRTT(empId, date) ? 0 : 90,
      comment: '',
      validationStatus: 'pending'
    },
    segs = segmentsFor(empId, date);
  ownerEditSubtitle.textContent = `${emp?.name || empId} · ${longDate(date)}`;
  ownerSegmentsDraft = segs.map(s => ({
    employerId: s.employerId,
    start: s.start,
    end: s.end || ''
  }));
  const choices = assignedEmployers(empId).length
    ? assignedEmployers(empId)
    : V2_DATA.employers.filter(e => e.active);
  if (!ownerSegmentsDraft.length && entry.arrival && entry.departure && choices.length)
    ownerSegmentsDraft = [
      { employerId: choices[0].id, start: entry.arrival, end: entry.departure }
    ];
  ownerPauseTouched = entry.pauseMode === 'manual';
  ownerPause.value = fmtDurationMinutes(
    Number(entry.pause ?? (ownerSegmentsDraft.length > 1 || hasHalfDayRTT(empId, date) ? 0 : 90))
  );
  ownerComment.value = entry.comment || '';
  ownerOff.checked = entry.status === 'off';
  ownerValidation.value = entry.validationStatus === 'validated' ? 'validated' : 'pending';
  ownerWorkedFields.classList.toggle('hidden', ownerOff.checked);
  renderOwnerSegmentsEditor();
  updateOwnerDayTotal();
  ownerEditModal.classList.add('open');
}
function updateOwnerDayTotal() {
  syncOwnerDraftFromDom();
  const gross = ownerSegmentsDraft.reduce((s, x) => s + timeSpanMinutes(x.start, x.end), 0),
    pause = parseDurationMinutes(ownerPause.value);
  ownerDayTotal.textContent = ownerOff.checked
    ? '0h00'
    : fmtMin(Math.max(0, gross - (pause === null ? 0 : pause)));
}
async function saveOwnerEdit() {
  syncOwnerDraftFromDom();
  await withOwnerSave(async () => {
    if (ownerOff.checked) {
      await ownerSetDayOffV2(ownerEditEmployee, ownerEditDate, true, ownerValidation.value);
    } else {
      if (
        !ownerSegmentsDraft.length ||
        ownerSegmentsDraft.some(s => !s.employerId || !s.start || !s.end)
      ) {
        alert('Renseigne complètement au moins un créneau.');
        return;
      }
      if (ownerSegmentsDraft.some(s => timeToMinutes(s.end) <= timeToMinutes(s.start))) {
        alert('Chaque heure de fin doit être strictement après l’heure de début.');
        return;
      }
      const ordered = [...ownerSegmentsDraft].sort((a, b) => a.start.localeCompare(b.start));
      if (
        ordered.some((s, i) => i > 0 && timeToMinutes(s.start) < timeToMinutes(ordered[i - 1].end))
      ) {
        alert('Deux créneaux se chevauchent. Corrige les horaires.');
        return;
      }
      const pause = parseDurationMinutes(ownerPause.value),
        gross = grossSegmentsMinutes(ownerSegmentsDraft);
      if ((pause || 0) > gross) {
        alert('La pause ne peut pas dépasser le temps travaillé.');
        return;
      }
      await ownerReplaceDayV2(
        ownerEditEmployee,
        ownerEditDate,
        ownerSegmentsDraft.map(s => ({
          employer_id: s.employerId,
          start_time: s.start,
          end_time: s.end
        })),
        pause === null ? 0 : pause,
        ownerComment.value,
        ownerValidation.value
      );
    }
    closeOwnerEdit();
    if (planningModal.classList.contains('open')) openPlanning(planningDate);
    renderOwner();
  });
}

// --- Compte temps ---
// Contrat de 41 h par semaine (seuil réglé par salarié dans « Réglages du temps de travail »).
// - Chaque semaine (lundi → dimanche), ce qui dépasse le seuil s'ajoute au compte temps ;
//   une semaine plus courte ne retire rien. La semaine est rattachée au mois de son jeudi,
//   pour qu'une semaine à cheval sur deux mois ne soit comptée qu'une fois.
// - Chaque RTT validé (demandé par le salarié ou donné par le Pilotage) est retiré du compte :
//   une journée vaut seuil ÷ 5 (8h12 pour 41 h), une demi-journée la moitié.
// - Le compte repart de zéro chaque 1er mai (période du 1er mai au 30 avril).
const COMPTE_TEMPS_RTT_TYPES = { rtt: 1, rtt_morning: 0.5, rtt_afternoon: 0.5 };
function compteTempsPeriodStart(dateIso) {
  const d = dateObjFromIso(dateIso),
    year = d.getMonth() >= 4 ? d.getFullYear() : d.getFullYear() - 1;
  return `${year}-05-01`;
}
function compteTempsWeekThursday(weekStart) {
  const d = startOfWeek(weekStart);
  d.setDate(d.getDate() + 3);
  return iso(d);
}
function weekExcessMinutes(empId, weekStart) {
  const threshold = Number(employeeSettings(empId).overtimeThresholdMinutes || 0);
  if (threshold <= 0) return 0;
  const ws = startOfWeek(weekStart),
    we = new Date(ws);
  we.setDate(ws.getDate() + 6);
  return Math.max(0, totalFor(empId, ws, we) - threshold);
}
function rttDebitForDate(empId, date) {
  const leave = leaveForDate(empId, date, 'validated'),
    share = COMPTE_TEMPS_RTT_TYPES[leave?.type];
  if (!share) return 0;
  const day = dateObjFromIso(date).getDay();
  if (day === 0 || day === 6 || publicHolidayName(date)) return 0;
  return Math.round((Number(employeeSettings(empId).overtimeThresholdMinutes || 0) / 5) * share);
}
// { acquis, rtt, net } entre deux dates incluses.
function compteTempsBetween(empId, fromIso, toIso) {
  let acquis = 0,
    rtt = 0;
  const ws = startOfWeek(dateObjFromIso(fromIso)),
    last = dateObjFromIso(toIso);
  while (ws <= last) {
    const thursday = compteTempsWeekThursday(ws);
    if (thursday >= fromIso && thursday <= toIso && thursday >= APP_START_DATE)
      acquis += weekExcessMinutes(empId, ws);
    ws.setDate(ws.getDate() + 7);
  }
  listDates(dateObjFromIso(fromIso), last).forEach(date => {
    if (date >= APP_START_DATE) rtt += rttDebitForDate(empId, date);
  });
  return { acquis, rtt, net: acquis - rtt };
}
function compteTempsMonth(empId, year, monthIndex) {
  return compteTempsBetween(
    empId,
    iso(new Date(year, monthIndex, 1, 12)),
    iso(new Date(year, monthIndex + 1, 0, 12))
  );
}
// Reports saisis par le Pilotage (ex. solde calculé à la main avant l'appli).
// Pour la période en cours au lancement, le report est daté de la veille du lancement (01/11/2026) ;
// pour les périodes suivantes, du 1er mai.
function compteTempsReportDate(periodStartIso) {
  if (periodStartIso >= APP_START_DATE) return periodStartIso;
  const d = dateObjFromIso(APP_START_DATE);
  d.setDate(d.getDate() - 1);
  return iso(d);
}
function compteTempsReportMinutes(empId, fromIso, toIso) {
  return (typeof COMPTE_TEMPS_REPORTS === 'undefined' ? [] : COMPTE_TEMPS_REPORTS)
    .filter(r => r.employeeId === empId && r.effectiveDate >= fromIso && r.effectiveDate <= toIso)
    .reduce((sum, r) => sum + r.minutes, 0);
}
// Solde du compte temps depuis le 1er mai jusqu'à la date donnée incluse, report compris.
// (Le « compte temps du mois » n'inclut pas le report, pour ne pas gonfler un mois.)
function compteTempsBalance(empId, untilIso) {
  const from = compteTempsPeriodStart(untilIso),
    c = compteTempsBetween(empId, from, untilIso),
    report = compteTempsReportMinutes(empId, from, untilIso);
  return { ...c, report, net: c.net + report };
}
// « 5,9 », « 5.9 », « 5h54 », « -3h30 », « +12 » → minutes ; vide → 0 ; illisible → NaN.
function parseHoursInput(value) {
  const v = String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace('−', '-');
  if (!v) return 0;
  const hm = v.match(/^([+-]?)(\d+)h(\d{1,2})?$/i);
  if (hm) {
    const minutes = Number(hm[2]) * 60 + Number(hm[3] || 0);
    return hm[1] === '-' ? -minutes : minutes;
  }
  if (/^[+-]?\d+([.,]\d+)?$/.test(v)) return Math.round(Number(v.replace(',', '.')) * 60);
  return NaN;
}
function compteTempsClass(minutes) {
  return minutes > 0 ? 'text-positive' : minutes < 0 ? 'text-warning' : 'text-muted';
}
// Minutes par employeur sur une journée : la pause est répartie au prorata des créneaux.
function employerMinutesForDay(empId, date) {
  const total = workMinutesForDay(empId, date);
  if (!total) return [];
  const segs = segmentsFor(empId, date);
  if (!segs.length) return [{ id: '', name: 'Non renseigné', minutes: total }];
  const byEmployer = new Map();
  let gross = 0;
  segs.forEach(s => {
    const m = timeSpanMinutes(s.start, s.end);
    if (!m) return;
    const key = s.employerId || '';
    const cur = byEmployer.get(key) || {
      id: key,
      name: s.employerName || employerFor(key)?.name || 'Non renseigné',
      minutes: 0
    };
    cur.minutes += m;
    byEmployer.set(key, cur);
    gross += m;
  });
  if (!gross) return [];
  const list = [...byEmployer.values()];
  let assigned = 0;
  list.forEach((x, i) => {
    const share =
      i === list.length - 1 ? total - assigned : Math.round((total * x.minutes) / gross);
    assigned += share;
    x.minutes = share;
  });
  return list;
}
function employerTotalsFor(empId, start, end) {
  const totals = new Map();
  listDates(start, end).forEach(date =>
    employerMinutesForDay(empId, date).forEach(x => {
      const cur = totals.get(x.id) || { id: x.id, name: x.name, minutes: 0 };
      cur.minutes += x.minutes;
      totals.set(x.id, cur);
    })
  );
  return totals;
}
function buildTeamRecap(start, end, employees) {
  const monthEndIso = iso(end);
  const rowsData = employees.map(emp => ({
    emp,
    byEmployer: employerTotalsFor(emp.id, start, end),
    total: totalFor(emp.id, start, end),
    month: compteTempsMonth(emp.id, start.getFullYear(), start.getMonth()),
    balance: compteTempsBalance(emp.id, monthEndIso),
    threshold: Number(employeeSettings(emp.id).overtimeThresholdMinutes || 0)
  }));
  const columns = new Map();
  rowsData.forEach(r =>
    r.byEmployer.forEach(x => {
      if (x.minutes > 0 && !columns.has(x.id)) columns.set(x.id, x.name);
    })
  );
  const cols = [...columns.entries()].sort((a, b) =>
    a[0] === '' ? 1 : b[0] === '' ? -1 : a[1].localeCompare(b[1], 'fr')
  );
  const sum = fn => rowsData.reduce((s, r) => s + fn(r), 0);
  // Seuil le plus courant : affiché une fois en en-tête, rappelé seulement pour les exceptions.
  const thresholdCounts = new Map();
  rowsData.forEach(r =>
    thresholdCounts.set(r.threshold, (thresholdCounts.get(r.threshold) || 0) + 1)
  );
  const usualThreshold = [...thresholdCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 0;
  const cell = m => (m ? fmtMin(m) : '—');
  const body = rowsData
    .map(
      r =>
        `<tr><td><strong>${ownerEscape(r.emp.name)}</strong>${r.threshold !== usualThreshold ? `<div class="print-team-sub">contrat ${r.threshold ? fmtMin(r.threshold) : 'non défini'} / sem.</div>` : ''}</td>${cols.map(([id]) => `<td class="print-number-cell">${cell(r.byEmployer.get(id)?.minutes || 0)}</td>`).join('')}<td class="print-number-cell"><strong>${fmtMin(r.total)}</strong></td><td class="print-number-cell">${fmtSignedMin(r.month.net)}<div class="print-team-sub">${compteTempsDetail(r.month)}</div></td><td class="print-number-cell"><strong>${fmtSignedMin(r.balance.net)}</strong></td></tr>`
    )
    .join('');
  const foot = `<tr class="print-team-total"><td>Total équipe</td>${cols.map(([id]) => `<td class="print-number-cell">${cell(sum(r => r.byEmployer.get(id)?.minutes || 0))}</td>`).join('')}<td class="print-number-cell">${fmtMin(sum(r => r.total))}</td><td class="print-number-cell">${fmtSignedMin(sum(r => r.month.net))}</td><td class="print-number-cell">${fmtSignedMin(sum(r => r.balance.net))}</td></tr>`;
  const generatedAt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
  return `<article class="print-employee print-team-recap">
    <header class="print-employee-head">
      <div><div class="print-kicker">Synthèse globale</div><h1>Heures par employeur</h1><div class="print-period">${ownerEscape(monthLabel(start))}${usualThreshold ? `<span class="print-contract"> · contrat ${fmtMin(usualThreshold)} / semaine</span>` : ''}</div></div>
      <div class="print-generated">Édité le ${generatedAt}</div>
    </header>
    <table class="print-team-table">
      <thead><tr><th>Salarié</th>${cols.map(([, name]) => `<th>${ownerEscape(name)}</th>`).join('')}<th>Total du mois</th><th>Compte temps du mois</th><th>Compte temps au ${shortDate(monthEndIso)}</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${cols.length + 4}" class="print-empty">Aucun salarié.</td></tr>`}</tbody>
      <tfoot>${foot}</tfoot>
    </table>
    <div class="print-team-note">Compte temps : heures au-delà du contrat chaque semaine (semaine rattachée au mois de son jeudi), moins les RTT validés (journée = contrat ÷ 5). Remise à zéro chaque 1er mai.</div>
  </article>`;
}
// Une page par employeur : heures de chaque salarié pour cet employeur, semaine par semaine.
// Les semaines sont coupées aux bornes du mois (seules les journées du mois comptent).
function buildEmployerPages(start, end, employees, onlyEmployerId = null) {
  const dates = listDates(start, end),
    monthStartIso = iso(start),
    monthEndIso = iso(end);
  const weeks = [];
  dates.forEach(date => {
    const ws = iso(startOfWeek(dateObjFromIso(date)));
    if (!weeks.length || weeks.at(-1).key !== ws) weeks.push({ key: ws, from: date, to: date });
    else weeks.at(-1).to = date;
  });
  // employeur → salarié → { semaine → minutes, jours }
  const byEmployer = new Map();
  employees.forEach(emp =>
    dates.forEach(date =>
      employerMinutesForDay(emp.id, date).forEach(x => {
        if (!x.minutes) return;
        if (!byEmployer.has(x.id)) byEmployer.set(x.id, { name: x.name, rows: new Map() });
        const rows = byEmployer.get(x.id).rows;
        if (!rows.has(emp.id))
          rows.set(emp.id, { emp, weeks: new Map(), days: new Set(), total: 0 });
        const r = rows.get(emp.id),
          wk = iso(startOfWeek(dateObjFromIso(date)));
        r.weeks.set(wk, (r.weeks.get(wk) || 0) + x.minutes);
        r.days.add(date);
        r.total += x.minutes;
      })
    )
  );
  if (onlyEmployerId !== null && !byEmployer.has(onlyEmployerId))
    byEmployer.set(onlyEmployerId, {
      name: employerFor(onlyEmployerId)?.name || 'Employeur',
      rows: new Map()
    });
  const employers = [...byEmployer.entries()]
    .filter(([id]) => onlyEmployerId === null || id === onlyEmployerId)
    .sort((a, b) =>
      a[0] === '' ? 1 : b[0] === '' ? -1 : a[1].name.localeCompare(b[1].name, 'fr')
    );
  const generatedAt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
  const cell = m => (m ? fmtMin(m) : '—');
  const weekHead = w =>
    `<th>${w.from === w.to ? shortDate(w.from) : `${shortDate(w.from)} → ${shortDate(w.to)}`}</th>`;
  return employers
    .map(([, employer]) => {
      const rows = [...employer.rows.values()].sort((a, b) =>
        a.emp.name.localeCompare(b.emp.name, 'fr')
      );
      const sumWeek = key => rows.reduce((s, r) => s + (r.weeks.get(key) || 0), 0);
      const total = rows.reduce((s, r) => s + r.total, 0);
      const days = rows.reduce((s, r) => s + r.days.size, 0);
      return `<article class="print-employee print-employer-page">
    <header class="print-employee-head">
      <div><div class="print-kicker">Synthèse par employeur</div><h1>${ownerEscape(employer.name)}</h1><div class="print-period">${ownerEscape(monthLabel(start))}</div></div>
      <div class="print-generated">Édité le ${generatedAt}</div>
    </header>
    <section class="print-summary print-employer-summary">
      <div><span>Heures du mois</span><strong>${fmtMin(total)}</strong></div>
      <div><span>Salariés</span><strong>${rows.length}</strong></div>
      <div><span>Journées travaillées</span><strong>${days}</strong></div>
    </section>
    <table class="print-team-table">
      <thead><tr><th>Salarié</th>${weeks.map(weekHead).join('')}<th>Jours</th><th>Total</th></tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr><td><strong>${ownerEscape(r.emp.name)}</strong></td>${weeks.map(w => `<td class="print-number-cell">${cell(r.weeks.get(w.key) || 0)}</td>`).join('')}<td class="print-number-cell">${r.days.size}</td><td class="print-number-cell"><strong>${fmtMin(r.total)}</strong></td></tr>`).join('') : `<tr><td colspan="${weeks.length + 3}" class="print-empty">Aucune heure saisie pour cet employeur ce mois-ci.</td></tr>`}</tbody>
      <tfoot><tr class="print-team-total"><td>Total</td>${weeks.map(w => `<td class="print-number-cell">${cell(sumWeek(w.key))}</td>`).join('')}<td class="print-number-cell">${days}</td><td class="print-number-cell">${fmtMin(total)}</td></tr></tfoot>
    </table>
    <div class="print-team-note">Heures travaillées pour ${ownerEscape(employer.name)} du ${shortDate(monthStartIso)} au ${shortDate(monthEndIso)}, pauses déduites. Quand une journée est partagée entre plusieurs employeurs, la pause est répartie au prorata des créneaux.</div>
    <footer class="print-employee-foot">Suivi des horaires · ${ownerEscape(monthLabel(start))} · ${ownerEscape(employer.name)}</footer>
  </article>`;
    })
    .join('');
}
// Export « un employeur » : après sa page de synthèse, une page par salarié avec le détail
// de ses journées chez cet employeur (créneaux, durée pause répartie déduite, validation).
function buildEmployerEmployeePages(start, end, employerId) {
  const employer = employerFor(employerId),
    employerName = employer?.name || 'Employeur',
    dates = listDates(start, end),
    generatedAt = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date());
  const dayLabel = date =>
    `${new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(dateObjFromIso(date))} ${shortDate(date)}`;
  return [...EMPLOYEES]
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map(emp => {
      const days = dates
        .map(date => ({
          date,
          minutes: employerMinutesForDay(emp.id, date).find(x => x.id === employerId)?.minutes || 0,
          segs: segmentsFor(emp.id, date).filter(seg => seg.employerId === employerId),
          entry: entryFor(emp.id, date, false)
        }))
        .filter(d => d.minutes > 0);
      if (!days.length) return '';
      const total = days.reduce((sum, d) => sum + d.minutes, 0),
        pendingDays = days.filter(d => d.entry?.validationStatus === 'pending').length;
      let rows = '';
      days.forEach((d, i) => {
        const validation =
          d.entry?.validationStatus === 'validated'
            ? 'Validé'
            : d.entry?.validationStatus === 'pending'
              ? 'À valider'
              : '—';
        const slots = d.segs
          .map(
            seg =>
              `<div class="print-slot"><span>${ownerEscape(seg.start || '—')} → ${ownerEscape(seg.end || '…')}</span></div>`
          )
          .join('');
        rows += `<tr class="print-day-row${d.entry?.validationStatus === 'pending' ? ' print-status-pending' : ''}"><td class="print-date-cell">${dayLabel(d.date)}</td><td class="print-detail-cell">${slots || '—'}</td><td class="print-number-cell"><strong>${fmtMin(d.minutes)}</strong></td><td class="print-validation-cell">${validation}</td></tr>`;
        const week = iso(startOfWeek(dateObjFromIso(d.date))),
          next = days[i + 1] ? iso(startOfWeek(dateObjFromIso(days[i + 1].date))) : null;
        if (week !== next) {
          const weekDays = days.filter(x => iso(startOfWeek(dateObjFromIso(x.date))) === week);
          const weekTotal = weekDays.reduce((sum, x) => sum + x.minutes, 0);
          rows += `<tr class="print-week-total"><td colspan="4"><div><span>Semaine du ${shortDate(week)}</span><strong>${fmtMin(weekTotal)} chez ${ownerEscape(employerName)}</strong></div></td></tr>`;
        }
      });
      return `<article class="print-employee print-employer-employee">
    <header class="print-employee-head">
      <div><div class="print-kicker">${ownerEscape(employerName)} · détail par salarié</div><h1>${ownerEscape(emp.name)}</h1><div class="print-period">${ownerEscape(monthLabel(start))}</div></div>
      <div class="print-generated">Édité le ${generatedAt}</div>
    </header>
    <section class="print-summary print-employer-summary">
      <div><span>Heures chez ${ownerEscape(employerName)}</span><strong>${fmtMin(total)}</strong></div>
      <div><span>Journées</span><strong>${days.length}</strong></div>
      <div class="${pendingDays ? 'print-summary-pending' : ''}"><span>À valider</span><strong>${pendingDays}</strong></div>
    </section>
    <table class="print-hours-table print-employer-detail-table">
      <thead><tr><th>Date</th><th>Créneaux</th><th>Durée</th><th>Validation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <footer class="print-employee-foot">Suivi des horaires · ${ownerEscape(monthLabel(start))} · ${ownerEscape(employerName)} · ${ownerEscape(emp.name)}</footer>
  </article>`;
    })
    .join('');
}
function compteTempsDetail(c) {
  return `${c.report ? `report ${fmtSignedMin(c.report)} · ` : ''}+${fmtMin(c.acquis)} en plus${c.rtt ? ` · −${fmtMin(c.rtt)} de RTT` : ''}`;
}
function decorateOwnerCardsWithCompteTemps() {
  const today = iso();
  cards.querySelectorAll('[data-week-employee]').forEach(card => {
    const empId = card.dataset.weekEmployee,
      list = card.querySelector('.stat-list');
    if (!list || list.querySelector('.kpi-compte-temps')) return;
    const c = compteTempsBalance(empId, today),
      since = shortDate(compteTempsPeriodStart(today));
    list.insertAdjacentHTML(
      'beforeend',
      `<div class="stat-line kpi-compte-temps" title="Depuis le ${since} : ${compteTempsDetail(c)}"><span class="subtle">Compte temps<small>depuis le ${since}</small></span><strong class="${compteTempsClass(c.net)}">${fmtSignedMin(c.net)}</strong></div>`
    );
  });
}
function renderV2Pilotage() {
  renderEmployersV2();
  renderOwnerLeavesV2();
  decorateOwnerCardsWithCompteTemps();
  renderExportControls();
}

// target : 'all' (toute l'équipe), un id de salarié, ou 'employer:<id>'.
function buildPrintReport(monthValue, target = 'all') {
  const employerOnly = String(target).startsWith('employer:')
      ? String(target).slice('employer:'.length)
      : null,
    employeeId = employerOnly ? 'none' : target;
  const bounds = pdfMonthBounds(monthValue) || {
    start: new Date(completionCursor.getFullYear(), completionCursor.getMonth(), 1, 12),
    end: new Date(completionCursor.getFullYear(), completionCursor.getMonth() + 1, 0, 12)
  };
  const { start, end } = bounds,
    dates = listDates(start, end),
    d = getData();
  const employees = employerOnly
    ? []
    : employeeId === 'all'
      ? EMPLOYEES
      : EMPLOYEES.filter(emp => emp.id === employeeId);
  const generatedAt = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date());
  const monthStartIso = iso(start),
    monthEndIso = iso(end);

  const cleanPdfNote = value =>
    String(value || '')
      .replace(/^\[TEST PDF [^\]]+\]\s*/i, '')
      .trim();
  const pdfDateLabel = date => {
    const obj = dateObjFromIso(date);
    const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(obj);
    return `${weekday} ${shortDate(date)}`;
  };
  const weekMeta = date => {
    const obj = dateObjFromIso(date),
      day = (obj.getDay() + 6) % 7;
    const ws = new Date(obj);
    ws.setDate(obj.getDate() - day);
    ws.setHours(12, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    return { key: iso(ws), start: ws, end: we };
  };
  const weekLabel = meta => {
    const ws = iso(meta.start),
      we = iso(meta.end);
    const visibleStart = ws < monthStartIso ? monthStartIso : ws;
    const visibleEnd = we > monthEndIso ? monthEndIso : we;
    const partial = visibleStart !== ws || visibleEnd !== we;
    return {
      text: partial
        ? `Semaine partielle · ${shortDate(visibleStart)} → ${shortDate(visibleEnd)}`
        : `Semaine · ${shortDate(ws)} → ${shortDate(we)}`,
      partial
    };
  };

  const employeeHtml = employees
    .map(emp => {
      let workedDays = 0,
        incompleteDays = 0,
        leaveDays = 0;
      const pendingDays = d.entries.filter(
        x =>
          x.employeeId === emp.id &&
          x.date >= monthStartIso &&
          x.date <= monthEndIso &&
          x.validationStatus === 'pending'
      ).length;
      const settings = employeeSettings(emp.id);
      const weekTotals = new Map();
      dates.forEach(date => {
        const meta = weekMeta(date);
        weekTotals.set(meta.key, (weekTotals.get(meta.key) || 0) + workMinutesForDay(emp.id, date));
      });
      const visibleDates = dates.filter(date => {
        const entry = d.entries.find(x => x.employeeId === emp.id && x.date === date);
        const leave = leaveForDate(emp.id, date, 'validated');
        const planned = isPlannedWorkingDay(emp.id, date);
        const segs = segmentsFor(emp.id, date);
        return planned || !!entry || !!leave || segs.length > 0;
      });

      const rows = visibleDates
        .map((date, index) => {
          const entry = d.entries.find(x => x.employeeId === emp.id && x.date === date);
          const leave = leaveForDate(emp.id, date, 'validated');
          const planned = isPlannedWorkingDay(emp.id, date);
          const segs = segmentsFor(emp.id, date);

          const info = dayInfoFor(emp.id, date);
          const complete = ['complete', 'off', 'leave'].includes(info.status);
          const total =
            isFullDayLeave(leave) || entry?.status === 'off' ? 0 : workMinutesForDay(emp.id, date);
          const worked = segs.length > 0 || entry?.status === 'worked' || total > 0;
          const incomplete = planned && !complete;
          if (worked) workedDays++;
          if (leave) leaveDays += isFullDayLeave(leave) ? 1 : 0.5;
          if (incomplete) incompleteDays++;

          let status = 'Prévu';
          let statusClass = '';
          if (leave) {
            status = leaveLabel(leave);
            statusClass = 'print-status-leave';
          } else if (entry?.status === 'off') {
            status = 'Non travaillé';
            statusClass = 'print-status-off';
          } else if (incomplete) {
            status = 'À compléter';
            statusClass = 'print-status-incomplete';
          } else if (worked && !planned) {
            status = 'Hors planning';
            statusClass = 'print-status-outside';
          } else if (worked) status = 'Travaillé';

          const pending = entry?.validationStatus === 'pending';
          if (pending) statusClass += (statusClass ? ' ' : '') + 'print-status-pending';

          let detail = '—';
          if (isFullDayLeave(leave)) {
            const note = cleanPdfNote(leave.note);
            detail = note ? ownerEscape(note) : '—';
          } else if (segs.length) {
            detail = segs
              .map(
                s =>
                  `<div class="print-slot"><strong>${ownerEscape(s.employerName || 'Employeur')}</strong><span>${ownerEscape(s.start || '—')} → ${ownerEscape(s.end || '…')}</span></div>`
              )
              .join('');
          } else if (entry?.arrival || entry?.departure) {
            detail = `<div class="print-slot"><strong>Horaire</strong><span>${ownerEscape(entry.arrival || '—')} → ${ownerEscape(entry.departure || '—')}</span></div>`;
          } else if (entry?.status === 'off') {
            detail = 'Journée déclarée non travaillée';
          }

          if (leave && !isFullDayLeave(leave) && cleanPdfNote(leave.note))
            detail = `<div>${ownerEscape(cleanPdfNote(leave.note))}</div>` + detail;
          const cleanedComment = isFullDayLeave(leave) ? '' : cleanPdfNote(entry?.comment || '');
          if (cleanedComment)
            detail += `<div class="print-row-note"><span>Note</span> ${ownerEscape(cleanedComment)}</div>`;

          const pause =
            worked && !isFullDayLeave(leave) && entry?.status !== 'off' && complete
              ? fmtDurationMinutes(Number(entry?.pause || 0))
              : '—';
          const displayTotal = incomplete ? '—' : fmtMin(total);
          const validation = isFullDayLeave(leave)
            ? 'Validé'
            : entry?.validationStatus === 'validated'
              ? 'Validé'
              : pending
                ? 'À valider'
                : '—';

          const meta = weekMeta(date);
          const nextDate = visibleDates[index + 1];
          const nextMeta = nextDate ? weekMeta(nextDate) : null;
          const closesWeek = !nextMeta || nextMeta.key !== meta.key;
          let weekRow = '';
          if (closesWeek) {
            const label = weekLabel(meta);
            const totalWeek = weekTotals.get(meta.key) || 0;
            const weekThursday = compteTempsWeekThursday(meta.start);
            const weekExcess =
              weekThursday >= monthStartIso && weekThursday <= monthEndIso
                ? weekExcessMinutes(emp.id, meta.start)
                : 0;
            weekRow = `<tr class="print-week-total"><td colspan="6"><div><span>${label.text}</span><strong>${fmtMin(totalWeek)} travaillées</strong>${weekExcess ? `<span class="print-week-overtime">+${fmtMin(weekExcess)} au compte temps</span>` : ''}</div></td></tr>`;
          }

          return `<tr class="print-day-row ${statusClass}">
        <td class="print-date-cell">${pdfDateLabel(date)}</td>
        <td class="print-status-cell">${status}</td>
        <td class="print-detail-cell">${detail}</td>
        <td class="print-number-cell">${pause}</td>
        <td class="print-number-cell"><strong>${displayTotal}</strong></td>
        <td class="print-validation-cell">${validation}</td>
      </tr>${weekRow}`;
        })
        .join('');

      const total = totalFor(emp.id, start, end);
      const compteMois = compteTempsMonth(emp.id, start.getFullYear(), start.getMonth());
      const compteSolde = compteTempsBalance(emp.id, monthEndIso);
      const employerLine = [...employerTotalsFor(emp.id, start, end).values()]
        .filter(x => x.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes)
        .map(x => `<span><strong>${ownerEscape(x.name)}</strong> ${fmtMin(x.minutes)}</span>`)
        .join('');
      return `<article class="print-employee">
      <header class="print-employee-head">
        <div>
          <div class="print-kicker">Relevé mensuel des horaires</div>
          <h1>${ownerEscape(emp.name)}</h1>
          <div class="print-period">${ownerEscape(monthLabel(start))}<span class="print-contract"> · contrat ${fmtMin(settings.overtimeThresholdMinutes)} / semaine</span></div>
        </div>
        <div class="print-generated">Édité le ${generatedAt}</div>
      </header>
      <section class="print-summary">
        <div><span>Heures du mois</span><strong>${fmtMin(total)}</strong></div>
        <div><span>Jours travaillés</span><strong>${workedDays}</strong></div>
        <div><span>Jours de congé / RTT</span><strong>${leaveDays}</strong></div>
        <div class="${incompleteDays ? 'print-summary-alert' : ''}"><span>À compléter</span><strong>${incompleteDays}</strong></div>
        <div class="${pendingDays ? 'print-summary-pending' : ''}"><span>À valider</span><strong>${pendingDays}</strong></div>
        <div><span>Compte temps du mois</span><strong>${fmtSignedMin(compteMois.net)}</strong><small>${compteTempsDetail(compteMois)}</small></div>
        <div><span>Compte temps au ${shortDate(monthEndIso)}</span><strong>${fmtSignedMin(compteSolde.net)}</strong><small>depuis le ${shortDate(compteTempsPeriodStart(monthEndIso))}</small></div>
      </section>
      ${employerLine ? `<div class="print-employer-line"><span class="print-employer-label">Par employeur</span>${employerLine}</div>` : ''}
      <table class="print-hours-table">
        <thead><tr><th>Date</th><th>Statut</th><th>Créneaux / employeur</th><th>Pause</th><th>Total</th><th>Validation</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="print-empty">Aucune donnée sur cette période.</td></tr>'}</tbody>
      </table>
      <footer class="print-employee-foot">Suivi des horaires · ${ownerEscape(monthLabel(start))} · ${ownerEscape(emp.name)}</footer>
    </article>`;
    })
    .join('');

  const teamRecap = employerOnly
    ? buildEmployerPages(start, end, EMPLOYEES, employerOnly) +
      buildEmployerEmployeePages(start, end, employerOnly)
    : employeeId === 'all'
      ? buildTeamRecap(start, end, employees) + buildEmployerPages(start, end, employees)
      : '';
  printReport.innerHTML = `${teamRecap}${employeeHtml}<div class="print-global-note">Document généré depuis Suivi des horaires. Les durées affichées correspondent aux saisies enregistrées dans l’application.</div>`;
}
window.addEventListener('focus', async () => {
  if (appView && !appView.classList.contains('hidden') && !saving) {
    try {
      await loadOwnerData();
      renderOwner();
      await refreshOwnerPushUI();
    } catch {}
  }
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

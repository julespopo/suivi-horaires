const params=new URLSearchParams(location.search);
const OWNER_LINK_KEY='hours_owner_link_token_v1';
let linkToken=params.get('access')||params.get('token')||localStorage.getItem(OWNER_LINK_KEY)||'';
if(params.get('access')||params.get('token'))localStorage.setItem(OWNER_LINK_KEY,linkToken);
let completionCursor=new Date(),planningDate='',ownerEditEmployee='',ownerEditDate='',saving=false,planningView='month',planningSelectionMode=false,selectedPlanningDates=new Set();
if(!linkToken){invalidView.classList.remove('hidden')}else{bootOwner()}
async function bootOwner(){
  if(isOwnerSession(linkToken)){
    try{await loadOwnerData();showApp();return}catch(e){clearSession()}
  }
  authView.classList.remove('hidden');
}
let floatingMenuOpen=false;
function toggleFloatingMenu(){floatingMenuOpen?closeFloatingMenu():openFloatingMenu()}
function openFloatingMenu(){floatingMenuOpen=true;floatingActions.classList.add('open');floatingActions.setAttribute('aria-hidden','false');floatingActions.querySelectorAll('.floating-action').forEach(btn=>btn.tabIndex=0);floatingSettings.classList.add('menu-open');floatingSettings.setAttribute('aria-expanded','true')}
function closeFloatingMenu(){floatingMenuOpen=false;floatingActions.classList.remove('open');floatingActions.setAttribute('aria-hidden','true');floatingActions.querySelectorAll('.floating-action').forEach(btn=>btn.tabIndex=-1);floatingSettings.classList.remove('menu-open');floatingSettings.setAttribute('aria-expanded','false')}
function toggleThemeFromFloatingMenu(){toggleTheme();closeFloatingMenu()}
document.addEventListener('pointerdown',e=>{if(floatingMenuOpen&&!floatingSettings.contains(e.target)&&!floatingActions.contains(e.target))closeFloatingMenu()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeFloatingMenu()});
async function login(){
  if(saving)return;pinError.textContent='';const v=pin.value.replace(/\D/g,'');if(v.length!==4){pinError.textContent='Entrez les 4 chiffres du PIN.';return}
  saving=true;loginBtn.disabled=true;loginBtn.textContent='Connexion…';
  try{await ownerLogin(linkToken,v);await loadOwnerData();showApp()}catch(e){const msg=friendlyError(e);pinError.textContent=(msg==='Une erreur est survenue. Réessayez.'&&(e?.status===400||e?.status===401||e?.status===403))?'PIN incorrect.':msg}finally{saving=false;loginBtn.disabled=false;loginBtn.textContent='Continuer'}
}
pin?.addEventListener('input',()=>pin.value=pin.value.replace(/\D/g,'').slice(0,4));pin?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});loginBtn?.addEventListener('click',login);
function showApp(){authView.classList.add('hidden');appView.classList.remove('hidden');floatingSettings.classList.remove('hidden');renderOwner();refreshOwnerPushUI()}
async function withOwnerSave(fn){if(saving)return;saving=true;document.body.classList.add('is-saving');try{await fn()}catch(e){if(String(e.message).includes('unauthorized')){clearSession();location.reload();return}alert(friendlyError(e))}finally{saving=false;document.body.classList.remove('is-saving')}}

async function refreshOwnerPushUI(){
  if(!ownerPushStatus)return;
  if(!pushSupported()){
    ownerPushStatus.textContent='Non compatible';
    ownerPushStatus.className='status warn';
    ownerPushToggleBtn.disabled=true;
    ownerPushHelp.textContent='Ce navigateur ne prend pas en charge les notifications push.';
    return;
  }
  const ua=navigator.userAgent||'';
  const isiOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS&&!isStandalonePWA()){
    ownerPushStatus.textContent='Installation requise';
    ownerPushStatus.className='status warn';
    ownerPushToggleBtn.textContent='Activer les notifications';
    ownerPushTestBtn.classList.add('hidden');
    ownerPushHelp.textContent='Sur iPhone : Partager → Ajouter à l’écran d’accueil, puis ouvre le pilotage depuis son icône.';
    return;
  }
  const enabled=await ownerPushEnabled();
  if(enabled&&Notification.permission==='granted'){
    ownerPushStatus.textContent='Activées';
    ownerPushStatus.className='status ok';
    ownerPushToggleBtn.textContent='Désactiver les notifications';
    ownerPushToggleBtn.className='btn btn-outline';
    ownerPushTestBtn.classList.remove('hidden');
    ownerPushHelp.textContent='À 19h, une synthèse est envoyée s’il y a au moins un employé prévu au travail.';
  }else{
    ownerPushStatus.textContent=Notification.permission==='denied'?'Bloquées':'Désactivées';
    ownerPushStatus.className='status '+(Notification.permission==='denied'?'warn':'neutral');
    ownerPushToggleBtn.textContent='Activer les notifications';
    ownerPushToggleBtn.className='btn btn-primary';
    ownerPushTestBtn.classList.add('hidden');
    ownerPushHelp.textContent=Notification.permission==='denied'
      ?'Réactive les notifications dans les réglages du navigateur ou du téléphone.'
      :'Aucune synthèse n’est envoyée tant que tu ne les actives pas.';
  }
}
async function toggleOwnerPushSummary(){
  ownerPushToggleBtn.disabled=true;
  try{
    const enabled=await ownerPushEnabled();
    if(enabled)await disableOwnerPushSummary();else await enableOwnerPushSummary();
    await refreshOwnerPushUI();
  }catch(e){
    alert(friendlyError(e));
    await refreshOwnerPushUI();
  }finally{ownerPushToggleBtn.disabled=false}
}
async function testOwnerPushSummary(){
  try{await showOwnerLocalTestNotification()}catch(e){alert(friendlyError(e))}
}

function toggleLog(){const open=logPanel.classList.contains('hidden');logPanel.classList.toggle('hidden',!open);logToggleBtn.textContent=open?'Masquer':'Afficher'}
function renderTeamChart(target,values,showObjective=false){const max=Math.max(...values.map(x=>Math.max(x.minutes,x.objective||0)),1);target.innerHTML=values.map(x=>{const pct=Math.max(3,Math.round((x.minutes/max)*100));const objectivePct=x.objective?Math.min(100,Math.round((x.objective/max)*100)):0;return `<div class="team-chart-row"><div class="team-chart-head"><strong>${x.name}</strong><span>${fmtMin(x.minutes)}${showObjective?` <small class="chart-delta ${x.minutes>=x.objective?'positive':'negative'}">${fmtSignedMin(x.minutes-x.objective)}</small>`:''}</span></div><div class="team-chart-track"><div class="team-chart-fill" style="width:${pct}%"></div>${showObjective?`<i class="objective-marker" style="left:${objectivePct}%" title="Objectif ${fmtMin(x.objective)}"></i>`:''}</div></div>`}).join('')}
function planningWeekBounds(ref=completionCursor){const start=startOfWeek(ref),end=endOfWeek(ref);return [start,end]}
function setPlanningView(view){planningView=view==='week'?'week':'month';planningMonthBtn.classList.toggle('active-chip',planningView==='month');planningWeekBtn.classList.toggle('active-chip',planningView==='week');selectedPlanningDates.clear();syncPlanningSelectionUi();renderCompletionCalendar()}
function shiftPlanningPeriod(step){
  if(planningView==='week'){completionCursor=new Date(completionCursor);completionCursor.setDate(completionCursor.getDate()+step*7)}
  else{completionCursor=new Date(completionCursor.getFullYear(),completionCursor.getMonth()+step,1,12)}
  const min=dateObjFromIso(APP_START_DATE);
  if(completionCursor<min)completionCursor=new Date(min);
  selectedPlanningDates.clear();syncPlanningSelectionUi();renderCompletionCalendar()
}
function togglePlanningSelectionMode(){planningSelectionMode=!planningSelectionMode;if(!planningSelectionMode)selectedPlanningDates.clear();syncPlanningSelectionUi();renderCompletionCalendar()}
function clearPlanningSelection(){selectedPlanningDates.clear();planningSelectionMode=false;syncPlanningSelectionUi();renderCompletionCalendar()}
function togglePlanningDateSelection(date){if(selectedPlanningDates.has(date))selectedPlanningDates.delete(date);else selectedPlanningDates.add(date);syncPlanningSelectionUi();renderCompletionCalendar()}
function syncPlanningSelectionUi(){if(!multiSelectBtn)return;multiSelectBtn.classList.toggle('active-chip',planningSelectionMode);multiSelectBtn.textContent=planningSelectionMode?'Terminer la sélection':'Sélection multiple';bulkPlanningBar.classList.toggle('hidden',!planningSelectionMode);const n=selectedPlanningDates.size;bulkPlanningCount.textContent=`${n} jour${n>1?'s':''} sélectionné${n>1?'s':''}`}
async function setSelectedDaysWorking(){const dates=[...selectedPlanningDates].sort();if(!dates.length)return;if(!confirm(`Mettre ${dates.length} jour${dates.length>1?'s':''} en travaillé pour toute l’équipe ?`))return;await withOwnerSave(async()=>{for(const date of dates){for(const emp of EMPLOYEES)await setPlannedWorkingDay(emp.id,date,true)}await loadOwnerData();selectedPlanningDates.clear();planningSelectionMode=false;syncPlanningSelectionUi();renderOwner()})}
async function setSelectedDaysNonWorking(){const dates=[...selectedPlanningDates].sort();if(!dates.length)return;if(!confirm(`Mettre ${dates.length} jour${dates.length>1?'s':''} en non travaillé pour toute l’équipe ?`))return;await withOwnerSave(async()=>{for(const date of dates){for(const emp of EMPLOYEES)await setPlannedWorkingDay(emp.id,date,false)}await loadOwnerData();selectedPlanningDates.clear();planningSelectionMode=false;syncPlanningSelectionUi();renderOwner()})}
function completionForDate(date){
  const planned=EMPLOYEES.filter(e=>isPlannedWorkingDay(e.id,date));
  if(!planned.length)return {kind:'weekend',count:0,total:0,label:'Personne prévue',planned};
  const count=planned.filter(e=>{
    const info=dayInfoFor(e.id,date);
    return info.status==='complete'||info.status==='off';
  }).length;
  if(count===planned.length)return {kind:'all',count,total:planned.length,label:'Complet',planned};
  if(count===0)return {kind:'none',count,total:planned.length,label:'Non rempli',planned};
  return {kind:'partial',count,total:planned.length,label:`${count}/${planned.length} remplis`,planned};
}
function renderCompletionCalendar(){let start,end,dates,blanks='';if(planningView==='week'){[start,end]=planningWeekBounds();dates=listDates(start,end);completionMonthLabel.textContent=`${shortDate(iso(start))} – ${shortDate(iso(end))}`}else{start=new Date(completionCursor.getFullYear(),completionCursor.getMonth(),1,12);end=new Date(completionCursor.getFullYear(),completionCursor.getMonth()+1,0,12);dates=listDates(start,end);completionMonthLabel.textContent=monthLabel(start);const firstDow=(start.getDay()+6)%7;blanks=Array.from({length:firstDow},()=>'<div class="calendar-empty"></div>').join('')}const today=iso();const head=`<div class="calendar-head">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div>${d}</div>`).join('')}</div>`;const cells=dates.map(date=>{const info=completionForDate(date),d=dateObjFromIso(date),selected=selectedPlanningDates.has(date);const cls=['completion-day',info.kind,date===today?'today':'',selected?'selected-for-bulk':'',planningView==='week'?'week-detail-day':''].filter(Boolean).join(' ');const action=planningSelectionMode?`togglePlanningDateSelection('${date}')`:`openPlanning('${date}')`;const names=planningView==='week'?`<div class="working-names">${info.planned.length?info.planned.map(e=>`<span>${e.name}</span>`).join(''):'<span class="nobody">Personne</span>'}</div>`:'';const label=info.kind==='weekend'?'Repos':info.label;return `<button class="${cls}" onclick="${action}"><div class="completion-number">${planningView==='week'?new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric'}).format(d):d.getDate()}</div><div class="completion-label">${label}</div>${names}${planningSelectionMode?`<div class="bulk-check">${selected?'✓':''}</div>`:''}</button>`}).join('');completionCalendar.innerHTML=`${head}<div class="calendar-grid completion-grid ${planningView==='week'?'planning-week-grid':''}">${blanks}${cells}</div>`}
function openPlanning(date){planningDate=date;planningDateLabel.textContent=longDate(date);planningRows.innerHTML=EMPLOYEES.map(emp=>planningRow(emp,date)).join('');planningModal.classList.add('open')}
function planningRow(emp,date){const working=isPlannedWorkingDay(emp.id,date),info=dayInfoFor(emp.id,date),entry=info.entry,validation=entry?.validationStatus==='validated'?'Validé':entry?.validationStatus==='pending'?'À valider':'—';return `<div class="planning-row"><div class="planning-person"><strong>${emp.name}</strong><span class="subtle">${entry?(entry.status==='off'?'Non travaillé déclaré':entry.arrival&&entry.departure?`${entry.arrival} – ${entry.departure} · ${fmtMin(info.minutes)}`:'Saisie incomplète'):'Aucune saisie'} · ${validation}</span></div><label class="planning-check"><input type="checkbox" data-plan-emp="${emp.id}" ${working?'checked':''}> Travaillé</label><div class="planning-actions">${entry&&entry.arrival&&entry.departure&&entry.validationStatus!=='validated'?`<button class="btn btn-green btn-small" onclick="validateFromPlanning('${emp.id}','${date}')">Valider</button>`:''}<button class="btn btn-outline btn-small" onclick="openOwnerEdit('${emp.id}','${date}')">Modifier</button></div></div>`}
function setAllPlanning(value){document.querySelectorAll('[data-plan-emp]').forEach(x=>x.checked=value)}
async function savePlanning(){const changes=[...document.querySelectorAll('[data-plan-emp]')].map(x=>({empId:x.dataset.planEmp,value:x.checked}));await withOwnerSave(async()=>{await Promise.all(changes.map(x=>setPlannedWorkingDay(x.empId,planningDate,x.value)));await loadOwnerData();closePlanning();renderOwner()})}
function closePlanning(){planningModal.classList.remove('open')}
async function validateFromPlanning(empId,date){await withOwnerSave(async()=>{await validateEntry(empId,date);openPlanning(date);renderOwner()})}
function openOwnerEdit(empId,date){ownerEditEmployee=empId;ownerEditDate=date;const emp=EMPLOYEES.find(e=>e.id===empId),e=entryFor(empId,date,false)||{status:'worked',arrival:'',departure:'',pause:45,comment:'',validationStatus:'pending'};ownerEditSubtitle.textContent=`${emp?.name||empId} · ${longDate(date)}`;ownerArrival.value=e.arrival||'';ownerDeparture.value=e.departure||'';ownerPause.value=e.pause??45;ownerComment.value=e.comment||'';ownerOff.checked=e.status==='off';ownerValidation.value=e.validationStatus==='validated'?'validated':'pending';toggleOwnerFields();ownerEditModal.classList.add('open');setTimeout(()=>ownerArrival.focus(),30)}
function closeOwnerEdit(){ownerEditModal.classList.remove('open')}
function toggleOwnerFields(){ownerArrival.disabled=ownerOff.checked;ownerDeparture.disabled=ownerOff.checked;ownerPause.disabled=ownerOff.checked}
ownerOff?.addEventListener('change',toggleOwnerFields);
async function saveOwnerEdit(){const off=ownerOff.checked;if(!off&&(!ownerArrival.value||!ownerDeparture.value)){alert('Renseigne l’arrivée et le départ, ou choisis « Jour non travaillé ».');return}await withOwnerSave(async()=>{await ownerUpdateEntry(ownerEditEmployee,ownerEditDate,{status:off?'off':'worked',arrival:off?'':ownerArrival.value,departure:off?'':ownerDeparture.value,pause:Number(ownerPause.value||0),comment:ownerComment.value},ownerValidation.value);closeOwnerEdit();if(planningModal.classList.contains('open'))openPlanning(planningDate);renderOwner()})}
function openSettings(){settingsRows.innerHTML=EMPLOYEES.map(emp=>{const s=employeeSettings(emp.id);return `<div class="settings-row"><strong>${emp.name}</strong><div class="field"><label>Heures prévues par semaine</label><input type="number" min="0" step="0.25" data-objective="${emp.id}" value="${(s.weeklyObjectiveMinutes/60).toFixed(2)}"></div><div class="field"><label>Signaler un dépassement à partir de</label><input type="number" min="0" step="0.25" data-threshold="${emp.id}" value="${(s.overtimeThresholdMinutes/60).toFixed(2)}"></div></div>`}).join('');settingsModal.classList.add('open')}
function closeSettings(){settingsModal.classList.remove('open')}
async function saveSettings(){const changes=EMPLOYEES.map(emp=>({empId:emp.id,weeklyObjectiveMinutes:Math.round(Number(document.querySelector(`[data-objective="${emp.id}"]`).value||0)*60),overtimeThresholdMinutes:Math.round(Number(document.querySelector(`[data-threshold="${emp.id}"]`).value||0)*60)}));await withOwnerSave(async()=>{for(const change of changes)await setEmployeeSettings(change.empId,change);closeSettings();renderOwner()})}
function exportMonthlyPDF(){buildPrintReport();setTimeout(()=>window.print(),50)}
function buildPrintReport(){const start=new Date(completionCursor.getFullYear(),completionCursor.getMonth(),1,12),end=new Date(completionCursor.getFullYear(),completionCursor.getMonth()+1,0,12),dates=listDates(start,end),d=getData();printReport.innerHTML=`<div class="print-header"><h1>Relevé mensuel des horaires</h1><p>${monthLabel(start)}</p></div>${EMPLOYEES.map(emp=>{const entries=dates.map(date=>{const e=d.entries.find(x=>x.employeeId===emp.id&&x.date===date),planned=isPlannedWorkingDay(emp.id,date);if(!planned&&!e)return '';const total=e&&e.status!=='off'?workMinutesForDay(emp.id,date):0;return `<tr><td>${shortDate(date)}</td><td>${planned?'Oui':'Non'}</td><td>${e?.status==='off'?'Non travaillé':e?.arrival||'—'}</td><td>${e?.status==='off'?'—':e?.departure||'—'}</td><td>${e?.status==='off'?'—':(e?.pause!=null?fmtDurationMinutes(e.pause):'—')}</td><td>${e?.status==='off'?'0h00':fmtMin(total)}</td><td>${e?.validationStatus==='validated'?'Validé':e?.validationStatus==='pending'?'À valider':'—'}</td></tr>`}).join('');const total=totalFor(emp,start,end),s=employeeSettings(emp.id);return `<article class="print-employee"><h2>${emp.name}</h2><div class="print-summary"><span>Total du mois : <strong>${fmtMin(total)}</strong></span><span>Objectif hebdo : <strong>${fmtMin(s.weeklyObjectiveMinutes)}</strong></span><span>Seuil indicatif : <strong>${fmtMin(s.overtimeThresholdMinutes)}</strong></span></div><table><thead><tr><th>Date</th><th>Prévu</th><th>Arrivée / statut</th><th>Départ</th><th>Pause</th><th>Total</th><th>Validation</th></tr></thead><tbody>${entries||'<tr><td colspan="7">Aucune donnée</td></tr>'}</tbody></table></article>`}).join('')}<div class="print-note">Document généré depuis le suivi des horaires. Les seuils affichés sont indicatifs tant que les règles contractuelles exactes ne sont pas paramétrées.</div>`}
function renderOwner(){const [ws,we]=weekBounds(),[ms,me]=monthBounds();const weekValues=EMPLOYEES.map(e=>({name:e.name,minutes:totalFor(e.id,ws,we),objective:employeeSettings(e.id).weeklyObjectiveMinutes})),monthValues=EMPLOYEES.map(e=>({name:e.name,minutes:totalFor(e.id,ms,me)}));cards.innerHTML=EMPLOYEES.map(e=>{const week=totalFor(e.id,ws,we),month=totalFor(e.id,ms,me),s=employeeSettings(e.id),pendingV=pendingValidationCount(e.id),thresholdReached=s.overtimeThresholdMinutes>0&&week>=s.overtimeThresholdMinutes;const badges=`<div class="kpi-badges">${pendingV?`<span class="status warn">${pendingV} à valider</span>`:'<span class="status ok">À jour</span>'}${thresholdReached?`<span class="status warn">Seuil atteint</span>`:''}</div>`;return `<div class="card kpi"><div class="row"><div class="h3">${e.name}</div>${badges}</div><div class="stat-list"><div class="stat-line"><span class="subtle">Semaine</span><strong>${fmtMin(week)}</strong></div><div class="stat-line"><span class="subtle">Prévu / semaine</span><strong>${fmtMin(s.weeklyObjectiveMinutes)}</strong></div><div class="stat-line"><span class="subtle">Écart</span><strong class="${week>=s.weeklyObjectiveMinutes?'text-positive':'text-muted'}">${fmtSignedMin(week-s.weeklyObjectiveMinutes)}</strong></div><div class="stat-line"><span class="subtle">Mois</span><strong>${fmtMin(month)}</strong></div></div></div>`}).join('');renderTeamChart(weekTeamChart,weekValues,true);renderTeamChart(monthTeamChart,monthValues,false);planningMonthBtn?.classList.toggle('active-chip',planningView==='month');planningWeekBtn?.classList.toggle('active-chip',planningView==='week');syncPlanningSelectionUi();renderCompletionCalendar();const tasks=EMPLOYEES.flatMap(e=>tasksFor(e.id).map(t=>({...t,name:e.name,employeeId:e.id})));pendingBadge.textContent=tasks.length?`${tasks.length} saisie${tasks.length>1?'s':''} à compléter`:'Tout est à jour';pendingBadge.className='status '+(tasks.length?'warn':'ok');pending.innerHTML=tasks.length?tasks.map(t=>`<div class="task row"><div><div class="task-title">${t.name}</div><div class="task-meta">${frDate(t.date)} · ${t.missing}</div></div><button class="btn btn-outline btn-small" onclick="openOwnerEdit('${t.employeeId}','${t.date}')">Corriger</button></div>`).join(''):'<div class="empty">Aucune journée à compléter.</div>';const validations=getData().entries.filter(e=>e.validationStatus==='pending'&&(e.status==='off'||(e.arrival&&e.departure))).sort((a,b)=>b.date.localeCompare(a.date));validationBadge.textContent=validations.length?`${validations.length} à valider`:'Tout est validé';validationBadge.className='status '+(validations.length?'warn':'ok');validationList.innerHTML=validations.length?validations.map(x=>{const emp=EMPLOYEES.find(e=>e.id===x.employeeId);return `<div class="validation-row"><div><strong>${emp?.name||x.employeeId}</strong><div class="subtle">${frDate(x.date)} · ${x.status==='off'?'Non travaillé':`${x.arrival} – ${x.departure} · ${fmtMin(workMinutesForDay(x.employeeId,x.date))}`}</div></div><div class="toolbar-actions"><button class="btn btn-green btn-small" onclick="validateAndRefresh('${x.employeeId}','${x.date}')">Valider</button><button class="btn btn-outline btn-small" onclick="openOwnerEdit('${x.employeeId}','${x.date}')">Modifier</button></div></div>`}).join(''):'<div class="empty">Aucune journée en attente de validation.</div>';const data=getData().entries.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.employeeId.localeCompare(b.employeeId)).slice(0,50);rows.innerHTML=data.map(x=>{const e=EMPLOYEES.find(y=>y.id===x.employeeId),off=x.status==='off';return `<tr><td>${e?.name||x.employeeId}</td><td>${shortDate(x.date)}</td><td>${off?'—':x.arrival||'—'}</td><td>${off?'—':x.departure||'—'}</td><td>${off?'—':fmtDurationMinutes(x.pause||0)}</td><td><strong>${off?'0h00':fmtMin(workMinutesForDay(x.employeeId,x.date))}</strong></td><td><span class="status ${x.validationStatus==='validated'?'ok':x.validationStatus==='pending'?'warn':'neutral'}">${x.validationStatus==='validated'?'Validé':x.validationStatus==='pending'?'À valider':'—'}</span></td></tr>`}).join('')}
async function validateAndRefresh(empId,date){await withOwnerSave(async()=>{await validateEntry(empId,date);renderOwner()})}
function openOwnerAccountSettings(){ownerCurrentPin.value='';ownerNewPin.value='';ownerConfirmPin.value='';ownerPinError.textContent='';ownerAccountSettingsModal.classList.add('open');setTimeout(()=>ownerCurrentPin.focus(),40)}
function closeOwnerAccountSettings(){ownerAccountSettingsModal.classList.remove('open')}
[ownerCurrentPin,ownerNewPin,ownerConfirmPin].forEach(el=>el?.addEventListener('input',()=>el.value=el.value.replace(/\D/g,'').slice(0,4)));
ownerConfirmPin?.addEventListener('keydown',e=>{if(e.key==='Enter')saveNewOwnerPin()});
async function saveNewOwnerPin(){ownerPinError.textContent='';const current=ownerCurrentPin.value,newPin=ownerNewPin.value,confirm=ownerConfirmPin.value;if(!/^\d{4}$/.test(current)||!/^\d{4}$/.test(newPin)){ownerPinError.textContent='Les PIN doivent contenir 4 chiffres.';return}if(newPin!==confirm){ownerPinError.textContent='La confirmation ne correspond pas.';return}ownerSavePinBtn.disabled=true;ownerSavePinBtn.textContent='Modification…';try{await changeOwnerPin(current,newPin);ownerCurrentPin.value='';ownerNewPin.value='';ownerConfirmPin.value='';alert('PIN de pilotage modifié.')}catch(e){ownerPinError.textContent=friendlyError(e)}finally{ownerSavePinBtn.disabled=false;ownerSavePinBtn.textContent='Changer le PIN'}}

// -------------------- V2.0 : employeurs, congés et créneaux --------------------
function ownerEscape(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function assignmentActive(employeeId,employerId){return V2_DATA.assignments.some(a=>a.employeeId===employeeId&&a.employerId===employerId&&a.active)}
function renderEmployersV2(){
  const active=V2_DATA.employers.filter(e=>e.active),archived=V2_DATA.employers.filter(e=>!e.active);
  const activeHtml=active.length?active.map(e=>`<div class="employer-admin-card"><div class="row"><strong>${ownerEscape(e.name)}</strong><button class="btn btn-outline btn-small" onclick="archiveEmployer('${e.id}')">Archiver</button></div><div class="employer-assignment-grid section">${EMPLOYEES.map(emp=>`<label class="assignment-check"><input type="checkbox" ${assignmentActive(emp.id,e.id)?'checked':''} onchange="toggleEmployerAssignment('${emp.id}','${e.id}',this.checked)"> ${ownerEscape(emp.name)}</label>`).join('')}</div></div>`).join(''):'<div class="empty">Aucun employeur actif.</div>';
  const archivedHtml=archived.length?`<details class="archived-employers section"><summary>Employeurs archivés (${archived.length})</summary><div class="archived-employer-list">${archived.map(e=>`<div class="archived-employer-row"><span>${ownerEscape(e.name)}</span><button class="btn btn-outline btn-small" onclick="restoreEmployer('${e.id}')">Réactiver</button></div>`).join('')}</div></details>`:'';
  employerList.innerHTML=activeHtml+archivedHtml;
}
function openEmployerModal(){newEmployerName.value='';employerModal.classList.add('open');setTimeout(()=>newEmployerName.focus(),30)}
function closeEmployerModal(){employerModal.classList.remove('open')}
async function createEmployerFromModal(){const name=newEmployerName.value.trim();if(name.length<2){alert('Entre un nom d’employeur.');return}await withOwnerSave(async()=>{await ownerCreateEmployer(name);closeEmployerModal();renderOwner()})}
async function archiveEmployer(id){if(!confirm('Archiver cet employeur ? Son historique sera conservé.'))return;await withOwnerSave(async()=>{await ownerSetEmployerActive(id,false);renderOwner()})}
async function restoreEmployer(id){await withOwnerSave(async()=>{await ownerSetEmployerActive(id,true);renderOwner()})}
async function toggleEmployerAssignment(employeeId,employerId,active){await withOwnerSave(async()=>{await ownerSetEmployeeEmployer(employeeId,employerId,active);renderOwner()})}

function ownerLeaveStatus(status){return status==='validated'?'Validé':status==='rejected'?'Refusé':'À valider'}
function renderOwnerLeavesV2(){
  const leaves=[...V2_DATA.leaves].sort((a,b)=>{const pa=a.status==='pending'?0:a.status==='validated'?1:2,pb=b.status==='pending'?0:b.status==='validated'?1:2;return pa-pb||b.startDate.localeCompare(a.startDate)});
  const pending=leaves.filter(l=>l.status==='pending').length;
  ownerLeaveBadge.textContent=pending?`${pending} demande${pending>1?'s':''} en attente`:'Aucune demande en attente';
  ownerLeaveBadge.className='status '+(pending?'warn':'ok');
  ownerLeaveList.innerHTML=leaves.length?leaves.map(l=>{const emp=EMPLOYEES.find(e=>e.id===l.employeeId);const statusChip=l.status==='pending'?'':`<span class="status ${l.status==='validated'?'ok':'off'}">${ownerLeaveStatus(l.status)}</span>`;return `<div class="leave-row leave-${l.status}"><div class="leave-main"><strong>${ownerEscape(emp?.name||'Salarié')} · ${shortDate(l.startDate)} → ${shortDate(l.endDate)}</strong><div class="subtle">${l.note?ownerEscape(l.note)+' · ':''}${l.requestedBy==='owner'?'Ajouté par le pilotage':'Demandé par le salarié'}</div></div><div class="leave-actions">${statusChip}${l.status==='pending'?`<button class="btn btn-green btn-small" onclick="reviewOwnerLeave('${l.id}','validated')">Valider</button><button class="btn btn-outline btn-small" onclick="reviewOwnerLeave('${l.id}','rejected')">Refuser</button>`:`<button class="btn btn-outline btn-small" onclick="deleteOwnerLeave('${l.id}')">Supprimer</button>`}</div></div>`}).join(''):'<div class="empty">Aucun congé déclaré.</div>';
}
let ownerLeaveRangeControl=null;try{if(typeof createDateRangePicker==='function')ownerLeaveRangeControl=createDateRangePicker(document.getElementById('ownerLeaveRangePicker'),ownerLeaveStart,ownerLeaveEnd)}catch(e){console.error('Owner range picker unavailable',e)}
function openOwnerLeaveModal(){
  ownerLeaveEmployee.innerHTML=EMPLOYEES.map(e=>`<option value="${e.id}">${ownerEscape(e.name)}</option>`).join('');
  ownerLeaveNote.value='';
  if(ownerLeaveRangeControl){ownerLeaveRangeControl.reset('','')}else{ownerLeaveStart.type='date';ownerLeaveEnd.type='date';ownerLeaveStart.value=iso();ownerLeaveEnd.value=iso()}
  ownerLeaveModal.classList.add('open');
}
function closeOwnerLeaveModal(){ownerLeaveModal.classList.remove('open')}
async function createOwnerLeave(){
  if(!ownerLeaveEmployee.value){alert('Choisis un salarié.');return}
  if(!ownerLeaveStart.value){alert('Choisis le premier jour de congé.');return}
  if(!ownerLeaveEnd.value)ownerLeaveEnd.value=ownerLeaveStart.value;
  await withOwnerSave(async()=>{await ownerCreateLeave(ownerLeaveEmployee.value,ownerLeaveStart.value,ownerLeaveEnd.value,ownerLeaveNote.value);closeOwnerLeaveModal();renderOwner()})
}
async function reviewOwnerLeave(id,status){await withOwnerSave(async()=>{await ownerReviewLeave(id,status);renderOwner()})}
async function deleteOwnerLeave(id){if(!confirm('Supprimer cette période de congé ?'))return;await withOwnerSave(async()=>{await ownerDeleteLeave(id);renderOwner()})}

completionForDate=function(date){
  const planned=EMPLOYEES.filter(e=>{const entry=entryFor(e.id,date,false),actual=segmentsFor(e.id,date).length>0||entry?.status==='worked';return !isOnValidatedLeave(e.id,date)&&entry?.status!=='off'&&(isPlannedWorkingDay(e.id,date)||actual)});
  if(!planned.length)return {kind:'weekend',count:0,total:0,label:'Personne prévue',planned};
  const count=planned.filter(e=>dayInfoFor(e.id,date).status==='complete').length;
  if(count===planned.length)return {kind:'all',count,total:planned.length,label:'Complet',planned};
  if(count===0)return {kind:'none',count,total:planned.length,label:'Non rempli',planned};
  return {kind:'partial',count,total:planned.length,label:`${count}/${planned.length} remplis`,planned};
};

planningRow=function(emp,date){
  const working=isPlannedWorkingDay(emp.id,date),info=dayInfoFor(emp.id,date),entry=info.entry,leave=leaveForDate(emp.id,date,'validated'),segs=segmentsFor(emp.id,date),validation=entry?.validationStatus==='validated'?'Validé':entry?.validationStatus==='pending'?'À valider':'—';
  let detail='Aucune saisie';
  if(leave)detail=`Congé validé · ${shortDate(leave.startDate)} → ${shortDate(leave.endDate)}`;
  else if(entry?.status==='off')detail='Non travaillé déclaré';
  else if(segs.length)detail=segs.map(s=>`${s.employerName} ${s.start}–${s.end||'…'}`).join(' · ')+` · ${fmtMin(info.minutes)}`;
  else if(entry?.arrival&&entry?.departure)detail=`${entry.arrival} – ${entry.departure} · ${fmtMin(info.minutes)}`;
  else if(entry)detail='Saisie incomplète';
  return `<div class="planning-row ${leave?'is-leave':''}"><div class="planning-person"><strong>${ownerEscape(emp.name)}</strong><span class="subtle">${ownerEscape(detail)} · ${validation}</span></div><label class="planning-check"><input type="checkbox" data-plan-emp="${emp.id}" ${working?'checked':''}> Travaillé</label><div class="planning-actions">${entry&&entry.arrival&&entry.departure&&entry.validationStatus!=='validated'&&!leave?`<button class="btn btn-green btn-small" onclick="validateFromPlanning('${emp.id}','${date}')">Valider</button>`:''}${!leave?`<button class="btn btn-outline btn-small" onclick="openOwnerEdit('${emp.id}','${date}')">Modifier</button>`:''}</div></div>`;
};

let ownerSegmentsDraft=[],ownerPauseTouched=false;
function ownerEmployerOptions(empId,selected=''){
  const assigned=assignedEmployers(empId),selectedEmployer=employerFor(selected),list=[...assigned];
  if(selectedEmployer&&!list.some(e=>e.id===selectedEmployer.id))list.push(selectedEmployer);
  if(!list.length)V2_DATA.employers.filter(e=>e.active).forEach(e=>list.push(e));
  return list.map(e=>`<option value="${e.id}" ${e.id===selected?'selected':''}>${ownerEscape(e.name)}</option>`).join('');
}
function syncOwnerDraftFromDom(){ownerSegmentsDraft=ownerSegmentsDraft.map((s,i)=>({employerId:ownerSegmentsEditor.querySelector(`[data-owner-seg-employer="${i}"]`)?.value||s.employerId,start:ownerSegmentsEditor.querySelector(`[data-owner-seg-start="${i}"]`)?.value||'',end:ownerSegmentsEditor.querySelector(`[data-owner-seg-end="${i}"]`)?.value||''}))}
function renderOwnerSegmentsEditor(){ownerSegmentsEditor.innerHTML=ownerSegmentsDraft.length?ownerSegmentsDraft.map((s,i)=>`<div class="segment-edit-row"><div class="field"><label>Employeur</label><select data-owner-seg-employer="${i}">${ownerEmployerOptions(ownerEditEmployee,s.employerId)}</select></div><div class="field"><label>Arrivée</label><input type="time" data-owner-seg-start="${i}" value="${s.start||''}"></div><div class="field"><label>Départ</label><input type="time" data-owner-seg-end="${i}" value="${s.end||''}"></div><button class="btn btn-outline btn-small segment-remove" type="button" onclick="removeOwnerSegmentRow(${i})">Retirer</button></div>`).join(''):'<div class="empty">Aucun créneau saisi.</div>';ownerSegmentsEditor.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{syncOwnerDraftFromDom();updateOwnerDayTotal()}))}
function addOwnerSegmentRow(){syncOwnerDraftFromDom();const choices=assignedEmployers(ownerEditEmployee).length?assignedEmployers(ownerEditEmployee):V2_DATA.employers.filter(e=>e.active);if(!choices.length){alert('Ajoute d’abord un employeur.');return}ownerSegmentsDraft.push({employerId:choices[0].id,start:'',end:''});if(ownerSegmentsDraft.length===2&&!ownerPauseTouched)ownerPause.value='0h00';renderOwnerSegmentsEditor();updateOwnerDayTotal()}
function removeOwnerSegmentRow(i){syncOwnerDraftFromDom();ownerSegmentsDraft.splice(i,1);if(ownerSegmentsDraft.length<=1&&!ownerPauseTouched)ownerPause.value='1h30';renderOwnerSegmentsEditor();updateOwnerDayTotal()}
function addOwnerPauseMinutes(delta){const p=parseDurationMinutes(ownerPause.value);ownerPauseTouched=true;ownerPause.value=fmtDurationMinutes(Math.max(0,Math.min(720,(p===null?0:p)+Number(delta||0))));updateOwnerDayTotal()}
document.querySelectorAll('[data-owner-pause-add]').forEach(btn=>btn.addEventListener('click',()=>addOwnerPauseMinutes(btn.dataset.ownerPauseAdd)));
ownerPause?.addEventListener('input',()=>{ownerPauseTouched=true;updateOwnerDayTotal()});
ownerPause?.addEventListener('change',()=>{const p=parseDurationMinutes(ownerPause.value);ownerPause.value=fmtDurationMinutes(p===null?0:p);updateOwnerDayTotal()});
ownerOff?.addEventListener('change',()=>{ownerWorkedFields.classList.toggle('hidden',ownerOff.checked);updateOwnerDayTotal()});

openOwnerEdit=function(empId,date){
  ownerEditEmployee=empId;ownerEditDate=date;const emp=EMPLOYEES.find(e=>e.id===empId),entry=entryFor(empId,date,false)||{status:'worked',arrival:'',departure:'',pause:90,comment:'',validationStatus:'pending'},segs=segmentsFor(empId,date);
  ownerEditSubtitle.textContent=`${emp?.name||empId} · ${longDate(date)}`;
  ownerSegmentsDraft=segs.map(s=>({employerId:s.employerId,start:s.start,end:s.end||''}));
  const choices=assignedEmployers(empId).length?assignedEmployers(empId):V2_DATA.employers.filter(e=>e.active);
  if(!ownerSegmentsDraft.length&&entry.arrival&&entry.departure&&choices.length)ownerSegmentsDraft=[{employerId:choices[0].id,start:entry.arrival,end:entry.departure}];
  ownerPauseTouched=entry.pauseMode==='manual';ownerPause.value=fmtDurationMinutes(Number(entry.pause??(ownerSegmentsDraft.length>1?0:90)));ownerComment.value=entry.comment||'';ownerOff.checked=entry.status==='off';ownerValidation.value=entry.validationStatus==='validated'?'validated':'pending';ownerWorkedFields.classList.toggle('hidden',ownerOff.checked);renderOwnerSegmentsEditor();updateOwnerDayTotal();ownerEditModal.classList.add('open');
};
function updateOwnerDayTotal(){syncOwnerDraftFromDom();const gross=ownerSegmentsDraft.reduce((s,x)=>s+timeSpanMinutes(x.start,x.end),0),pause=parseDurationMinutes(ownerPause.value);ownerDayTotal.textContent=ownerOff.checked?'0h00':fmtMin(Math.max(0,gross-(pause===null?0:pause)))}
saveOwnerEdit=async function(){
  syncOwnerDraftFromDom();
  await withOwnerSave(async()=>{
    if(ownerOff.checked){
      await ownerSetDayOffV2(ownerEditEmployee,ownerEditDate,true,ownerValidation.value);
    }else{
      if(!ownerSegmentsDraft.length||ownerSegmentsDraft.some(s=>!s.employerId||!s.start||!s.end)){alert('Renseigne complètement au moins un créneau.');return}
      if(ownerSegmentsDraft.some(s=>timeToMinutes(s.end)<=timeToMinutes(s.start))){alert('Chaque heure de fin doit être strictement après l’heure de début.');return}
      const ordered=[...ownerSegmentsDraft].sort((a,b)=>a.start.localeCompare(b.start));if(ordered.some((s,i)=>i>0&&timeToMinutes(s.start)<timeToMinutes(ordered[i-1].end))){alert('Deux créneaux se chevauchent. Corrige les horaires.');return}
      const pause=parseDurationMinutes(ownerPause.value),gross=grossSegmentsMinutes(ownerSegmentsDraft);if((pause||0)>gross){alert('La pause ne peut pas dépasser le temps travaillé.');return}
      await ownerReplaceDayV2(ownerEditEmployee,ownerEditDate,ownerSegmentsDraft.map(s=>({employer_id:s.employerId,start_time:s.start,end_time:s.end})),pause===null?0:pause,ownerComment.value,ownerValidation.value);
    }
    closeOwnerEdit();if(planningModal.classList.contains('open'))openPlanning(planningDate);renderOwner();
  });
};

function renderV2Pilotage(){renderEmployersV2();renderOwnerLeavesV2()}
const renderOwnerBaseV2=renderOwner;
renderOwner=function(){renderOwnerBaseV2();renderV2Pilotage()};

buildPrintReport=function(){
  const start=new Date(completionCursor.getFullYear(),completionCursor.getMonth(),1,12),end=new Date(completionCursor.getFullYear(),completionCursor.getMonth()+1,0,12),dates=listDates(start,end),d=getData();
  printReport.innerHTML=`<div class="print-header"><h1>Relevé mensuel des horaires</h1><p>${monthLabel(start)}</p></div>${EMPLOYEES.map(emp=>{const entries=dates.map(date=>{const e=d.entries.find(x=>x.employeeId===emp.id&&x.date===date),leave=leaveForDate(emp.id,date,'validated'),planned=isPlannedWorkingDay(emp.id,date);if(!planned&&!e&&!leave)return '';const segs=segmentsFor(emp.id,date),total=workMinutesForDay(emp.id,date);const detail=leave?'Congé':e?.status==='off'?'Non travaillé':segs.length?segs.map(s=>`${s.employerName} ${s.start}–${s.end||'…'}`).join(' / '):e?.arrival||'—';return `<tr><td>${shortDate(date)}</td><td>${leave?'Congé':planned?'Oui':'Non'}</td><td>${ownerEscape(detail)}</td><td>${e?.status==='off'||leave?'—':e?.departure||'—'}</td><td>${e?.status==='off'||leave?'—':fmtDurationMinutes(e?.pause||0)}</td><td>${fmtMin(total)}</td><td>${e?.validationStatus==='validated'?'Validé':e?.validationStatus==='pending'?'À valider':'—'}</td></tr>`}).join('');const total=totalFor(emp,start,end),s=employeeSettings(emp.id);return `<article class="print-employee"><h2>${ownerEscape(emp.name)}</h2><div class="print-summary"><span>Total du mois : <strong>${fmtMin(total)}</strong></span><span>Heures prévues / semaine : <strong>${fmtMin(s.weeklyObjectiveMinutes)}</strong></span></div><table><thead><tr><th>Date</th><th>Prévu</th><th>Employeur / statut</th><th>Dernier départ</th><th>Pause</th><th>Total</th><th>Validation</th></tr></thead><tbody>${entries||'<tr><td colspan="7">Aucune donnée</td></tr>'}</tbody></table></article>`}).join('')}<div class="print-note">Document généré depuis Suivi horaires V2.</div>`;
};

window.addEventListener('focus',async()=>{if(appView&&!appView.classList.contains('hidden')&&!saving){try{await loadOwnerData();renderOwner();await refreshOwnerPushUI()}catch{}}});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

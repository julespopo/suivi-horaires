const params=new URLSearchParams(location.search),EMPLOYEE_LINK_KEY='hours_employee_link_token_v2';
let linkToken=params.get('token')||localStorage.getItem(EMPLOYEE_LINK_KEY)||'';let emp=null,saving=false,dayEditMode='task',dayPauseTouched=false,daySegmentsDraft=[];
if(params.get('token'))localStorage.setItem(EMPLOYEE_LINK_KEY,linkToken);
if(!linkToken){invalidView.classList.remove('hidden')}else{setManifestFor();bootEmployee()}
async function bootEmployee(){
  if(isEmployeeSession(linkToken)){
    if(navigator.onLine){
      try{
        emp=await loadEmployeeData();
        showApp();
        syncEmployeeOfflineQueue().then(()=>{emp=CURRENT_EMPLOYEE;render();renderNetworkState()}).catch(()=>{});
        return;
      }catch(e){
        if(isUnauthorizedError(e)){clearSession()}
        else if(restoreEmployeeSnapshot()){emp=CURRENT_EMPLOYEE;showApp();return}
      }
    }else if(restoreEmployeeSnapshot()){
      emp=CURRENT_EMPLOYEE;showApp();return;
    }
  }
  authName.textContent='Espace personnel';
  if(!navigator.onLine)pinError.textContent='Une première connexion Internet est nécessaire sur ce téléphone.';
  authView.classList.remove('hidden')
}
function isUnauthorizedError(e){const m=String(e?.message||e||'').toLowerCase();return m.includes('unauthorized')||m.includes('session invalide')}
function showApp(){authView.classList.add('hidden');appView.classList.remove('hidden');floatingSettings.classList.remove('hidden');hello.textContent=`Bonjour ${emp.name}`;todayDate.textContent=frDate(iso());render();renderNetworkState();refreshPushUI()}
async function login(){if(saving)return;pinError.textContent='';const v=pin.value.replace(/\D/g,'');if(v.length!==4){pinError.textContent='Entrez les 4 chiffres du PIN.';return}saving=true;loginBtn.disabled=true;loginBtn.textContent='Connexion…';try{emp=await employeeLogin(linkToken,v);await loadEmployeeData();showApp()}catch(e){const msg=friendlyError(e);pinError.textContent=(e?.status===400||e?.status===401||e?.status===403)?'PIN incorrect.':msg}finally{saving=false;loginBtn.disabled=false;loginBtn.textContent='Continuer'}}
pin?.addEventListener('input',()=>pin.value=pin.value.replace(/\D/g,'').slice(0,4));pin?.addEventListener('keydown',e=>{if(e.key==='Enter')login()});loginBtn?.addEventListener('click',login);

let floatingMenuOpen=false;function toggleFloatingMenu(){floatingMenuOpen?closeFloatingMenu():openFloatingMenu()}function openFloatingMenu(){floatingMenuOpen=true;floatingActions.classList.add('open');floatingActions.setAttribute('aria-hidden','false');floatingActions.querySelectorAll('.floating-action').forEach(btn=>btn.tabIndex=0);floatingSettings.classList.add('menu-open');floatingSettings.setAttribute('aria-expanded','true')}function closeFloatingMenu(){floatingMenuOpen=false;floatingActions.classList.remove('open');floatingActions.setAttribute('aria-hidden','true');floatingActions.querySelectorAll('.floating-action').forEach(btn=>btn.tabIndex=-1);floatingSettings.classList.remove('menu-open');floatingSettings.setAttribute('aria-expanded','false')}function toggleThemeFromFloatingMenu(){toggleTheme();closeFloatingMenu()}document.addEventListener('pointerdown',e=>{if(floatingMenuOpen&&!floatingSettings.contains(e.target)&&!floatingActions.contains(e.target))closeFloatingMenu()});

function renderNetworkState(){
  const offline=!navigator.onLine,state=employeeOfflineState(),count=state.count;
  networkChip.classList.remove('offline','syncing','state-current','state-pending');
  networkChip.classList.toggle('offline',offline);
  networkChip.classList.toggle('syncing',state.syncing);
  if(state.syncing){
    networkChip.classList.add('state-pending');
    networkText.textContent='Synchronisation';
  }else if(offline){
    networkChip.classList.add('state-pending');
    networkText.textContent=count?`Hors ligne · ${count}`:'Hors ligne';
  }else if(count){
    networkChip.classList.add('state-pending');
    networkText.textContent=`À synchroniser · ${count}`;
  }else{
    networkChip.classList.add('state-current');
    networkText.textContent='À jour';
  }

  syncNotice.classList.toggle('hidden',!count);
  syncRetryBtn.classList.add('hidden');
  syncDiscardBtn.classList.add('hidden');
  if(count){
    if(state.syncing)syncNoticeText.textContent='Synchronisation des modifications en cours…';
    else if(state.blocked){
      syncNoticeText.textContent=`Une modification nécessite ton attention : ${offlineQueueFriendlyError()}`;
      if(navigator.onLine){
        syncRetryBtn.classList.remove('hidden');
        syncDiscardBtn.classList.remove('hidden');
      }
    }else if(offline){
      syncNoticeText.textContent=`${count} modification${count>1?'s':''} sauvegardée${count>1?'s':''} sur ce téléphone. Elle${count>1?'s':''} sera${count>1?'ont':''} envoyée${count>1?'s':''} dès le retour d’Internet.`;
    }else{
      syncNoticeText.textContent=`${count} modification${count>1?'s':''} à synchroniser.`;
      syncRetryBtn.classList.remove('hidden');
    }
  }
}
async function retryOfflineSync(){
  await syncEmployeeOfflineQueue();
  emp=CURRENT_EMPLOYEE;
  render();
  renderNetworkState();
}
async function discardOfflineAction(){
  if(!confirm('Annuler uniquement la modification qui bloque la synchronisation ? Les autres modifications hors ligne seront conservées.'))return;
  await discardBlockedOfflineAction();
  emp=CURRENT_EMPLOYEE;
  render();
  renderNetworkState();
}
function todayEntry(){return entryFor(emp.id,iso(),false)}
function todayPauseValue(){const e=todayEntry(),segs=segmentsFor(emp.id,iso());if(e)return Number(e.pause||0);return segs.length>1?0:90}
function employerOptions(selected=''){const employers=assignedEmployers(emp.id);return employers.map(e=>`<option value="${e.id}" ${e.id===selected?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function renderToday(){const date=iso(),entry=todayEntry(),segs=segmentsFor(emp.id,date),open=openSegmentFor(emp.id,date),stale=staleOpenSegmentFor(emp.id,date),leave=leaveForDate(emp.id,date,'validated'),planned=isPlannedWorkingDay(emp.id,date),scheduledOff=!planned&&!entry&&!segs.length,explicitOff=entry?.status==='off',off=scheduledOff||explicitOff;
  todayLeaveBanner.classList.toggle('hidden',!leave);todayLeaveBanner.innerHTML=leave?`<strong>Congé validé</strong><div>Du ${shortDate(leave.startDate)} au ${shortDate(leave.endDate)}${leave.note?` · ${escapeHtml(leave.note)}`:''}</div>`:'';
  staleSegmentBanner.classList.toggle('hidden',!stale);staleSegmentBanner.innerHTML=stale?`<strong>Ancien créneau encore ouvert</strong><div>${shortDate(stale.date)} · ${escapeHtml(stale.employerName)} depuis ${stale.start}. Termine ou corrige cette journée avant d’en commencer une nouvelle.</div><button class="btn btn-outline btn-small section" type="button" onclick="openDay('${stale.date}','task')">Corriger la journée</button>`:'';
  todayWorkStatusControl.classList.toggle('hidden',!!leave);todayWorked.classList.toggle('hidden',!!leave||off);todayOffButton.disabled=!!leave;todayWorkedButton.disabled=!!leave;
  const employers=assignedEmployers(emp.id);todayEmployerSelect.innerHTML=employerOptions(todayEmployerSelect.value);arrivalNowBtn.disabled=off||!!leave||!!stale||!employers.length||!!open;arrivalNowTitle.textContent=employers.length?'J’arrive maintenant':'Aucun employeur disponible';arrivalNowSubtitle.textContent=employers.length?(todayEmployerSelect.selectedOptions[0]?.textContent||'Choisis un employeur'):'Demande au pilotage de t’associer à un employeur';
  if(!todayArrivalManual.value)todayArrivalManual.value=hm();
  if(!todayDepartureManual.value)todayDepartureManual.value=hm();
  todayArrivalManual.disabled=off||!!leave||!!stale||!employers.length||!!open;
  todayDepartureManual.disabled=!open||!!leave;
  employerStartPanel.classList.toggle('hidden',!!open||off||!!leave);activeSegmentPanel.classList.toggle('hidden',!open||!!leave);if(open){activeEmployerName.textContent=open.employerName;activeSegmentSince.textContent=`Depuis ${open.start}`}
  todaySegmentsList.innerHTML=segs.length?segs.map(s=>`<div class="segment-item ${s.end?'':'active'} ${s.pendingSync?'pending-sync':''}"><div class="segment-main"><strong>${escapeHtml(s.employerName)}</strong><div class="subtle">${s.start} → ${s.end||'en cours'}${s.pendingSync?' · en attente de synchronisation':''}</div></div><div class="segment-item-actions"><span class="status ${s.pendingSync?'warn':s.end?'ok':'warn'}">${s.pendingSync?'À synchroniser':s.end?fmtMin(timeSpanMinutes(s.start,s.end)):'En cours'}</span>${s.end?`<button class="segment-delete-btn" type="button" onclick="deleteTodaySegment('${s.id}')">Supprimer</button>`:''}</div></div>`).join(''):'<div class="empty">Aucun créneau pour le moment.</div>';
  const pause=todayPauseValue();if(document.activeElement!==pauseMinutesInput)pauseMinutesInput.value=fmtDurationMinutes(pause);pauseMinutesInput.disabled=off||!!leave;todayTotal.textContent=fmtMin(workMinutesForDay(emp.id,date,{includeOpen:true}));comment.value=entry?.comment||'';comment.disabled=off||!!leave;
  const pendingDay=!!entry?.pendingSync;
  todayWorkedButton.classList.toggle('active',!off);
  todayOffButton.classList.toggle('active',off);
  todayWorkStatusControl.classList.toggle('pending-sync',pendingDay);
  const complete=segs.length>0&&!open;dayStatus.textContent=leave?'Congé':pendingDay&&off?'Non travaillé, à synchroniser':pendingDay&&!off?'Travaillé, à synchroniser':off?'Non travaillé':open?`Travail en cours chez ${open.employerName}`:complete?'Journée complète':segs.length?'À compléter':'Travaillé'}
async function deleteTodaySegment(segmentId){
  const segment=V2_DATA.segments.find(s=>s.id===segmentId);
  if(!segment)return;
  const label=`${segment.employerName} · ${segment.start} → ${segment.end}`;
  if(!confirm(`Supprimer ce créneau ?\n\n${label}\n\nTu pourras ensuite enregistrer le bon employeur et les bonnes heures.`))return;
  await withSave(async()=>{await employeeDeleteSegmentV2(segmentId);emp=CURRENT_EMPLOYEE;render()});
}

async function withSave(fn){if(saving)return;saving=true;document.body.classList.add('is-saving');try{await fn()}catch(e){if(isUnauthorizedError(e)){clearSession();location.reload();return}alert(friendlyError(e))}finally{saving=false;document.body.classList.remove('is-saving')}}
async function startEmployerNow(){const employerId=todayEmployerSelect.value;if(!employerId){alert('Choisis un employeur.');return}await withSave(async()=>{await employeeStartSegment(employerId,iso(),hm());todayArrivalManual.value='';emp=CURRENT_EMPLOYEE;render()})}
async function startEmployerManual(){const employerId=todayEmployerSelect.value,time=todayArrivalManual.value;if(!employerId){alert('Choisis un employeur.');return}if(!time){alert('Renseigne l’heure d’arrivée.');return}await withSave(async()=>{await employeeStartSegment(employerId,iso(),time,'manual');todayArrivalManual.value='';emp=CURRENT_EMPLOYEE;render()})}
async function stopEmployerNow(){const open=openSegmentFor(emp.id);if(!open)return;await withSave(async()=>{await employeeStopSegment(open.id,hm());todayDepartureManual.value='';emp=CURRENT_EMPLOYEE;render()})}
async function stopEmployerManual(){const open=openSegmentFor(emp.id),time=todayDepartureManual.value;if(!open){alert('Aucun créneau en cours.');return}if(!time){alert('Renseigne l’heure de départ.');return}await withSave(async()=>{await employeeStopSegment(open.id,time,'manual');todayDepartureManual.value='';emp=CURRENT_EMPLOYEE;render()})}
async function setDirectPause(value){const parsed=parseDurationMinutes(value);if(parsed===null){pauseMinutesInput.value=fmtDurationMinutes(todayPauseValue());return}const segs=segmentsFor(emp.id,iso()),open=openSegmentFor(emp.id,iso()),gross=grossSegmentsMinutes(segs);if(segs.length&&!open&&parsed>gross){alert('La pause ne peut pas dépasser le temps travaillé.');pauseMinutesInput.value=fmtDurationMinutes(todayPauseValue());return}pauseMinutesInput.value=fmtDurationMinutes(parsed);await withSave(async()=>{await employeeUpdateDayMetaV2(iso(),parsed,comment.value);emp=CURRENT_EMPLOYEE;render()})}
function addPauseMinutes(delta){const parsed=parseDurationMinutes(pauseMinutesInput.value);setDirectPause(Math.max(0,Math.min(720,(parsed===null?todayPauseValue():parsed)+Number(delta||0))))}
pauseMinutesInput.addEventListener('change',e=>setDirectPause(e.target.value));document.querySelectorAll('[data-pause-add]').forEach(btn=>btn.addEventListener('click',()=>addPauseMinutes(btn.dataset.pauseAdd)));comment.addEventListener('change',()=>{const parsed=parseDurationMinutes(pauseMinutesInput.value);withSave(async()=>{await employeeUpdateDayMetaV2(iso(),parsed===null?todayPauseValue():parsed,comment.value);emp=CURRENT_EMPLOYEE;render()})});
async function setTodayWorkStatus(worked){
  const entry=todayEntry(),segs=segmentsFor(emp.id,iso()),planned=isPlannedWorkingDay(emp.id,iso()),scheduledOff=!planned&&!entry&&!segs.length,currentlyOff=scheduledOff||entry?.status==='off';
  const wantsOff=!worked;
  if(wantsOff===currentlyOff)return;
  if(wantsOff&&segs.length&&!confirm(`Cette journée contient ${segs.length} créneau${segs.length>1?'x':''} de travail. Les heures seront supprimées pour la déclarer non travaillée. Continuer ?`))return;
  await withSave(async()=>{await employeeSetDayOffV2(iso(),wantsOff);emp=CURRENT_EMPLOYEE;render()});
}
async function toggleTodayOff(){
  const entry=todayEntry(),segs=segmentsFor(emp.id,iso()),planned=isPlannedWorkingDay(emp.id,iso()),scheduledOff=!planned&&!entry&&!segs.length,currentlyOff=scheduledOff||entry?.status==='off';
  return setTodayWorkStatus(currentlyOff);
}

function renderTasks(){
  const tasks=tasksFor(emp.id);
  const hasTasks=tasks.length>0;
  const tasksSection=document.getElementById('tasks');
  const tasksTab=document.getElementById('tasksTab');
  taskCount.textContent=hasTasks?`(${tasks.length})`:'';
  if(tasksTab)tasksTab.classList.toggle('hidden',!hasTasks);
  if(tasksSection)tasksSection.classList.toggle('hidden',!hasTasks);
  if(!hasTasks){
    taskBadge.textContent='';
    taskBadge.className='status warn hidden';
    taskList.innerHTML='';
    return;
  }
  taskBadge.textContent=`${tasks.length} jour${tasks.length>1?'s':''}`;
  taskBadge.className='status warn';
  taskList.innerHTML=tasks.map(t=>`<div class="task row"><div><div class="task-title">${frDate(t.date)}</div><div class="task-meta">${t.missing}</div></div><button class="btn btn-outline" onclick="openDay('${t.date}','task')">Compléter</button></div>`).join('');
}

function leaveStatusLabel(status){return status==='validated'?'Validé':status==='rejected'?'Refusé':'À valider'}
function renderLeaves(){const leaves=[...V2_DATA.leaves].sort((a,b)=>b.startDate.localeCompare(a.startDate));leaveList.innerHTML=leaves.length?leaves.map(l=>`<div class="leave-row leave-${l.status} ${l.pendingSync?'pending-sync':''}"><div class="leave-main"><strong>${shortDate(l.startDate)} → ${shortDate(l.endDate)}</strong><div class="subtle">${l.note?escapeHtml(l.note)+' · ':''}${l.requestedBy==='owner'?'Ajouté par le pilotage':'Déclaré par toi'}${l.pendingSync?' · en attente de synchronisation':''}</div></div><div class="leave-actions"><span class="status ${l.pendingSync?'warn':l.status==='validated'?'ok':l.status==='rejected'?'off':'warn'}">${l.pendingSync?'À synchroniser':leaveStatusLabel(l.status)}</span>${l.status==='pending'?`<button class="btn btn-outline btn-small" onclick="cancelLeave('${l.id}')">Annuler</button>`:''}</div></div>`).join(''):'<div class="empty">Aucun congé déclaré.</div>'}
let leaveRangeControl=null;try{if(typeof createDateRangePicker==='function')leaveRangeControl=createDateRangePicker(document.getElementById('leaveRangePicker'),leaveStart,leaveEnd)}catch(e){console.error('Range picker unavailable',e)}
function openLeaveModal(){leaveNote.value='';if(leaveRangeControl){leaveRangeControl.reset('','')}else{leaveStart.type='date';leaveEnd.type='date';leaveStart.value=iso();leaveEnd.value=iso()}leaveModal.classList.add('open')}
function closeLeaveModal(){leaveModal.classList.remove('open')}
async function submitLeaveRequest(){
  if(!leaveStart.value){alert('Choisis le premier jour de congé.');return}
  if(!leaveEnd.value)leaveEnd.value=leaveStart.value;
  await withSave(async()=>{await employeeRequestLeave(leaveStart.value,leaveEnd.value,leaveNote.value);emp=CURRENT_EMPLOYEE;closeLeaveModal();render()})
}
async function cancelLeave(id){if(!confirm('Annuler cette demande de congé ?'))return;await withSave(async()=>{await employeeCancelLeave(id);emp=CURRENT_EMPLOYEE;render()})}

function dayEmployerOptions(selected=''){const active=assignedEmployers(emp.id);const selectedEmployer=employerFor(selected);const list=[...active];if(selectedEmployer&&!list.some(e=>e.id===selectedEmployer.id))list.push(selectedEmployer);return list.map(e=>`<option value="${e.id}" ${e.id===selected?'selected':''}>${escapeHtml(e.name)}</option>`).join('')}
function renderDaySegmentsEditor(){daySegmentsEditor.innerHTML=daySegmentsDraft.length?daySegmentsDraft.map((s,i)=>`<div class="segment-edit-row"><div class="field"><label>Employeur</label><select data-seg-employer="${i}">${dayEmployerOptions(s.employerId)}</select></div><div class="field"><label>Arrivée</label><input type="time" data-seg-start="${i}" value="${s.start||''}"></div><div class="field"><label>Départ</label><input type="time" data-seg-end="${i}" value="${s.end||''}"></div><button class="btn btn-outline btn-small segment-remove" type="button" onclick="removeDaySegmentRow(${i})">Retirer</button></div>`).join(''):'<div class="empty">Aucun créneau. Ajoute-en un pour renseigner la journée.</div>';daySegmentsEditor.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>{syncDayDraftFromDom();updateDayFields()}))}
function syncDayDraftFromDom(){daySegmentsDraft=daySegmentsDraft.map((s,i)=>({employerId:daySegmentsEditor.querySelector(`[data-seg-employer="${i}"]`)?.value||s.employerId,start:daySegmentsEditor.querySelector(`[data-seg-start="${i}"]`)?.value||'',end:daySegmentsEditor.querySelector(`[data-seg-end="${i}"]`)?.value||''}))}
function addDaySegmentRow(){syncDayDraftFromDom();const employers=assignedEmployers(emp.id);if(!employers.length){alert('Aucun employeur n’est associé à ton compte.');return}daySegmentsDraft.push({employerId:employers[0].id,start:'',end:''});if(daySegmentsDraft.length===2&&!dayPauseTouched)dayPause.value='0h00';renderDaySegmentsEditor();updateDayFields()}
function removeDaySegmentRow(i){syncDayDraftFromDom();daySegmentsDraft.splice(i,1);if(daySegmentsDraft.length<=1&&!dayPauseTouched)dayPause.value='1h30';renderDaySegmentsEditor();updateDayFields()}
function addDayPauseMinutes(delta){const parsed=parseDurationMinutes(dayPause.value);const next=Math.max(0,Math.min(720,(parsed===null?0:parsed)+Number(delta||0)));dayPauseTouched=true;dayPause.value=fmtDurationMinutes(next);updateDayFields()}
document.querySelectorAll('[data-day-pause-add]').forEach(btn=>btn.addEventListener('click',()=>addDayPauseMinutes(btn.dataset.dayPauseAdd)));dayPause.addEventListener('input',()=>{dayPauseTouched=true;updateDayFields()});dayPause.addEventListener('change',()=>{const p=parseDurationMinutes(dayPause.value);dayPause.value=fmtDurationMinutes(p===null?0:p);updateDayFields()});dayOff.addEventListener('change',updateDayFields);
function openDay(date,mode='task'){const leave=leaveForDate(emp.id,date,'validated');if(leave){alert(`Cette journée est couverte par un congé validé (${shortDate(leave.startDate)} → ${shortDate(leave.endDate)}).`);return}dayEditMode=mode;dayDate.value=date;dayModalTitle.textContent=mode==='edit'?'Modifier la journée':'Compléter la journée';dayModalSubtitle.textContent=longDate(date);const entry=entryFor(emp.id,date,false),segs=segmentsFor(emp.id,date);daySegmentsDraft=segs.map(s=>({employerId:s.employerId,start:s.start,end:s.end||''}));if(!daySegmentsDraft.length&&entry?.arrival&&entry?.departure&&assignedEmployers(emp.id).length)daySegmentsDraft=[{employerId:assignedEmployers(emp.id)[0].id,start:entry.arrival,end:entry.departure}];const planned=isPlannedWorkingDay(emp.id,date);dayOff.checked=entry?.status==='off'||(!planned&&!entry&&!segs.length);dayPauseTouched=entry?.pauseMode==='manual';dayPause.value=fmtDurationMinutes(entry?Number(entry.pause||0):(daySegmentsDraft.length>1?0:90));dayComment.value=entry?.comment||'';renderDaySegmentsEditor();updateDayFields();dayModal.classList.add('open')}
function closeDayModal(){dayModal.classList.remove('open')}
function updateDayFields(){dayWorkedFields.classList.toggle('hidden',dayOff.checked);syncDayDraftFromDom();const gross=daySegmentsDraft.reduce((s,x)=>s+timeSpanMinutes(x.start,x.end),0),pause=parseDurationMinutes(dayPause.value);dayTotal.textContent=dayOff.checked?'0h00':fmtMin(Math.max(0,gross-(pause===null?0:pause)))}
async function saveDay(){syncDayDraftFromDom();const existing=segmentsFor(emp.id,dayDate.value);if(dayOff.checked){if(existing.length&&!confirm(`Cette journée contient ${existing.length} créneau${existing.length>1?'x':''}. Les heures seront supprimées et la journée passera en non travaillé. Continuer ?`))return;await withSave(async()=>{await employeeSetDayOffV2(dayDate.value,true);emp=CURRENT_EMPLOYEE;closeDayModal();render()});return}if(!daySegmentsDraft.length){if(confirm('Il ne reste aucun créneau. Déclarer cette journée comme non travaillée ?')){await withSave(async()=>{await employeeSetDayOffV2(dayDate.value,true);emp=CURRENT_EMPLOYEE;closeDayModal();render()})}return}if(daySegmentsDraft.some(s=>!s.employerId||!s.start||!s.end)){alert('Renseigne complètement chaque créneau.');return}if(daySegmentsDraft.some(s=>timeToMinutes(s.end)<=timeToMinutes(s.start))){alert('Chaque heure de fin doit être strictement après l’heure de début.');return}const ordered=[...daySegmentsDraft].sort((a,b)=>a.start.localeCompare(b.start));if(ordered.some((s,i)=>i>0&&timeToMinutes(s.start)<timeToMinutes(ordered[i-1].end))){alert('Deux créneaux se chevauchent. Corrige les horaires.');return}const pause=parseDurationMinutes(dayPause.value),gross=grossSegmentsMinutes(daySegmentsDraft);if((pause||0)>gross){alert('La pause ne peut pas dépasser le temps travaillé.');return}await withSave(async()=>{await employeeReplaceDayV2(dayDate.value,daySegmentsDraft.map(s=>({employer_id:s.employerId,start_time:s.start,end_time:s.end})),pause===null?0:pause,dayComment.value);emp=CURRENT_EMPLOYEE;closeDayModal();render()})}

let historyMode='week',historyCursor=new Date();function setHistoryMode(mode){historyMode=mode;weekViewBtn.classList.toggle('active-chip',mode==='week');monthViewBtn.classList.toggle('active-chip',mode==='month');renderHistory()}function shiftHistory(step){
  if(historyMode==='week')historyCursor.setDate(historyCursor.getDate()+step*7);
  else historyCursor=new Date(historyCursor.getFullYear(),historyCursor.getMonth()+step,1,12);
  const min=dateObjFromIso(APP_START_DATE);
  if(historyCursor<min)historyCursor=new Date(min);
  renderHistory()
}function historyPeriod(){if(historyMode==='week'){const start=startOfWeek(historyCursor),end=endOfWeek(historyCursor);return{start,end,dates:listDates(start,end),label:`Semaine du ${shortDate(iso(start))} au ${shortDate(iso(end))}`}}const start=new Date(historyCursor.getFullYear(),historyCursor.getMonth(),1,12),end=new Date(historyCursor.getFullYear(),historyCursor.getMonth()+1,0,12);return{start,end,dates:listDates(start,end),label:monthLabel(start)}}
function renderHistory(){const p=historyPeriod();historyPeriodLabel.textContent=p.label;const infos=p.dates.map(date=>({date,...dayInfoFor(emp.id,date)})),worked=infos.filter(x=>x.status==='complete'||x.status==='incomplete'),total=worked.reduce((s,x)=>s+x.minutes,0),completeInfos=infos.filter(x=>x.status==='complete'),complete=completeInfos.length,avg=complete?Math.round(completeInfos.reduce((s,x)=>s+x.minutes,0)/complete):0;historySummary.innerHTML=`<div class="mini-stat"><div class="subtle">Total période</div><div class="metric-sm">${fmtMin(total)}</div></div><div class="mini-stat"><div class="subtle">Jours saisis</div><div class="metric-sm">${complete}</div></div><div class="mini-stat"><div class="subtle">Moyenne / jour</div><div class="metric-sm">${fmtMin(avg)}</div></div>`;const chart=historyMode==='week'?infos:infos.filter(x=>!isFuture(x.date)),max=Math.max(...chart.map(x=>x.minutes),1);historyChart.innerHTML=chart.map(x=>{const h=Math.max(8,Math.round((x.minutes/max)*120));return `<button class="bar-col" onclick="openDay('${x.date}','edit')" ${isFuture(x.date)?'disabled':''}><div class="bar-value">${x.status==='leave'?'Congé':x.status==='off'?'Off':x.minutes?fmtMin(x.minutes):'—'}</div><div class="bar ${x.status}" style="height:${x.minutes?h:8}px"></div><div class="bar-label">${historyMode==='week'?shortWeekday(x.date):dateObjFromIso(x.date).getDate()}</div></button>`}).join('');if(historyMode==='week')historyCalendar.innerHTML=`<div class="calendar-grid week-grid">${infos.map(x=>calendarCard(x,true)).join('')}</div>`;else{const firstDow=(dateObjFromIso(p.dates[0]).getDay()+6)%7,blanks=Array.from({length:firstDow},()=>'<div class="calendar-empty"></div>').join('');historyCalendar.innerHTML=`<div class="calendar-head">${['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(d=>`<div>${d}</div>`).join('')}</div><div class="calendar-grid month-grid">${blanks}${infos.map(x=>calendarCard(x,false)).join('')}</div>`}}
function calendarCard(x,weekMode){const d=dateObjFromIso(x.date),today=x.date===iso(),weekend=[0,6].includes(d.getDay()),before=x.status==='before-start',classes=['calendar-day',x.status,today?'today':'',weekend?'weekend':'',isFuture(x.date)?'future':''].filter(Boolean).join(' '),segs=before?[]:segmentsFor(emp.id,x.date);let meta=x.label;if(segs.length)meta=segs.map(s=>`${s.employerName} ${s.start}–${s.end||'…'}`).join(' · ');return `<button class="${classes}" onclick="openDay('${x.date}','edit')" ${(isFuture(x.date)||before)?'disabled':''}><div class="day-top"><span class="day-number">${d.getDate()}</span>${weekMode?`<span class="day-week">${shortWeekday(x.date)}</span>`:''}</div><div class="day-main">${before?'Hors période':x.status==='leave'?'Congé':x.status==='off'?'Non travaillé':x.status==='scheduled-off'?'Non travaillé prévu':x.status==='complete'?fmtMin(x.minutes):'À compléter'}</div><div class="day-meta">${escapeHtml(meta)}</div></button>`}
function render(){renderToday();renderTasks();renderLeaves();renderHistory();renderNetworkState()}

async function refreshPushUI(){if(!pushStatus)return;pushHelp.classList.add('hidden');pushHelp.textContent='';pushToggleBtn.disabled=false;if(!pushSupported()){pushStatus.textContent='Non compatible';pushStatus.className='status warn';pushToggleBtn.disabled=true;pushHelp.textContent='Ce navigateur ne prend pas en charge les notifications.';pushHelp.classList.remove('hidden');return}const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(isiOS&&!isStandalonePWA()){pushStatus.textContent='Installation requise';pushStatus.className='status warn';pushToggleBtn.textContent='Activer les rappels';pushTestBtn.classList.add('hidden');pushHelp.textContent='Sur iPhone : Partager → Ajouter à l’écran d’accueil.';pushHelp.classList.remove('hidden');return}const sub=await getPushSubscription();if(sub&&Notification.permission==='granted'){pushStatus.textContent='Activés';pushStatus.className='status ok';pushToggleBtn.textContent='Désactiver les rappels';pushToggleBtn.className='btn btn-outline';pushTestBtn.classList.remove('hidden')}else{pushStatus.textContent=Notification.permission==='denied'?'Bloqués':'Désactivés';pushStatus.className='status '+(Notification.permission==='denied'?'warn':'neutral');pushToggleBtn.textContent='Activer les rappels';pushToggleBtn.className='btn btn-primary';pushTestBtn.classList.add('hidden');if(Notification.permission==='denied'){pushHelp.textContent='Les notifications sont bloquées dans les réglages du navigateur ou du téléphone.';pushHelp.classList.remove('hidden')}}}
async function togglePushReminders(){pushToggleBtn.disabled=true;try{const sub=await getPushSubscription();if(sub)await disablePushReminders();else await enablePushReminders();await refreshPushUI()}catch(e){alert(friendlyError(e));await refreshPushUI()}finally{pushToggleBtn.disabled=false}}async function testPushReminder(){try{await showLocalTestNotification()}catch(e){alert(friendlyError(e))}}

function openReminderSettings(){reminderSettingsModal.classList.add('open');refreshPushUI()}
function closeReminderSettings(){reminderSettingsModal.classList.remove('open')}
function openUserSettings(){currentPinSetting.value='';newPinSetting.value='';confirmPinSetting.value='';settingsPinError.textContent='';userSettingsModal.classList.add('open')}function closeUserSettings(){userSettingsModal.classList.remove('open')}[currentPinSetting,newPinSetting,confirmPinSetting].forEach(el=>el?.addEventListener('input',()=>el.value=el.value.replace(/\D/g,'').slice(0,4)));async function saveNewEmployeePin(){settingsPinError.textContent='';const current=currentPinSetting.value,newPin=newPinSetting.value,confirm=confirmPinSetting.value;if(!/^\d{4}$/.test(current)||!/^\d{4}$/.test(newPin)){settingsPinError.textContent='Les PIN doivent contenir 4 chiffres.';return}if(newPin!==confirm){settingsPinError.textContent='La confirmation ne correspond pas.';return}savePinBtn.disabled=true;try{await changeEmployeePin(current,newPin);alert('PIN modifié.');closeUserSettings()}catch(e){settingsPinError.textContent=friendlyError(e)}finally{savePinBtn.disabled=false}}
window.addEventListener('hours:offline-state',renderNetworkState);
window.addEventListener('offline',renderNetworkState);
window.addEventListener('online',async()=>{
  renderNetworkState();
  if(appView&&!appView.classList.contains('hidden')){
    await syncEmployeeOfflineQueue();
    try{emp=await loadEmployeeData()}catch{}
    render();
  }
});
window.addEventListener('focus',async()=>{
  if(appView&&!appView.classList.contains('hidden')&&!saving&&navigator.onLine){
    await syncEmployeeOfflineQueue();
    try{emp=await loadEmployeeData();render()}catch{}
  }
});
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

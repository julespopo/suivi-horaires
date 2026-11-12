// Pilotage : semaine et validations d'un salarié, sans nouvelle API.
let employeeWeekState=null;
let employeeWeekBusy=false;
const employeeWeekElements=Object.fromEntries([
  'Modal','Title','Period','Previous','Current','Next','Summary','Pending',
  'ValidateAll','Message','Days','Backlog','BacklogTitle','BacklogDays'
].map(name=>[name,document.getElementById('employeeWeek'+name)]));

function employeeWeekBounds(startDate){
  const start=dateObjFromIso(startDate),end=new Date(start);
  end.setDate(end.getDate()+6);
  return {start,end,dates:listDates(start,end)};
}
function employeeWeekCanValidate(employeeId,date){
  if(isBeforeAppStart(date)||isFuture(date)||isOnValidatedLeave(employeeId,date))return false;
  const entry=entryFor(employeeId,date,false),segments=segmentsFor(employeeId,date);
  if(entry?.validationStatus!=='pending'||segments.some(segment=>!segment.end))return false;
  if(entry.status==='off')return segments.length===0;
  return !!(entry.arrival&&entry.departure&&dayInfoFor(employeeId,date).status==='complete');
}
function employeeWeekPendingDates(employeeId,dates){
  return dates.filter(date=>employeeWeekCanValidate(employeeId,date));
}
function employeeWeekDaySignature(employeeId,date){
  const entry=entryFor(employeeId,date,false),leave=leaveForDate(employeeId,date);
  return JSON.stringify({
    entry:entry&&[entry.status,entry.arrival,entry.departure,entry.pause,entry.pauseMode,entry.comment],
    segments:segmentsFor(employeeId,date).map(s=>[s.id,s.employerId,s.start,s.end,s.comment]),
    leave:leave&&[leave.type,leave.startDate,leave.endDate]
  });
}
function openEmployeeWeek(employeeId){
  if(employeeWeekBusy||!EMPLOYEES.some(employee=>employee.id===employeeId))return;
  employeeWeekState={employeeId,startDate:iso(startOfWeek(new Date())),returnFocus:document.activeElement};
  employeeWeekElements.Message.textContent='';
  employeeWeekElements.Backlog.open=false;
  renderEmployeeWeek();
  employeeWeekElements.Modal.classList.add('open');
  const sheet=employeeWeekElements.Modal.querySelector('.sheet');
  sheet.scrollTop=0;sheet.focus();
}
function closeEmployeeWeek(){
  employeeWeekElements.Modal.classList.remove('open');
  if(!employeeWeekState)return;
  const card=[...cards.querySelectorAll('[data-week-employee]')].find(el=>el.dataset.weekEmployee===employeeWeekState.employeeId);
  (card||employeeWeekState.returnFocus)?.focus();
}
function shiftEmployeeWeek(step){
  if(!employeeWeekState||employeeWeekBusy)return;
  const start=dateObjFromIso(employeeWeekState.startDate);start.setDate(start.getDate()+step*7);
  const min=iso(startOfWeek(dateObjFromIso(APP_START_DATE))),max=iso(startOfWeek(new Date()));
  employeeWeekState.startDate=[min,iso(start),max].sort()[1];
  employeeWeekElements.Message.textContent='';
  renderEmployeeWeek();
  employeeWeekElements.Modal.querySelector('.sheet').scrollTop=0;
}
function resetEmployeeWeek(){
  if(!employeeWeekState||employeeWeekBusy)return;
  employeeWeekState.startDate=iso(startOfWeek(new Date()));
  employeeWeekElements.Message.textContent='';renderEmployeeWeek();
  employeeWeekElements.Modal.querySelector('.sheet').scrollTop=0;
}
function employeeWeekDayHtml(employeeId,date){
  const info=dayInfoFor(employeeId,date),entry=entryFor(employeeId,date,false),segments=segmentsFor(employeeId,date);
  const leave=leaveForDate(employeeId,date),fullLeave=isFullDayLeave(leave),beforeStart=isBeforeAppStart(date);
  const open=segments.some(s=>!s.end),future=isFuture(date);
  let label=beforeStart?'Hors période':fullLeave?leaveLabel(leave):entry?.status==='off'?'Non travaillé':entry?.validationStatus==='validated'?'Validé':employeeWeekCanValidate(employeeId,date)?'À valider':open?'En cours':info.status==='complete'?'Saisi':info.status==='scheduled-off'?(publicHolidayName(date)||'Repos prévu'):future?'Prévu':'À compléter';
  const tone=label==='Validé'?'ok':label==='À valider'||label==='À compléter'?'warn':'neutral';
  let details='';
  if(!beforeStart&&!fullLeave&&entry?.status!=='off'){
    details=segments.map(s=>`<div class="employee-week-segment"><span>${ownerEscape(s.employerName||employerFor(s.employerId)?.name||'Employeur')}</span><strong>${ownerEscape(s.start||'—')} → ${ownerEscape(s.end||'en cours')}</strong></div>`).join('');
    if(!segments.length&&entry&&(entry.arrival||entry.departure))details=`<div class="employee-week-segment"><span>Horaires</span><strong>${ownerEscape(entry.arrival||'—')} → ${ownerEscape(entry.departure||'—')}</strong></div>`;
  }
  const meta=[];
  if(!beforeStart&&!fullLeave&&entry?.status!=='off'&&(segments.length||entry?.arrival))meta.push(`Pause : ${fmtMin(entry?.pause||0)}`);
  if(leave&&!beforeStart){meta.push(ownerEscape(leaveLabel(leave)));if(leave.note)meta.push(ownerEscape(leave.note))}
  if(entry?.comment&&!beforeStart)meta.push(ownerEscape(entry.comment));
  const validate=employeeWeekCanValidate(employeeId,date)?`<button class="btn btn-green btn-small" type="button" data-week-validate="${date}" ${employeeWeekBusy?'disabled':''}>Valider</button>`:'';
  const edit=!beforeStart&&!fullLeave&&!future?`<button class="btn btn-outline btn-small" type="button" data-week-edit="${date}" ${employeeWeekBusy?'disabled':''}>${info.status==='empty'||info.status==='incomplete'?'Compléter':'Modifier'}</button>`:'';
  const total=beforeStart||fullLeave||entry?.status==='off'?0:workMinutesForDay(employeeId,date);
  return `<article class="employee-week-day ${beforeStart?'before-start':''}" data-week-date="${date}">
    <div class="employee-week-day-head"><strong>${ownerEscape(shortWeekday(date))} ${shortDate(date)}</strong><strong class="employee-week-duration">${open?'En cours':fmtMin(total)}</strong></div>
    ${details}${meta.length?`<div class="subtle employee-week-day-meta">${meta.join(' · ')}</div>`:''}
    <div class="employee-week-day-foot"><span class="status ${tone}">${ownerEscape(label)}</span><div class="employee-week-day-actions">${validate}${edit}</div></div>
  </article>`;
}
function renderEmployeeWeek(){
  if(!employeeWeekState)return;
  const employee=EMPLOYEES.find(e=>e.id===employeeWeekState.employeeId);
  if(!employee){closeEmployeeWeek();return}
  const sheet=employeeWeekElements.Modal.querySelector('.sheet'),scrollTop=sheet.scrollTop;
  const {start,end,dates}=employeeWeekBounds(employeeWeekState.startDate);
  const pending=employeeWeekPendingDates(employee.id,dates),total=totalFor(employee.id,start,end),objective=employeeSettings(employee.id).weeklyObjectiveMinutes;
  employeeWeekElements.Title.textContent=employee.name;
  employeeWeekElements.Period.textContent=`Du ${shortDate(iso(start))} au ${shortDate(iso(end))} ${end.getFullYear()}`;
  employeeWeekElements.Summary.innerHTML=`<div><span>Heures saisies</span><strong>${fmtMin(total)}</strong></div><div><span>Prévu / semaine</span><strong>${fmtMin(objective)}</strong></div><div><span>Écart</span><strong class="${total>=objective?'text-positive':'text-muted'}">${fmtSignedMin(total-objective)}</strong></div>`;
  employeeWeekElements.Pending.textContent=pending.length?`${pending.length} journée${pending.length>1?'s':''} à valider`:'Aucune journée à valider';
  employeeWeekElements.Pending.className='status '+(pending.length?'warn':'ok');
  employeeWeekElements.ValidateAll.textContent=employeeWeekBusy?'Validation…':pending.length?`Valider ${pending.length===1?'la journée':'les '+pending.length+' journées'}`:'Aucune validation';
  employeeWeekElements.ValidateAll.disabled=employeeWeekBusy||!pending.length;
  employeeWeekElements.Previous.disabled=employeeWeekBusy||employeeWeekState.startDate<=iso(startOfWeek(dateObjFromIso(APP_START_DATE)));
  employeeWeekElements.Next.disabled=employeeWeekBusy||employeeWeekState.startDate>=iso(startOfWeek(new Date()));
  employeeWeekElements.Current.disabled=employeeWeekBusy||employeeWeekState.startDate===iso(startOfWeek(new Date()));
  employeeWeekElements.Days.innerHTML=dates.map(date=>employeeWeekDayHtml(employee.id,date)).join('');
  const otherDates=[...new Set(APP_DATA.entries.filter(e=>e.employeeId===employee.id&&!dates.includes(e.date)).map(e=>e.date))].sort().reverse();
  const backlog=employeeWeekPendingDates(employee.id,otherDates);
  employeeWeekElements.Backlog.classList.toggle('hidden',!backlog.length);
  employeeWeekElements.BacklogTitle.textContent=`Autres journées à valider (${backlog.length})`;
  employeeWeekElements.BacklogDays.innerHTML=backlog.map(date=>employeeWeekDayHtml(employee.id,date)).join('');
  sheet.scrollTop=scrollTop;
}
async function validateEmployeeWeek(singleDate=null){
  if(!employeeWeekState||employeeWeekBusy||saving)return;
  const {employeeId,startDate}=employeeWeekState;
  const dates=singleDate?[singleDate]:employeeWeekBounds(startDate).dates;
  const requested=employeeWeekPendingDates(employeeId,dates);
  if(!requested.length)return;
  const reviewed=new Map(requested.map(date=>[date,employeeWeekDaySignature(employeeId,date)]));
  let validated=0,changed=0,error=null,reloadError=null;
  saving=true;employeeWeekBusy=true;document.body.classList.add('is-saving');
  employeeWeekElements.Message.textContent='Validation en cours…';renderEmployeeWeek();
  try{
    // Re-read the existing data before approving any reviewed day.
    await loadOwnerData();
    const session=getSession();if(!session?.sessionToken)throw new Error('unauthorized');
    for(const date of requested){
      if(entryFor(employeeId,date,false)?.validationStatus==='validated')continue;
      if(!employeeWeekCanValidate(employeeId,date)||employeeWeekDaySignature(employeeId,date)!==reviewed.get(date)){changed++;continue}
      await rpc('api_owner_validate_entry',{p_session_token:session.sessionToken,p_employee_id:employeeId,p_work_date:date});
      validated++;
    }
  }catch(err){error=err}
  finally{
    try{await loadOwnerData()}catch(err){reloadError=err}
    saving=false;employeeWeekBusy=false;document.body.classList.remove('is-saving');
    renderOwner();
    if(employeeWeekState?.employeeId===employeeId){
      const messages=[];
      if(validated)messages.push(`${validated} journée${validated>1?'s validées':' validée'}.`);
      if(changed)messages.push(`${changed} journée${changed>1?'s ont changé et restent':' a changé et reste'} à vérifier.`);
      if(error)messages.push(friendlyError(error));
      if(reloadError)messages.push('Les données n’ont pas pu être actualisées. Réessaie le rafraîchissement.');
      if(!messages.length)messages.push('Les journées sont déjà validées.');
      employeeWeekElements.Message.textContent=messages.join(' ');
    }
  }
}

cards.addEventListener('click',event=>{
  const card=event.target.closest('[data-week-employee]');
  if(card)openEmployeeWeek(card.dataset.weekEmployee);
});
cards.addEventListener('keydown',event=>{
  const card=event.target.closest('[data-week-employee]');
  if(card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openEmployeeWeek(card.dataset.weekEmployee)}
});
employeeWeekElements.Modal.addEventListener('click',event=>{
  const validate=event.target.closest('[data-week-validate]'),edit=event.target.closest('[data-week-edit]');
  if(validate)validateEmployeeWeek(validate.dataset.weekValidate);
  if(edit&&!employeeWeekBusy)openOwnerEdit(employeeWeekState.employeeId,edit.dataset.weekEdit);
});
employeeWeekElements.Modal.addEventListener('keydown',event=>{
  if(event.key!=='Tab'||ownerEditModal.classList.contains('open'))return;
  const items=[...employeeWeekElements.Modal.querySelectorAll('button:not([disabled]),summary,[tabindex="0"]')].filter(el=>el.getClientRects().length);
  const first=items[0],last=items.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||active===employeeWeekElements.Modal.querySelector('.sheet'))){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus()}
});
const renderOwnerBeforeEmployeeWeek=renderOwner;
renderOwner=function(){
  renderOwnerBeforeEmployeeWeek();
  if(employeeWeekElements.Modal.classList.contains('open'))renderEmployeeWeek();
};

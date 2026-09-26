// ============================================================
// SUIVI HORAIRES — V1.8 SUPABASE
// Les données métier sont désormais centralisées dans Supabase.
// GitHub Pages ne contient aucune clé secrète ni aucun PIN.
// ============================================================

const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl || '';
const SUPABASE_KEY = window.APP_CONFIG?.supabasePublishableKey || '';
const LEGACY_SESSION_KEY = 'hours_supabase_session_v1';
const OWNER_SESSION_KEY = 'hours_supabase_owner_session_v1';
const EMPLOYEE_SESSION_PREFIX = 'hours_supabase_employee_session_v1_';

let EMPLOYEES = [];
let APP_DATA = {entries:[],settings:{plannedDays:{},employeeSettings:{}}};
let CURRENT_EMPLOYEE = null;
let DATA_RANGE = {from:null,to:null};

function iso(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function pad(n){return String(n).padStart(2,'0')}
function hm(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function frDate(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(s+'T12:00:00'))}
function longDate(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00'))}
function shortDate(s){return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(s+'T12:00:00'))}
function shortWeekday(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(new Date(s+'T12:00:00')).replace('.','')}
function monthLabel(d){return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d)}
function minutes(a,b,pause=0){if(!a||!b)return 0;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let m=(bh*60+bm)-(ah*60+am)-Number(pause||0);return Math.max(0,m)}
function fmtMin(m){m=Math.round(Number(m)||0);const h=Math.floor(Math.abs(m)/60),mm=Math.abs(m)%60;return `${m<0?'-':''}${h}h${pad(mm)}`}
function fmtSignedMin(m){m=Math.round(Number(m)||0);if(m===0)return '0h00';return `${m>0?'+':'−'}${fmtMin(Math.abs(m))}`}
function dateObjFromIso(s){return new Date(s+'T12:00:00')}
function startOfWeek(ref){const d=new Date(ref);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(12,0,0,0);return d}
function endOfWeek(ref){const d=startOfWeek(ref);d.setDate(d.getDate()+6);return d}
function listDates(start,end){let dates=[];const d=new Date(start);while(d<=end){dates.push(iso(d));d.setDate(d.getDate()+1)}return dates}
function isFuture(date){return date>iso()}
function weekBounds(ref=new Date()){const start=startOfWeek(ref),end=endOfWeek(ref);end.setHours(23,59,59,999);return [start,end]}
function monthBounds(ref=new Date()){return [new Date(ref.getFullYear(),ref.getMonth(),1),new Date(ref.getFullYear(),ref.getMonth()+1,0,23,59,59)]}
function defaultRange(){const now=new Date();const from=new Date(now.getFullYear()-1,0,1,12);const to=new Date(now.getFullYear()+1,11,31,12);return {from:iso(from),to:iso(to)}}

function currentEmployeeLinkToken(){
  try{return new URLSearchParams(location.search).get('token')||''}catch{return ''}
}
function sessionStorageKey(role=null,linkToken=null){
  const isOwnerPage=/pilotage\.html$/i.test(location.pathname);
  if(role==='owner'||(!role&&isOwnerPage))return OWNER_SESSION_KEY;
  const token=linkToken||currentEmployeeLinkToken();
  return token?EMPLOYEE_SESSION_PREFIX+token:null;
}
function getSession(){
  try{
    const key=sessionStorageKey();
    if(key){
      const current=JSON.parse(localStorage.getItem(key)||'null');
      if(current)return current;
    }
    // Migration douce depuis la V1.8/V1.8.1 : on récupère l'ancienne session
    // uniquement si elle correspond à la page actuellement ouverte.
    const legacy=JSON.parse(localStorage.getItem(LEGACY_SESSION_KEY)||'null');
    if(!legacy)return null;
    const isOwnerPage=/pilotage\.html$/i.test(location.pathname);
    const matches=isOwnerPage?legacy.role==='owner':legacy.role==='employee'&&legacy.linkToken===currentEmployeeLinkToken();
    if(matches){
      const newKey=sessionStorageKey(legacy.role,legacy.linkToken);
      if(newKey)localStorage.setItem(newKey,JSON.stringify(legacy));
      return legacy;
    }
    return null;
  }catch{return null}
}
function setSession(s){
  const key=sessionStorageKey(s.role,s.linkToken);
  if(!key)throw new Error('Impossible de déterminer la clé de session');
  localStorage.setItem(key,JSON.stringify(s));
  localStorage.removeItem(LEGACY_SESSION_KEY);
}
function clearSession(){
  const key=sessionStorageKey();
  if(key)localStorage.removeItem(key);
  localStorage.removeItem(LEGACY_SESSION_KEY);
}
function isEmployeeSession(linkToken){const s=getSession();return !!s&&s.role==='employee'&&s.sessionToken&&s.linkToken===linkToken}
function isOwnerSession(linkToken){const s=getSession();return !!s&&s.role==='owner'&&s.sessionToken&&s.linkToken===linkToken}

async function rpc(name,args={}){
  if(!SUPABASE_URL||!SUPABASE_KEY) throw new Error('Configuration Supabase manquante.');
  const res=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json','Accept':'application/json','Content-Profile':'public','Accept-Profile':'public'},
    body:JSON.stringify(args)
  });
  const raw=await res.text();
  let payload=null;
  try{payload=raw?JSON.parse(raw):null}catch{payload=raw}
  if(!res.ok){
    const message=(payload&&typeof payload==='object'&&(payload.message||payload.error||payload.hint))||String(payload||`Erreur ${res.status}`);
    const err=new Error(message);err.status=res.status;throw err;
  }
  return payload;
}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window}
function isStandalonePWA(){return window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true}
async function getPushSubscription(){if(!pushSupported())return null;const reg=await navigator.serviceWorker.ready;return reg.pushManager.getSubscription()}
async function enablePushReminders(){
  if(!pushSupported())throw new Error('push_not_supported');
  const ua=navigator.userAgent||'';const isiOS=/iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS&&!isStandalonePWA())throw new Error('ios_install_required');
  if(Notification.permission==='denied')throw new Error('notifications_denied');
  const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(permission!=='granted')throw new Error('notifications_denied');
  const publicKey=window.APP_CONFIG?.vapidPublicKey;if(!publicKey)throw new Error('vapid_missing');
  const reg=await navigator.serviceWorker.ready;
  let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(publicKey)});
  const json=sub.toJSON();const sess=getSession();if(!sess?.sessionToken)throw new Error('unauthorized');
  await rpc('api_employee_save_push_subscription',{p_session_token:sess.sessionToken,p_endpoint:sub.endpoint,p_p256dh:json.keys?.p256dh||'',p_auth:json.keys?.auth||'',p_user_agent:navigator.userAgent||''});
  return sub;
}
async function disablePushReminders(){
  const sub=await getPushSubscription();if(!sub)return false;const sess=getSession();
  if(sess?.sessionToken){try{await rpc('api_employee_remove_push_subscription',{p_session_token:sess.sessionToken,p_endpoint:sub.endpoint})}catch{}}
  await sub.unsubscribe();return true;
}
async function showLocalTestNotification(){
  if(!pushSupported())throw new Error('push_not_supported');
  const reg=await navigator.serviceWorker.ready;
  await reg.showNotification('Mes horaires',{body:'Les rappels sont bien activés sur ce téléphone.',tag:'suivi-horaires-test'});
}

function friendlyError(err){
  const m=String(err?.message||err||'');
  if(m.includes('invalid_credentials')) return 'Code PIN incorrect.';
  if(m.includes('unauthorized')) return 'Votre session n’est plus valide. Reconnectez-vous.';
  if(m.includes('entry_not_complete')) return 'La journée doit être complète avant validation.';
  if(m.includes('Failed to fetch')) return 'Connexion impossible. Vérifiez votre accès Internet.';
  if(m.includes('push_not_supported')) return 'Les notifications push ne sont pas prises en charge sur ce navigateur.';
  if(m.includes('ios_install_required')) return 'Sur iPhone, ajoute d’abord ce site à l’écran d’accueil puis ouvre-le depuis son icône.';
  if(m.includes('notifications_denied')) return 'Les notifications sont bloquées dans les réglages du navigateur ou du téléphone.';
  if(m.includes('vapid_missing')) return 'Configuration des notifications incomplète.';
  return 'Une erreur est survenue. Réessayez.';
}
function cleanTime(v){return v?String(v).slice(0,5):''}
function normalizeEntry(r){return {
  employeeId:r.employee_id,
  date:r.work_date,
  status:r.status||'worked',
  arrival:cleanTime(r.arrival),
  departure:cleanTime(r.departure),
  pause:Number(r.pause_minutes??45),
  comment:r.comment||'',
  arrivalMode:r.arrival_mode||'',
  departureMode:r.departure_mode||'',
  validationStatus:r.validation_status||'',
  validatedAt:r.validated_at||'',
  updatedAt:r.updated_at||''
}}
function normalizeEmployee(e){return {
  id:e.id,
  name:e.name,
  weeklyObjectiveMinutes:Number(e.weekly_objective_minutes??2100),
  overtimeThresholdMinutes:Number(e.overtime_threshold_minutes??2100)
}}
function hydrateEmployeeSettings(){
  APP_DATA.settings.employeeSettings={};
  EMPLOYEES.forEach(e=>APP_DATA.settings.employeeSettings[e.id]={weeklyObjectiveMinutes:e.weeklyObjectiveMinutes,overtimeThresholdMinutes:e.overtimeThresholdMinutes});
}
function hydrateSchedule(rows=[]){
  APP_DATA.settings.plannedDays={};
  EMPLOYEES.forEach(e=>APP_DATA.settings.plannedDays[e.id]={});
  rows.forEach(r=>{
    if(!APP_DATA.settings.plannedDays[r.employee_id])APP_DATA.settings.plannedDays[r.employee_id]={};
    APP_DATA.settings.plannedDays[r.employee_id][r.work_date]=!!r.is_working;
  });
}
function getData(){return APP_DATA}
function entryFor(emp,date,create=false){
  let e=APP_DATA.entries.find(x=>x.employeeId===emp&&x.date===date);
  if(!e&&create)e={employeeId:emp,date,status:'worked',arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:'',validationStatus:'',updatedAt:''};
  return e;
}
function employeeSettings(empId){return APP_DATA.settings.employeeSettings[empId]||{weeklyObjectiveMinutes:2100,overtimeThresholdMinutes:2100}}
function isPlannedWorkingDay(empId,date){const over=APP_DATA.settings.plannedDays?.[empId]?.[date];if(typeof over==='boolean')return over;const day=dateObjFromIso(date).getDay();return day!==0&&day!==6}
function recentDates(days=21){let arr=[],d=new Date();for(let i=0;i<days;i++){let x=new Date(d);x.setDate(d.getDate()-i);arr.push(iso(x))}return arr}
function tasksFor(emp){return recentDates(18).filter(date=>{if(date===iso()||!isPlannedWorkingDay(emp,date))return false;const e=APP_DATA.entries.find(x=>x.employeeId===emp&&x.date===date);if(e?.status==='off')return false;return !e||!e.arrival||!e.departure}).map(date=>{const e=APP_DATA.entries.find(x=>x.employeeId===emp&&x.date===date);let missing=!e?'Journée à renseigner':(!e.arrival&&!e.departure?'Arrivée et départ manquants':!e.arrival?'Arrivée manquante':'Départ manquant');return {date,missing}})}
function totalFor(emp,start,end){return APP_DATA.entries.filter(e=>e.employeeId===emp&&e.status!=='off'&&new Date(e.date+'T12:00:00')>=start&&new Date(e.date+'T12:00:00')<=end).reduce((s,e)=>s+minutes(e.arrival,e.departure,e.pause),0)}
function pendingValidationCount(emp,start=null,end=null){return APP_DATA.entries.filter(e=>e.employeeId===emp&&e.validationStatus==='pending'&&(e.status==='off'||(e.arrival&&e.departure))&&(!start||new Date(e.date+'T12:00:00')>=start)&&(!end||new Date(e.date+'T12:00:00')<=end)).length}
function dayInfoFor(empId,date){const entry=APP_DATA.entries.find(x=>x.employeeId===empId&&x.date===date);const planned=isPlannedWorkingDay(empId,date);if(!entry)return {entry:null,status:planned?'empty':'scheduled-off',minutes:0,label:planned?'À compléter':'Non travaillé prévu'};if(entry.status==='off')return {entry,status:'off',minutes:0,label:'Non travaillé'};const total=minutes(entry.arrival,entry.departure,entry.pause);if(entry.arrival&&entry.departure)return {entry,status:'complete',minutes:total,label:fmtMin(total)};return {entry,status:'incomplete',minutes:total,label:'À compléter'}}

async function employeeLogin(linkToken,pin){
  const out=await rpc('api_employee_login',{p_link_token:linkToken,p_pin:pin});
  setSession({role:'employee',sessionToken:out.session_token,linkToken,at:new Date().toISOString()});
  CURRENT_EMPLOYEE=normalizeEmployee(out.employee);
  return CURRENT_EMPLOYEE;
}
async function ownerLogin(linkToken,pin){
  const out=await rpc('api_owner_login',{p_link_token:linkToken,p_pin:pin});
  setSession({role:'owner',sessionToken:out.session_token,linkToken,at:new Date().toISOString()});
  return out;
}
async function loadEmployeeData(){
  const s=getSession();if(!s?.sessionToken)throw new Error('unauthorized');
  const range=defaultRange();DATA_RANGE=range;
  const out=await rpc('api_employee_data',{p_session_token:s.sessionToken,p_from:range.from,p_to:range.to});
  CURRENT_EMPLOYEE=normalizeEmployee(out.employee);
  EMPLOYEES=[CURRENT_EMPLOYEE];
  APP_DATA={entries:(out.entries||[]).map(r=>normalizeEntry({...r,employee_id:CURRENT_EMPLOYEE.id})),settings:{plannedDays:{},employeeSettings:{}}};
  hydrateEmployeeSettings();
  hydrateSchedule((out.schedule||[]).map(r=>({...r,employee_id:CURRENT_EMPLOYEE.id})));
  return CURRENT_EMPLOYEE;
}
async function loadOwnerData(){
  const s=getSession();if(!s?.sessionToken)throw new Error('unauthorized');
  const range=defaultRange();DATA_RANGE=range;
  const out=await rpc('api_owner_data',{p_session_token:s.sessionToken,p_from:range.from,p_to:range.to});
  EMPLOYEES=(out.employees||[]).map(normalizeEmployee);
  APP_DATA={entries:(out.entries||[]).map(normalizeEntry),settings:{plannedDays:{},employeeSettings:{}}};
  hydrateEmployeeSettings();hydrateSchedule(out.schedule||[]);
  return out;
}
async function saveEmployeeEntry(date,patch={}){
  const s=getSession();if(!s?.sessionToken)throw new Error('unauthorized');
  const empId=CURRENT_EMPLOYEE?.id;const prev=entryFor(empId,date,false)||{status:'worked',arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:''};
  const next={...prev,...patch};
  await rpc('api_employee_save_entry',{
    p_session_token:s.sessionToken,p_work_date:date,p_status:next.status||'worked',p_arrival:next.arrival||'',p_departure:next.departure||'',p_pause_minutes:Number(next.pause??45),p_comment:next.comment||'',p_arrival_mode:next.arrivalMode||'',p_departure_mode:next.departureMode||''
  });
  await loadEmployeeData();
}
async function ownerUpdateEntry(emp,date,patch,validationStatus='pending'){
  const s=getSession();const prev=entryFor(emp,date,false)||{status:'worked',arrival:'',departure:'',pause:45,comment:''};const next={...prev,...patch};
  await rpc('api_owner_save_entry',{p_session_token:s.sessionToken,p_employee_id:emp,p_work_date:date,p_status:next.status||'worked',p_arrival:next.arrival||'',p_departure:next.departure||'',p_pause_minutes:Number(next.pause??45),p_comment:next.comment||'',p_validation_status:validationStatus});
  await loadOwnerData();
}
async function validateEntry(emp,date){const s=getSession();await rpc('api_owner_validate_entry',{p_session_token:s.sessionToken,p_employee_id:emp,p_work_date:date});await loadOwnerData();return true}
async function setPlannedWorkingDay(empId,date,value){const s=getSession();await rpc('api_owner_set_schedule',{p_session_token:s.sessionToken,p_employee_id:empId,p_work_date:date,p_is_working:!!value,p_note:''});APP_DATA.settings.plannedDays[empId]=APP_DATA.settings.plannedDays[empId]||{};APP_DATA.settings.plannedDays[empId][date]=!!value}
async function setEmployeeSettings(empId,patch){const s=getSession();const current=employeeSettings(empId);await rpc('api_owner_set_employee_settings',{p_session_token:s.sessionToken,p_employee_id:empId,p_weekly_objective_minutes:Number(patch.weeklyObjectiveMinutes??current.weeklyObjectiveMinutes),p_overtime_threshold_minutes:Number(patch.overtimeThresholdMinutes??current.overtimeThresholdMinutes)});await loadOwnerData()}
async function logout(){const s=getSession();try{if(s?.sessionToken)await rpc('api_logout',{p_session_token:s.sessionToken})}catch{}clearSession();location.reload()}

function downloadCSV(){const rows=[['Employé','Date','Planifié','Statut','Arrivée','Départ','Pause (min)','Heures','Validation','Commentaire','Saisie arrivée','Saisie départ']];APP_DATA.entries.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{const emp=EMPLOYEES.find(x=>x.id===e.employeeId);rows.push([emp?.name||e.employeeId,e.date,isPlannedWorkingDay(e.employeeId,e.date)?'Travaillé':'Non travaillé',e.status==='off'?'Jour non travaillé':'Travaillé',e.arrival,e.departure,e.pause,e.status==='off'?'0h00':fmtMin(minutes(e.arrival,e.departure,e.pause)),e.validationStatus==='validated'?'Validé':e.validationStatus==='pending'?'À valider':'',e.comment||'',e.arrivalMode||'',e.departureMode||''])});const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='horaires.csv';a.click();URL.revokeObjectURL(a.href)}
function setManifestFor(){let link=document.querySelector('link[rel="manifest"]');if(!link){link=document.createElement('link');link.rel='manifest';document.head.appendChild(link)}link.href='manifest.json'}

// V1.7 — ergonomie clavier des formulaires
function timeToMinutes(value){if(!/^\d{2}:\d{2}$/.test(value||''))return null;const [h,m]=value.split(':').map(Number);return h*60+m}
function minutesToTime(total){total=((total%(24*60))+(24*60))%(24*60);return `${pad(Math.floor(total/60))}:${pad(total%60)}`}
function stepTimeInput(input,direction,event){const step=event.shiftKey?15:5;let current=timeToMinutes(input.value);if(current===null){const now=new Date();current=Math.round((now.getHours()*60+now.getMinutes())/step)*step}input.value=minutesToTime(current+(direction*step));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
function submitCurrentContext(el){const modal=el.closest('.modal.open');if(modal){const primary=[...modal.querySelectorAll('button.btn-primary:not([disabled])')].pop();if(primary){primary.click();return true}}const form=el.closest('form');if(form){if(form.requestSubmit)form.requestSubmit();else form.submit();return true}return false}
document.addEventListener('keydown',event=>{const el=event.target;if(!(el instanceof HTMLElement))return;if(el.matches('input[type="time"]')){if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();stepTimeInput(el,event.key==='ArrowUp'?1:-1,event);return}if(event.key==='Enter'){event.preventDefault();submitCurrentContext(el);return}}if(el.matches('input:not([type="time"]):not([type="button"]):not([type="submit"]), select')&&event.key==='Enter'){const modal=el.closest('.modal.open');if(modal){event.preventDefault();submitCurrentContext(el)}}});
document.addEventListener('focusin',event=>{const el=event.target;if(el instanceof HTMLInputElement&&el.type==='time')el.title='Flèches ↑/↓ : ±5 min · Maj + flèche : ±15 min · Entrée : valider'});

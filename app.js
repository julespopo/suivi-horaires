const EMPLOYEES=[
  {id:'emma',name:'Emma',token:'emma-4F7P2A',demoPin:'1842'},
  {id:'julie',name:'Julie',token:'julie-9K3M8D',demoPin:'5726'},
  {id:'marc',name:'Marc',token:'marc-2R6V1Q',demoPin:'3914'},
  {id:'thomas',name:'Thomas',token:'thomas-8K4X2Q',demoPin:'8463'}
];
const OWNER={token:'gestion-7Q9M2X',demoPin:'2648'};
const KEY='hours_demo_v3';
const SESSION_KEY='hours_demo_session_v1';
function iso(d=new Date()){const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
function pad(n){return String(n).padStart(2,'0')}
function hm(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function frDate(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(s+'T12:00:00'))}
function longDate(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(s+'T12:00:00'))}
function shortDate(s){return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(s+'T12:00:00'))}
function shortWeekday(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'short'}).format(new Date(s+'T12:00:00')).replace('.','')}
function monthLabel(d){return new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric'}).format(d)}
function minutes(a,b,pause=0){if(!a||!b)return 0;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let m=(bh*60+bm)-(ah*60+am)-Number(pause||0);return Math.max(0,m)}
function fmtMin(m){const h=Math.floor(m/60),mm=m%60;return `${h}h${pad(mm)}`}
function getData(){let x=localStorage.getItem(KEY);if(x)return JSON.parse(x);const now=new Date();const seed={entries:[],edits:[],settings:{plannedDays:{}}};EMPLOYEES.forEach((e,ei)=>{for(let i=1;i<=6;i++){const d=new Date(now);d.setDate(now.getDate()-i);if(d.getDay()===0||d.getDay()===6)continue;const ds=iso(d);let arrival=`08:${pad(2+ei*3+i)}`;let departure=`17:${pad(5+ei*2+i)}`;let pause=45;if(i===2&&ei===1)departure='';if(i===3&&ei===2)arrival='';seed.entries.push({employeeId:e.id,date:ds,status:'worked',arrival,departure,pause,comment:'',arrivalMode:'now',departureMode:departure?'now':'',updatedAt:new Date().toISOString()})}});localStorage.setItem(KEY,JSON.stringify(seed));return seed}
function saveData(d){localStorage.setItem(KEY,JSON.stringify(d))}
function entryFor(emp,date,create=false){const d=getData();let e=d.entries.find(x=>x.employeeId===emp&&x.date===date);if(!e&&create){e={employeeId:emp,date,status:'worked',arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:'',updatedAt:new Date().toISOString()};d.entries.push(e);saveData(d)}return e}
function upsert(emp,date,patch,meta={}){const d=getData();let e=d.entries.find(x=>x.employeeId===emp&&x.date===date);if(!e){e={employeeId:emp,date,status:'worked',arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:'',updatedAt:new Date().toISOString()};d.entries.push(e)}Object.assign(e,patch,{updatedAt:new Date().toISOString()});d.edits.push({employeeId:emp,date,at:new Date().toISOString(),...meta});saveData(d);return e}
function employeeByToken(t){return EMPLOYEES.find(e=>e.token===t)||null}
function weekdayDates(days=14){let arr=[],d=new Date();for(let i=0;i<days;i++){let x=new Date(d);x.setDate(d.getDate()-i);if(x.getDay()!==0&&x.getDay()!==6)arr.push(iso(x))}return arr}
function tasksFor(emp){const data=getData();return weekdayDates(10).filter(date=>{if(date===iso())return false;const e=data.entries.find(x=>x.employeeId===emp&&x.date===date);if(e?.status==='off')return false;return !e||!e.arrival||!e.departure}).map(date=>{const e=data.entries.find(x=>x.employeeId===emp&&x.date===date);let missing=!e?'Journée à renseigner':(!e.arrival&&!e.departure?'Arrivée et départ manquants':!e.arrival?'Arrivée manquante':'Départ manquant');return {date,missing}})}
function weekBounds(ref=new Date()){const d=new Date(ref);const day=(d.getDay()+6)%7;const start=new Date(d);start.setDate(d.getDate()-day);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(start.getDate()+6);end.setHours(23,59,59,999);return [start,end]}
function monthBounds(ref=new Date()){return [new Date(ref.getFullYear(),ref.getMonth(),1),new Date(ref.getFullYear(),ref.getMonth()+1,0,23,59,59)]}
function totalFor(emp,start,end){return getData().entries.filter(e=>e.employeeId===emp&&e.status!=='off'&&new Date(e.date+'T12:00:00')>=start&&new Date(e.date+'T12:00:00')<=end).reduce((s,e)=>s+minutes(e.arrival,e.departure,e.pause),0)}
function downloadCSV(){const rows=[['Employé','Date','Statut','Arrivée','Départ','Pause (min)','Heures','Commentaire','Saisie arrivée','Saisie départ']];getData().entries.sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{const emp=EMPLOYEES.find(x=>x.id===e.employeeId);rows.push([emp?.name||e.employeeId,e.date,e.status==='off'?'Jour non travaillé':'Travaillé',e.arrival,e.departure,e.pause,e.status==='off'?'0h00':fmtMin(minutes(e.arrival,e.departure,e.pause)),e.comment||'',e.arrivalMode||'',e.departureMode||''])});const csv=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='horaires.csv';a.click();URL.revokeObjectURL(a.href)}
function getSession(){try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function setSession(s){localStorage.setItem(SESSION_KEY,JSON.stringify(s))}
function clearSession(){localStorage.removeItem(SESSION_KEY)}
function isEmployeeSession(emp){const s=getSession();return !!s&&s.role==='employee'&&s.employeeId===emp.id}
function isOwnerSession(){const s=getSession();return !!s&&s.role==='owner'}
function logout(){clearSession();location.reload()}
function setManifestFor(emp){let link=document.querySelector('link[rel="manifest"]');if(!link){link=document.createElement('link');link.rel='manifest';document.head.appendChild(link)}link.href=`manifest-${emp.id}.json`}
function dateObjFromIso(s){return new Date(s+'T12:00:00')}
function startOfWeek(ref){const d=new Date(ref);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);d.setHours(12,0,0,0);return d}
function endOfWeek(ref){const d=startOfWeek(ref);d.setDate(d.getDate()+6);return d}
function listDates(start,end){let dates=[];const d=new Date(start);while(d<=end){dates.push(iso(d));d.setDate(d.getDate()+1)}return dates}
function isFuture(date){return date>iso()}
function dayInfoFor(empId,date){const entry=getData().entries.find(x=>x.employeeId===empId&&x.date===date);const isWeekend=[0,6].includes(dateObjFromIso(date).getDay());if(!entry)return {entry:null,status:isWeekend?'weekend':'empty',minutes:0,label:isWeekend?'Week-end':'À compléter'};if(entry.status==='off')return {entry,status:'off',minutes:0,label:'Non travaillé'};const total=minutes(entry.arrival,entry.departure,entry.pause);if(entry.arrival&&entry.departure)return {entry,status:'complete',minutes:total,label:fmtMin(total)};return {entry,status:'incomplete',minutes:total,label:'À compléter'};}

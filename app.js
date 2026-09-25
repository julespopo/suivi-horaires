const EMPLOYEES=[
{id:'emma',name:'Emma',token:'emma-4F7P2A'},
{id:'julie',name:'Julie',token:'julie-9K3M8D'},
{id:'marc',name:'Marc',token:'marc-2R6V1Q'},
{id:'thomas',name:'Thomas',token:'thomas-8K4X2Q'}
];
const KEY='hours_demo_v2';
function iso(d=new Date()){return d.toISOString().slice(0,10)}
function pad(n){return String(n).padStart(2,'0')}
function hm(d=new Date()){return `${pad(d.getHours())}:${pad(d.getMinutes())}`}
function frDate(s){return new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(s+'T12:00:00'))}
function shortDate(s){return new Intl.DateTimeFormat('fr-FR',{day:'2-digit',month:'2-digit'}).format(new Date(s+'T12:00:00'))}
function minutes(a,b,pause=0){if(!a||!b)return 0;const [ah,am]=a.split(':').map(Number),[bh,bm]=b.split(':').map(Number);let m=(bh*60+bm)-(ah*60+am)-Number(pause||0);return Math.max(0,m)}
function fmtMin(m){const h=Math.floor(m/60),mm=m%60;return `${h}h${pad(mm)}`}
function getData(){let x=localStorage.getItem(KEY);if(x)return JSON.parse(x);const now=new Date();const seed={entries:[],edits:[]};EMPLOYEES.forEach((e,ei)=>{for(let i=1;i<=6;i++){const d=new Date(now);d.setDate(now.getDate()-i);if(d.getDay()===0||d.getDay()===6)continue;const ds=iso(d);let arrival=`08:${pad(2+ei*3+i)}`;let departure=`17:${pad(5+ei*2+i)}`;let pause=45;if(i===2&&ei===1)departure='';if(i===3&&ei===2)arrival='';seed.entries.push({employeeId:e.id,date:ds,arrival,departure,pause,comment:'',arrivalMode:'now',departureMode:departure?'now':'',updatedAt:new Date().toISOString()})}}
);localStorage.setItem(KEY,JSON.stringify(seed));return seed}
function saveData(d){localStorage.setItem(KEY,JSON.stringify(d))}
function entryFor(emp,date,create=false){const d=getData();let e=d.entries.find(x=>x.employeeId===emp&&x.date===date);if(!e&&create){e={employeeId:emp,date,arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:'',updatedAt:new Date().toISOString()};d.entries.push(e);saveData(d)}return e}
function upsert(emp,date,patch,meta={}){const d=getData();let e=d.entries.find(x=>x.employeeId===emp&&x.date===date);if(!e){e={employeeId:emp,date,arrival:'',departure:'',pause:45,comment:'',arrivalMode:'',departureMode:'',updatedAt:new Date().toISOString()};d.entries.push(e)};Object.assign(e,patch,{updatedAt:new Date().toISOString()});d.edits.push({employeeId:emp,date,at:new Date().toISOString(),...meta});saveData(d);return e}
function employeeByToken(t){return EMPLOYEES.find(e=>e.token===t)||EMPLOYEES[0]}
function weekdayDates(days=14){let arr=[],d=new Date();for(let i=0;i<days;i++){let x=new Date(d);x.setDate(d.getDate()-i);if(x.getDay()!==0&&x.getDay()!==6)arr.push(iso(x))}return arr}
function tasksFor(emp){const data=getData();return weekdayDates(10).filter(date=>{if(date===iso())return false;const e=data.entries.find(x=>x.employeeId===emp&&x.date===date);return !e||!e.arrival||!e.departure}).map(date=>{const e=data.entries.find(x=>x.employeeId===emp&&x.date===date);let missing=!e?'Journée à renseigner':(!e.arrival&& !e.departure?'Arrivée et départ manquants':!e.arrival?'Arrivée manquante':'Départ manquant');return {date,missing}})}
function weekBounds(ref=new Date()){const d=new Date(ref);const day=(d.getDay()+6)%7;const start=new Date(d);start.setDate(d.getDate()-day);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(start.getDate()+6);end.setHours(23,59,59,999);return [start,end]}
function monthBounds(ref=new Date()){return [new Date(ref.getFullYear(),ref.getMonth(),1),new Date(ref.getFullYear(),ref.getMonth()+1,0,23,59,59)]}
function totalFor(emp,start,end){return getData().entries.filter(e=>e.employeeId===emp&&new Date(e.date+'T12:00:00')>=start&&new Date(e.date+'T12:00:00')<=end).reduce((s,e)=>s+minutes(e.arrival,e.departure,e.pause),0)}
function downloadCSV(){const rows=[['Employé','Date','Arrivée','Départ','Pause (min)','Heures','Commentaire','Saisie arrivée','Saisie départ']];getData().entries.sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{const emp=EMPLOYEES.find(x=>x.id===e.employeeId);rows.push([emp?.name||e.employeeId,e.date,e.arrival,e.departure,e.pause,fmtMin(minutes(e.arrival,e.departure,e.pause)),e.comment||'',e.arrivalMode||'',e.departureMode||''])});const csv=rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='horaires.csv';a.click();URL.revokeObjectURL(a.href)}

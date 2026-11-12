import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd();
const server=http.createServer((req,res)=>{
 const file=path.join(root,new URL(req.url,'http://localhost').pathname);
 try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}
 catch{res.statusCode=404;res.end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true});
const context=await browser.newContext({serviceWorkers:'block',timezoneId:'Europe/Paris'});
await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/pilotage.html');
 await page.evaluate(()=>{
  EMPLOYEES=[{id:'fixture',name:'Salarié fictif',weeklyObjectiveMinutes:2100,overtimeThresholdMinutes:2100}];
  APP_DATA={entries:[],settings:{plannedDays:{},employeeSettings:{}}};hydrateEmployeeSettings();
  V2_DATA={employers:[],assignments:[],segments:[],leaves:[]};
  invalidView.classList.add('hidden');appView.classList.remove('hidden');
 });
 await page.evaluate(()=>{completionCursor=dateObjFromIso('2026-11-11');planningView='month';renderOwner()});
 assert.equal(await page.locator('.completion-day[onclick*="2026-11-11"] .completion-label').innerText(),'Férié');
 assert.equal(await page.locator('.completion-day[onclick*="2026-11-11"]').getAttribute('title'),'Armistice 1918');
 await page.evaluate(()=>openPlanning('2026-11-11'));
 assert.ok((await page.locator('#planningDateLabel').innerText()).includes('Armistice'));
 assert.equal(await page.locator('[data-plan-emp="fixture"]').isChecked(),false);
 await page.evaluate(()=>{closePlanning();APP_DATA.settings.plannedDays={fixture:{'2026-11-11':true}};renderOwner()});
 assert.notEqual(await page.locator('.completion-day[onclick*="2026-11-11"] .completion-label').innerText(),'Férié');
 await page.evaluate(()=>{APP_DATA.settings.plannedDays={};APP_DATA.entries=[{employeeId:'fixture',date:'2026-11-11',status:'worked',arrival:'08:00',departure:'12:00',pause:0,validationStatus:'pending'}];renderOwner()});
 assert.equal(await page.locator('.completion-day[onclick*="2026-11-11"] .completion-label').innerText(),'Complet');
 assert.ok((await page.evaluate(()=>employeeWeekDayHtml('fixture','2026-11-11'))).includes('À valider'));
 await page.evaluate(()=>{APP_DATA.entries=[]});
 console.log('✓ Calendrier pilotage : férié identifié, exception travaillée et heures réelles prioritaires');
 for(const width of [320,390,620,768,900,1280]){
  await page.setViewportSize({width,height:1000});
  for(const date of ['2026-11-01','2026-12-01','2027-02-01','2028-02-01']){
   await page.evaluate(date=>{completionCursor=dateObjFromIso(date);planningView='month';renderOwner()},date);
   for(const scroll of [0,140,10000]){
    const result=await page.evaluate(scroll=>{
     const surface=document.querySelector('.completion-month-calendar');surface.scrollLeft=scroll;
     const heads=[...surface.querySelectorAll('.calendar-head>div')];
     const days=[...surface.querySelectorAll('.completion-day')];
     const alignment=days.every(day=>{
      const date=day.getAttribute('onclick').match(/\d{4}-\d{2}-\d{2}/)[0];
      const col=(dateObjFromIso(date).getDay()+6)%7;
      return Math.abs(day.getBoundingClientRect().left-heads[col].getBoundingClientRect().left)<1;
     });
     const before=surface.scrollLeft;renderOwner();
     return {alignment,before,after:document.querySelector('.completion-month-calendar').scrollLeft,overflow:document.documentElement.scrollWidth>innerWidth};
    },scroll);
    assert.equal(result.alignment,true,`${width} ${date} alignment after scroll ${scroll}`);
    assert.equal(result.after,result.before,'Refresh must preserve horizontal position');
    assert.equal(result.overflow,false,'Calendar must not overflow the page');
   }
  }
  console.log(`✓ ${width}px : jours alignés, mois et année bissextile, défilement et rafraîchissement`);
 }
 await page.setViewportSize({width:390,height:1000});
 await page.evaluate(()=>{completionCursor=dateObjFromIso('2026-11-05');setPlanningView('month')});
 assert.equal(await page.locator('.completion-month-calendar .calendar-empty').count(),6);
 await page.evaluate(()=>{document.querySelector('.completion-month-calendar').scrollLeft=100;shiftPlanningPeriod(1)});
 assert.equal(await page.locator('.completion-month-calendar').evaluate(el=>el.scrollLeft),0,'New month starts at left edge');
 await page.evaluate(()=>{completionCursor=dateObjFromIso('2026-11-05');setPlanningView('month')});
 await page.locator('.completion-day[onclick*="2026-11-02"]').click();
 assert.equal(await page.locator('#planningModal').evaluate(el=>el.classList.contains('open')),true);
 await page.evaluate(()=>closePlanning());
 await page.evaluate(()=>{togglePlanningSelectionMode();document.querySelector('.completion-month-calendar').scrollLeft=120});
 // Exercise the selection redraw without Playwright scrolling the button into view.
 await page.locator('.completion-day[onclick*="2026-11-04"]').evaluate(button=>button.click());
 assert.equal(await page.evaluate(()=>selectedPlanningDates.has('2026-11-04')),true);
 assert.equal(await page.locator('.completion-month-calendar').evaluate(el=>el.scrollLeft),120);
 await page.evaluate(()=>{clearPlanningSelection();setPlanningView('week')});
 assert.equal(await page.locator('.completion-week-calendar .calendar-head').isVisible(),false);
 const weekScroll=await page.locator('.planning-week-grid').evaluate(el=>{el.scrollLeft=150;return el.scrollLeft});
 await page.evaluate(()=>renderOwner());
 assert.equal(await page.locator('.planning-week-grid').evaluate(el=>el.scrollLeft),weekScroll);
 console.log('✓ Navigation, ouverture d’une date, sélection multiple et vue semaine');
 await page.clock.install({time:new Date('2026-11-07T12:00:00+01:00')});
 await page.evaluate(()=>{
  EMPLOYEES.push({...EMPLOYEES[0],id:'fixture-b',name:'Autre salarié fictif'});hydrateEmployeeSettings();
  APP_DATA.entries=[
   {employeeId:'fixture',date:'2026-11-02',status:'worked',arrival:'08:00',departure:'17:00',pause:60},
   {employeeId:'fixture-b',date:'2026-11-02',status:'worked',arrival:'08:00',departure:'17:00',pause:60},
   {employeeId:'fixture',date:'2026-11-03',status:'worked',arrival:'08:00',departure:'17:00',pause:60}
  ];
  completionCursor=dateObjFromIso('2026-11-05');setPlanningView('month');
 });
 const palette=()=>Object.fromEntries(['all','partial','none','weekend','upcoming'].flatMap(state=>{
  const el=document.querySelector('.completion-day.'+state);if(!el)return [];
  const style=getComputedStyle(el);return [[state,{background:style.backgroundColor,text:style.color}]];
 }));
 for(const theme of ['light','dark']){
  await page.evaluate(theme=>{applyTheme(theme);setPlanningView('month')},theme);
  const month=await page.evaluate(palette);
  assert.equal(new Set(Object.values(month).map(value=>value.background)).size,5,`${theme}: all calendar states must remain visually distinct`);
  if(theme==='dark'){
   for(const value of Object.values(month)){
    const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
    const a=luminance(value.background),b=luminance(value.text);
    assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Readable dark calendar labels');
   }
  }
  await page.evaluate(()=>setPlanningView('week'));const week=await page.evaluate(palette);
  for(const state of ['all','partial','none','weekend'])assert.deepEqual(week[state],month[state],`${theme}: same status palette in week and month`);
  await page.evaluate(()=>{togglePlanningSelectionMode();togglePlanningDateSelection('2026-11-02')});
  const selection=await page.locator('.completion-day.selected-for-bulk').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(selection,month.all.background,`${theme}: selection must remain distinct from complete status`);
  await page.evaluate(()=>clearPlanningSelection());
 }
 console.log('✓ Couleurs des états conservées en mode jour/nuit, contraste lisible et sélection distincte');
 await page.evaluate(()=>{setPlanningView('month');document.querySelector('.completion-month-calendar').scrollLeft=100});
 if(process.env.CALENDAR_SCREENSHOT)await page.locator('#completionCalendar').screenshot({path:process.env.CALENDAR_SCREENSHOT});
 assert.deepEqual(errors,[]);
 console.log('✓ Aucune erreur JavaScript ; aucun accès à la production');
}finally{await browser.close();server.close()}

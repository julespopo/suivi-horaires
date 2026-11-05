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
 await page.evaluate(()=>{setPlanningView('month');document.querySelector('.completion-month-calendar').scrollLeft=100});
 if(process.env.CALENDAR_SCREENSHOT)await page.locator('#completionCalendar').screenshot({path:process.env.CALENDAR_SCREENSHOT});
 assert.deepEqual(errors,[]);
 console.log('✓ Aucune erreur JavaScript ; aucun accès à la production');
}finally{await browser.close();server.close()}

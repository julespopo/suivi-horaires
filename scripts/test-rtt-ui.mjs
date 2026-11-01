import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd();
const server=http.createServer((req,res)=>{const file=path.join(root,(new URL(req.url,'http://localhost').pathname==='/'?'/index.html':new URL(req.url,'http://localhost').pathname));try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(fs.readFileSync(file))}catch{res.statusCode=404;res.end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block'});
await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
const page=await context.newPage();await page.clock.install({time:new Date('2026-11-16T12:00:00+01:00')});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const setup=`
 CURRENT_EMPLOYEE={id:'test-employee',name:'Salarié fictif',weeklyObjectiveMinutes:2100,overtimeThresholdMinutes:2100};
 EMPLOYEES=[CURRENT_EMPLOYEE];
 APP_DATA={entries:[],settings:{plannedDays:{},employeeSettings:{}}};hydrateEmployeeSettings();
 V2_DATA={employers:[{id:'test-employer',name:'Employeur fictif',active:true}],assignments:[{employeeId:'test-employee',employerId:'test-employer',active:true}],segments:[],leaves:[]};
 document.getElementById('invalidView').classList.add('hidden');document.getElementById('appView').classList.remove('hidden');
`;
let tests=0;function ok(name,result){assert.ok(result,name);tests++;console.log('✓ '+name)}
try{
 await page.goto(base+'/employee.html');await page.evaluate(setup+`emp=CURRENT_EMPLOYEE;APP_DATA.settings.plannedDays[emp.id]={[iso()]:true};render();`);
 ok('Aucune journée ni tâche avant le lancement',await page.evaluate(()=>APP_START_DATE==='2026-11-02'&&!tasksFor(emp.id).some(t=>t.date<APP_START_DATE)&&dayInfoFor(emp.id,'2026-11-01').status==='before-start'));
 ok('Historique compact, jours repliés et vues détaillées repliées',await page.evaluate(()=>document.querySelectorAll('#compactHistory details').length>0&&!document.querySelector('#history details[open]')));
 ok('Historique limité à 5 lignes et moins de 440px sur mobile',await page.evaluate(()=>document.querySelectorAll('#compactHistory details').length===5&&document.getElementById('history').getBoundingClientRect().height<440));
 const recent=await page.locator('#compactHistory summary').first().innerText();
 await page.locator('#historyOlder').click();
 ok('Accès aux jours anciens sans agrandir la liste',await page.locator('#compactHistory details').count()===5&&(await page.locator('#compactHistory summary').first().innerText())!==recent);
 await page.locator('#historyNewer').click();
 ok('Retour aux plus récents',await page.locator('#compactHistory summary').first().innerText()===recent&&await page.locator('#historyNewer').isDisabled());
 await page.locator('#history').screenshot({path:'/tmp/suivi-history-compact.png'});
 await page.locator('#compactHistory summary').first().click();ok('Une journée se développe au clic',await page.locator('#compactHistory details').first().getAttribute('open')!==null);
 ok('Détail semaine / mois conservé',await page.locator('#historyCalendar').count()===1);
 ok('Pas de débordement mobile',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 // Exercise actual offline action path for each arrival shortcut and free input.
 await page.evaluate(`getSession=()=>({role:'employee',sessionToken:'fixture-only'});`);
 await context.setOffline(true);
 for(const time of ['07:30','14:00']){
  await page.evaluate(`V2_DATA.segments=[];APP_DATA.entries=[];localStorage.clear();render();`);
  await page.getByRole('button',{name:time.replace(':','h'),exact:true}).click();
  ok('Raccourci arrivée '+time,await page.evaluate(t=>V2_DATA.segments[0]?.start===t,time));
 }
 await page.getByRole('button',{name:'18h00',exact:true}).click();
 ok('Raccourci départ 18h',await page.evaluate(()=>V2_DATA.segments[0]?.end==='18:00'));
 await page.evaluate(`V2_DATA.segments=[];APP_DATA.entries=[];localStorage.clear();render();`);
 await page.getByText('Corriger l’heure de début',{exact:true}).click();await page.locator('#todayArrivalManual').fill('08:17');await page.locator('[onclick="startEmployerManual()"]').click();
 ok('Saisie libre conservée',await page.evaluate(()=>V2_DATA.segments[0]?.start==='08:17'));
 await page.evaluate(`V2_DATA.segments=[];APP_DATA.entries=[];localStorage.clear();V2_DATA.leaves=[{id:'rtt',employeeId:emp.id,startDate:iso(),endDate:iso(),type:'rtt_morning',status:'validated'}];render();`);
 ok('Demi-RTT affiche une bannière et laisse la saisie accessible',await page.locator('#todayLeaveBanner').innerText().then(s=>s.includes('RTT matin'))&&await page.locator('#todayArrivalManual').isEnabled());
 await page.getByRole('button',{name:'14h00',exact:true}).click();await page.getByRole('button',{name:'18h00',exact:true}).click();
 ok('Total RTT matin + travail = 4h',await page.evaluate(()=>workMinutesForDay(emp.id,iso())===240));
 await page.evaluate(`openLeaveModal();`);await page.locator('#leaveType').selectOption('rtt_afternoon');
 await page.evaluate(`leaveStart.value='2026-11-10';leaveEnd.value='2026-11-10';`);await page.getByRole('button',{name:'Envoyer la demande'}).click();
 ok('Type RTT préservé dans la file hors ligne',await page.evaluate(()=>getEmployeeOfflineQueue().some(a=>a.type==='leave_request'&&a.leaveType==='rtt_afternoon')));
 ok('Libellé RTT dans les demandes',await page.locator('#leaveList').innerText().then(s=>s.includes('RTT après-midi')));
 await context.setOffline(false);await page.goto(base+'/pilotage.html');await page.evaluate(setup+`
  V2_DATA.leaves=[{id:'half',employeeId:CURRENT_EMPLOYEE.id,startDate:'2026-11-06',endDate:'2026-11-06',type:'rtt_morning',status:'validated',note:'Récupération'}, {id:'full',employeeId:CURRENT_EMPLOYEE.id,startDate:'2026-11-05',endDate:'2026-11-05',type:'rtt',status:'validated'}];
  V2_DATA.segments=[{id:'s',employeeId:CURRENT_EMPLOYEE.id,date:'2026-11-06',employerId:'test-employer',employerName:'Employeur fictif',start:'14:00',end:'18:00'}];
  APP_DATA.entries=[{employeeId:CURRENT_EMPLOYEE.id,date:'2026-11-06',status:'worked',arrival:'14:00',departure:'18:00',pause:0,comment:'Commentaire fictif',validationStatus:'pending'}];
  renderOwner();buildPrintReport('2026-11','all');
 `);
 ok('Calendrier : futur et aujourd’hui neutres, jours passés non remplis signalés',await page.evaluate(()=>completionForDate('2026-11-17').kind==='upcoming'&&completionForDate('2026-11-16').kind==='upcoming'&&completionForDate('2026-11-13').kind==='none'));
 await page.evaluate(()=>{completionCursor=new Date('2026-11-16T12:00:00');setPlanningView('month')});
 ok('Vues mois et semaine : aucune case rouge aujourd’hui ou dans le futur',await page.evaluate(()=>{const check=()=>![...document.querySelectorAll('.completion-day.none,.completion-day.partial')].some(b=>{const date=b.getAttribute('onclick').match(/2026-\d{2}-\d{2}/)?.[0];return date>=iso()});const month=check();setPlanningView('week');return month&&check()}));
 ok('PDF : RTT, créneaux, total 4h, note et demi-journée',await page.locator('#printReport').textContent().then(s=>s.includes('RTT matin')&&s.includes('14:00')&&s.includes('18:00')&&s.includes('4h00')&&s.includes('1.5')&&s.includes('Récupération')&&s.includes('Commentaire fictif')));
 ok('Pilotage : demi-RTT reste modifiable et validable',await page.evaluate(()=>{const html=planningRow(CURRENT_EMPLOYEE,'2026-11-06');return html.includes('RTT matin')&&html.includes('14:00')&&html.includes('openOwnerEdit')&&html.includes('validateFromPlanning')}));
 // Desktop/night layouts and render the print view for inspection.
 await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>applyTheme('dark'));
 ok('Pilotage sans débordement en mode nuit',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.emulateMedia({media:'print'});await page.screenshot({path:'/tmp/suivi-rtt-print.png',fullPage:true});
 ok('Aucune erreur JavaScript',errors.length===0);
 const pwaContext=await browser.newContext({serviceWorkers:'allow'});
 const pwa=await pwaContext.newPage();
 await pwa.goto(base+'/employee.html');
 await pwa.evaluate(()=>navigator.serviceWorker.ready);
 await pwa.waitForFunction(()=>!!navigator.serviceWorker.controller);
 ok('PWA : nouveau cache installé',await pwa.evaluate(async()=> (await caches.keys()).includes('suivi-horaires-calendar-dates-20261101')));
 const cached=await pwa.evaluate(async()=>{const cache=await caches.open('suivi-horaires-calendar-dates-20261101');return (await cache.keys()).map(r=>r.url)});
 ok('PWA : scripts et styles versionnés en cache',cached.some(u=>u.endsWith('app.js?v=launch-20261102'))&&cached.some(u=>u.endsWith('employee.js?v=history-compact-20261101'))&&cached.some(u=>u.endsWith('styles/current.css?v=calendar-dates-20261101')));
 await pwaContext.setOffline(true);await pwa.reload();
 ok('PWA : écran et nouveaux contrôles disponibles hors ligne',await pwa.locator('#leaveType option[value="rtt_morning"]').count()===1&&await pwa.evaluate(()=>typeof startPreset==='function'));
 await pwaContext.close();
 console.log(`${tests} tests navigateur réussis.`);
}finally{await browser.close();server.close()}

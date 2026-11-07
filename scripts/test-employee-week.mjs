import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=process.cwd();
const server=http.createServer((req,res)=>{
  const file=path.join(root,new URL(req.url,'http://localhost').pathname);
  try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file))}
  catch{res.statusCode=404;res.end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Paris',serviceWorkers:'block'});
const external=[];
await context.route('**/*',route=>{if(route.request().url().startsWith(base))return route.continue();external.push(route.request().url());return route.abort()});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install({time:new Date('2026-11-07T10:00:00+01:00')});
const fixture=()=>{
  EMPLOYEES=[{id:'fixture-a',name:'Salarié A',weeklyObjectiveMinutes:2460,overtimeThresholdMinutes:2460},{id:'fixture-b',name:'Salarié B',weeklyObjectiveMinutes:2100,overtimeThresholdMinutes:2100}];
  APP_DATA={entries:[],settings:{plannedDays:{},employeeSettings:{}}};hydrateEmployeeSettings();
  V2_DATA={employers:[{id:'farm',name:'Ferme & Cie',active:true},{id:'wood',name:'Bois',active:true}],assignments:[{employeeId:'fixture-a',employerId:'farm',active:true},{employeeId:'fixture-a',employerId:'wood',active:true}],segments:[],leaves:[{id:'rtt',employeeId:'fixture-a',startDate:'2026-11-04',endDate:'2026-11-04',type:'rtt_morning',status:'validated',note:'Récupération'}]};
  const add=(date,segments,pause,status='pending',employeeId='fixture-a',off=false)=>{
    APP_DATA.entries.push({employeeId,date,status:off?'off':'worked',arrival:segments[0]?.[0]||'',departure:segments.at(-1)?.[1]||'',pause,pauseMode:'manual',comment:'',validationStatus:status});
    segments.forEach(([start,end,employerId='farm'],i)=>V2_DATA.segments.push({id:employeeId+'-'+date+'-'+i,employeeId,date,employerId,employerName:employerId==='wood'?'Bois':'Ferme & Cie',start,end}));
  };
  add('2026-11-02',[['07:30','12:00'],['13:00','18:00','wood']],60);
  add('2026-11-03',[['07:30','18:00']],90);
  add('2026-11-04',[['14:00','18:00']],0);
  add('2026-11-05',[['07:30','']],90);
  add('2026-11-06',[],0,'pending','fixture-a',true);
  add('2026-11-07',[['08:00','12:00']],0,'validated');
  add('2026-11-02',[['09:00','17:00']],60,'pending','fixture-b');
  window.calls=[];window.reloads=0;
  getSession=()=>({sessionToken:'fixture-owner'});
  loadOwnerData=async()=>{window.reloads++};
  rpc=async(name,args)=>{
    assertFixtureRpc(name,args);
    window.calls.push(args);
    entryFor(args.p_employee_id,args.p_work_date).validationStatus='validated';
    return true;
  };
  window.assertFixtureRpc=(name,args)=>{if(name!=='api_owner_validate_entry'||args.p_session_token!=='fixture-owner')throw new Error('Unexpected RPC')};
  invalidView.classList.add('hidden');appView.classList.remove('hidden');
  employeeWeekState=null;employeeWeekElements.Modal.classList.remove('open');
  applyTheme('light');renderOwner();
};
async function reset(){await page.evaluate(fixture)}
async function openA(){await page.locator('[data-week-employee="fixture-a"]').click()}
async function waitSaved(){await page.waitForFunction(()=>!employeeWeekBusy&&!saving)}
let count=0;
const ok=name=>{count++;console.log('✓ '+name)};
try{
  await page.goto(base+'/pilotage.html');await reset();
  const card=page.locator('[data-week-employee="fixture-a"]');
  await card.focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#employeeWeekModal').isVisible(),true);
  assert.equal(await page.locator('#employeeWeekTitle').innerText(),'Salarié A');
  assert.match(await page.locator('#employeeWeekPeriod').innerText(),/02\/11.*08\/11/);
  assert.equal(await page.locator('#employeeWeekDays .employee-week-day').count(),7);
  const summary=await page.locator('#employeeWeekSummary').innerText();
  assert.match(summary,/25h30/);assert.match(summary,/41h00/);assert.match(summary,/15h30/);
  assert.equal(await page.locator('[data-week-date="2026-11-02"] .employee-week-segment').count(),2);
  assert.match(await page.locator('[data-week-date="2026-11-02"]').innerText(),/Bois/);
  assert.match(await page.locator('[data-week-date="2026-11-02"]').innerText(),/Pause : 1h00/);
  assert.match(await page.locator('[data-week-date="2026-11-04"]').innerText(),/RTT matin/);
  assert.match(await page.locator('#employeeWeekValidateAll').innerText(),/4 journées/);
  assert.equal(await page.locator('[data-week-date="2026-11-05"] [data-week-validate]').count(),0);
  assert.equal(await page.locator('[data-week-date="2026-11-07"] [data-week-validate]').count(),0);
  assert.equal(await page.locator('#employeeWeekPrevious').isDisabled(),true);
  assert.equal(await page.locator('#employeeWeekNext').isDisabled(),true);
  ok('Fiche accessible au clavier : semaine courante, créneaux, RTT, pauses, heures et validations');
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#employeeWeekModal').evaluate(el=>el.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');
  assert.equal(await card.evaluate(el=>document.activeElement===el),true);
  ok('Fermeture par Échap, focus conservé dans la fenêtre et rendu au salarié');

  await page.locator('[data-week-employee="fixture-b"]').click();
  assert.equal(await page.locator('#employeeWeekTitle').innerText(),'Salarié B');
  assert.match(await page.locator('#employeeWeekSummary').innerText(),/7h00/);
  assert.equal(await page.locator('#employeeWeekDays [data-week-validate]').count(),1);
  await page.evaluate(()=>closeEmployeeWeek());
  ok('Chaque fiche ouvre uniquement les heures et validations du salarié choisi');

  await openA();
  await page.evaluate(()=>{EMPLOYEES[0].name='<img src=x onerror=window.injected=true>';entryFor('fixture-a','2026-11-02').comment='<img src=x onerror=window.injected=true>';V2_DATA.segments[0].employerName='<script>bad</script>';renderOwner()});
  assert.equal(await page.locator('#employeeWeekModal img,#employeeWeekModal script').count(),0);
  assert.equal(await page.evaluate(()=>!!window.injected),false);
  assert.match(await page.locator('#employeeWeekTitle').innerText(),/<img/);
  ok('Noms, employeurs et commentaires affichés comme texte sans injection');

  await reset();await openA();
  await page.locator('[data-week-date="2026-11-02"] [data-week-edit]').click();
  assert.equal(await page.locator('#ownerEditModal').isVisible(),true);
  assert.equal(await page.locator('#ownerSegmentsEditor [data-owner-seg-start]').count(),2);
  await page.evaluate(()=>closeOwnerEdit());
  assert.equal(await page.locator('#employeeWeekModal').isVisible(),true);
  await page.locator('[data-week-validate="2026-11-04"]').click();await waitSaved();
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>[c.p_employee_id,c.p_work_date])),[['fixture-a','2026-11-04']]);
  assert.match(await page.locator('#employeeWeekPending').innerText(),/3 journées/);
  ok('Correction existante accessible et validation individuelle isolée au salarié');

  await reset();await openA();
  await page.evaluate(()=>{
    APP_DATA.entries.push({employeeId:'fixture-a',date:'2026-11-08',status:'worked',arrival:'09:00',departure:'12:00',pause:0,validationStatus:'pending'});
    renderOwner();
  });
  await page.locator('#employeeWeekValidateAll').click();await waitSaved();
  assert.deepEqual(await page.evaluate(()=>calls.map(c=>c.p_work_date)),['2026-11-02','2026-11-03','2026-11-04','2026-11-06']);
  assert.equal(await page.evaluate(()=>entryFor('fixture-b','2026-11-02').validationStatus),'pending');
  assert.equal(await page.evaluate(()=>entryFor('fixture-a','2026-11-08').validationStatus),'pending');
  assert.equal(await page.locator('#employeeWeekValidateAll').isDisabled(),true);
  assert.match(await page.locator('#employeeWeekMessage').innerText(),/4 journées validées/);
  ok('Validation groupée : uniquement journées terminées, dont non travaillé ; autres salariés, futur et créneau ouvert exclus');

  await reset();await openA();
  await page.evaluate(()=>{
    V2_DATA.leaves.push({id:'full',employeeId:'fixture-a',startDate:'2026-11-03',endDate:'2026-11-03',type:'rtt',status:'validated'});
    renderOwner();
  });
  assert.equal(await page.locator('[data-week-date="2026-11-03"] [data-week-validate]').count(),0);
  await page.evaluate(()=>{getSession=()=>null});
  await page.locator('#employeeWeekValidateAll').click();await waitSaved();
  assert.equal(await page.evaluate(()=>calls.length),0);
  assert.match(await page.locator('#employeeWeekMessage').innerText(),/session/);
  ok('Congé journée exclu et absence de session bloque toute validation');

  await reset();await openA();
  await page.evaluate(()=>{loadOwnerData=async()=>{if(++window.reloads===1)entryFor('fixture-a','2026-11-02').pause=45}});
  await page.locator('#employeeWeekValidateAll').click();await waitSaved();
  assert.equal(await page.evaluate(()=>calls.some(c=>c.p_work_date==='2026-11-02')),false);
  assert.equal(await page.evaluate(()=>calls.length),3);
  assert.match(await page.locator('#employeeWeekMessage').innerText(),/1 journée a changé/);
  assert.equal(await page.evaluate(()=>entryFor('fixture-a','2026-11-02').validationStatus),'pending');
  ok('Journée modifiée depuis la consultation laissée à vérifier avant validation');

  await reset();await openA();
  await page.evaluate(()=>{
    rpc=async(name,args)=>{window.calls.push(args);if(calls.length===2)throw new Error('network_timeout');entryFor(args.p_employee_id,args.p_work_date).validationStatus='validated'};
  });
  await page.locator('#employeeWeekValidateAll').click();await waitSaved();
  assert.equal(await page.evaluate(()=>calls.length),2);
  assert.match(await page.locator('#employeeWeekMessage').innerText(),/1 journée validée/);
  assert.match(await page.locator('#employeeWeekMessage').innerText(),/réseau/);
  assert.match(await page.locator('#employeeWeekPending').innerText(),/3 journées/);
  ok('Panne après une validation : succès partiel conservé, arrêt des appels et reste réessayable');

  await reset();await openA();
  await page.evaluate(()=>{rpc=async(name,args)=>{window.calls.push(args);await new Promise(resolve=>window.releaseValidation=resolve);entryFor(args.p_employee_id,args.p_work_date).validationStatus='validated'};window.firstSave=validateEmployeeWeek('2026-11-02');window.secondSave=validateEmployeeWeek('2026-11-02')});
  await page.waitForFunction(()=>typeof window.releaseValidation==='function');
  assert.equal(await page.locator('#employeeWeekValidateAll').isDisabled(),true);
  await page.evaluate(async()=>{window.releaseValidation();await window.firstSave;await window.secondSave});
  assert.equal(await page.evaluate(()=>calls.length),1);
  ok('Double clic et navigation pendant une validation ne dupliquent pas les écritures');

  await reset();
  await page.clock.setFixedTime(new Date('2026-11-14T10:00:00+01:00'));await openA();
  assert.match(await page.locator('#employeeWeekPeriod').innerText(),/09\/11.*15\/11/);
  assert.match(await page.locator('#employeeWeekBacklogTitle').innerText(),/4/);
  await page.locator('#employeeWeekBacklogTitle').click();
  assert.equal(await page.locator('#employeeWeekBacklogDays [data-week-validate]').count(),4);
  await page.locator('#employeeWeekPrevious').click();
  assert.match(await page.locator('#employeeWeekPeriod').innerText(),/02\/11.*08\/11/);
  await page.locator('#employeeWeekCurrent').click();
  assert.match(await page.locator('#employeeWeekPeriod').innerText(),/09\/11.*15\/11/);
  ok('Semaines précédentes et autres journées en attente accessibles depuis le même salarié');
  await page.evaluate(()=>closeEmployeeWeek());
  await page.clock.setFixedTime(new Date('2027-01-02T10:00:00+01:00'));await openA();
  assert.match(await page.locator('#employeeWeekPeriod').innerText(),/28\/12.*03\/01 2027/);
  ok('Semaine traversant le changement d’année');

  await page.evaluate(()=>closeEmployeeWeek());await page.clock.setFixedTime(new Date('2026-11-07T10:00:00+01:00'));
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});await reset();await openA();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await page.locator('#employeeWeekModal .sheet').evaluate(el=>el.scrollWidth>el.clientWidth),false);
    await page.evaluate(()=>applyTheme('dark'));
    if(process.env.WEEK_SCREENSHOT_DIR){
      fs.mkdirSync(process.env.WEEK_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:path.join(process.env.WEEK_SCREENSHOT_DIR,`semaine-salarie-${width}-nuit.png`),animations:'disabled'});
      await page.evaluate(()=>applyTheme('light'));
      await page.screenshot({path:path.join(process.env.WEEK_SCREENSHOT_DIR,`semaine-salarie-${width}.png`),animations:'disabled'});
    }
    await page.evaluate(()=>closeEmployeeWeek());
  }
  ok('Vue mobile, tablette, ordinateur et mode nuit sans débordement');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  console.log(`${count} contrôles de synthèse salarié réussis, aucun accès externe.`);
}finally{await browser.close();server.close()}

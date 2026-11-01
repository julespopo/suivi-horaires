import fs from 'node:fs';
import assert from 'node:assert/strict';
// Install pinned PGlite outside the repository; set PGLITE_MODULE to its entrypoint.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(fs.readFileSync('supabase/tests/rtt-fixture.sql','utf8'));
const migration=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_rtt_half_days.sql'));
await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
let count=0;
async function test(name,fn){await db.exec('BEGIN');try{await fn();console.log('✓ '+name);count++}finally{await db.exec('ROLLBACK')}}
const emp='00000000-0000-0000-0000-000000000001',employer='00000000-0000-0000-0000-000000000004';
const date='2026-11-02';
const query=(sql,params=[])=>db.query(sql,params);
const create=(type,token='owner',start=date,end=date)=>query('select public.api_owner_create_leave_typed($1,$2,$3,$4,\'\',$5) id',[token,emp,start,end,type]);
const request=(type,event='event-a',token='employee-a')=>query("select public.api_employee_request_leave_typed_offline($1,$2,$2,'',$3,$4) id",[token,date,event,type]);
const work=(start,end)=>query("insert into public.work_segments(employee_id,work_date,employer_id,start_time,end_time) values($1,$2,$3,$4,$5)",[emp,date,employer,start,end]);
async function rejects(fn,pattern){await db.exec('SAVEPOINT expected_error');await assert.rejects(fn,pattern);await db.exec('ROLLBACK TO SAVEPOINT expected_error')}
await test('Migration : contraintes et helpers internes fermés',async()=>{
 const r=await query("select has_function_privilege('anon','public._rtt_guard_work()','EXECUTE') allowed");assert.equal(r.rows[0].allowed,false);
 assert.equal((await query("select has_function_privilege('anon','public.api_owner_create_leave_typed(text,uuid,date,date,text,text)','EXECUTE') allowed")).rows[0].allowed,true);
});
await test('Session absente et rôle salarié refusés au pilotage',async()=>{await rejects(()=>create('rtt',''),/unauthorized/);await rejects(()=>create('rtt','employee-a'),/unauthorized/);await rejects(()=>request('rtt','x',''),/unauthorized/)});
await test('RTT journée bloque les heures et les corrections',async()=>{await create('rtt');await rejects(()=>work('07:30','12:00'),/validated_leave/);await rejects(()=>query("insert into public.work_entries(employee_id,work_date,status,arrival,departure) values($1,$2,'worked','14:00','18:00')",[emp,date]),/validated_leave/)});
await test('RTT matin autorise 14h–18h, refuse la matinée',async()=>{await create('rtt_morning');await work('14:00','18:00');await rejects(()=>work('07:30','12:00'),/validated_leave/);await rejects(()=>work('12:59','14:00'),/validated_leave/)});
await test('RTT après-midi autorise une fin à 13h, refuse 13h01',async()=>{await create('rtt_afternoon');await work('07:30',null);await query("update public.work_segments set end_time='13:00'");await rejects(()=>query("update public.work_segments set end_time='13:01'"),/validated_leave/);await rejects(()=>work('14:00','18:00'),/validated_leave/)});
await test('Demi-journée limitée à une date, type invalide rejeté',async()=>{await rejects(()=>create('rtt_morning','owner',date,'2026-11-03'),/invalid_leave_dates|half_day/);await rejects(()=>create('invalid'),/invalid_leave_dates|rtt_type/)});
await test('Demande en attente, validation puis refus',async()=>{const r=await request('rtt_morning');const id=r.rows[0].id;assert.equal((await query('select status from public.leave_requests')).rows[0].status,'pending');await work('14:00','18:00');await query("select public.api_owner_review_leave('owner',$1,'validated')",[id]);await rejects(()=>work('07:30','12:00'),/validated_leave/);await query("select public.api_owner_review_leave('owner',$1,'rejected')",[id]);await work('07:30','12:00')});
await test('Validation refuse les heures ajoutées après la demande',async()=>{const id=(await request('rtt_morning')).rows[0].id;await work('07:30','12:00');await rejects(()=>query("select public.api_owner_review_leave('owner',$1,'validated')",[id]),/leave_has_work/)});
await test('Création autorise seulement les heures compatibles',async()=>{await work('14:00','18:00');await rejects(()=>create('rtt_afternoon'),/leave_has_work/);await create('rtt_morning')});
await test('Chevauchements de demandes refusés',async()=>{await request('rtt');await rejects(()=>request('paid_leave','event-b'),/leave_overlap/)});
await test('Hors ligne : même événement donne une seule demande',async()=>{const a=(await request('rtt_morning')).rows[0].id;const b=(await request('rtt_morning')).rows[0].id;assert.equal(a,b);assert.equal((await query('select count(*)::int n from public.leave_requests')).rows[0].n,1)});
await test('Hors ligne : événement isolé par salarié',async()=>{await request('rtt_morning');await request('rtt','event-a','employee-b');assert.equal((await query('select count(*)::int n from public.leave_requests')).rows[0].n,2)});
await test('Pause automatique nulle sur RTT, pause manuelle conservée',async()=>{await create('rtt_morning');await work('14:00','18:00');await query('select public._v2_sync_work_entry($1,$2)',[emp,date]);assert.equal((await query('select pause_minutes from public.work_entries')).rows[0].pause_minutes,0);await query("update public.work_entries set pause_mode='manual',pause_minutes=15");await query('select public._v2_sync_work_entry($1,$2)',[emp,date]);assert.equal((await query('select pause_minutes from public.work_entries')).rows[0].pause_minutes,15)});
await test('RTT ajouté après la saisie remet uniquement la pause automatique à zéro',async()=>{await work('14:00','18:00');await query('select public._v2_sync_work_entry($1,$2)',[emp,date]);assert.equal((await query('select pause_minutes from public.work_entries')).rows[0].pause_minutes,90);await create('rtt_morning');assert.equal((await query('select pause_minutes from public.work_entries')).rows[0].pause_minutes,0)});
await test('RPC de début conserve les autorisations et accepte la moitié travaillée',async()=>{await create('rtt_morning');await query("select public._v2_employee_start_segment_impl('employee-a',$1,$2,'14:00','manual')",[date,employer]);await rejects(()=>query("select public._v2_employee_start_segment_impl('employee-b',$1,$2,'14:00','manual')",[date,'00000000-0000-0000-0000-000000000099']),/employer_not_allowed/)});
await test('Congé journée et pause habituelle restent compatibles',async()=>{await work('07:30','18:00');await query('select public._v2_sync_work_entry($1,$2)',[emp,date]);assert.equal((await query('select pause_minutes from public.work_entries')).rows[0].pause_minutes,90);await rejects(()=>create('paid_leave'),/leave_has_work/)});
await test('Rappels : RTT matin sans heures reste à compléter',async()=>{await create('rtt_morning');const r=await query('select public.system_get_reminder_batch($1,true) result',[date]);assert.equal(r.rows[0].result.some(e=>e.employee_id===emp),true)});
await test('Rappels : RTT journée dispense de saisie',async()=>{await create('rtt');const r=await query('select public.system_get_reminder_batch($1,true) result',[date]);assert.equal(r.rows[0].result.some(e=>e.employee_id===emp),false)});
console.log(`${count} tests SQL réussis.`);await db.close();

import fs from 'node:fs';
import assert from 'node:assert/strict';
import '../supabase/functions/shared/french-holidays.js';
import {ownerSummaryState} from '../supabase/functions/send-reminders/summary-state.mjs';
import {PGlite} from '@electric-sql/pglite';
// Snapshot downloaded from https://calendrier.api.gouv.fr/jours-feries/metropole/{year}.json
const official=JSON.parse(fs.readFileSync('scripts/fixtures/french-holidays-official.json','utf8'));
const db=new PGlite();
try{
 await db.exec(fs.readFileSync('supabase/tests/rtt-fixture.sql','utf8'));
 await db.exec('create role service_role');
 for(const suffix of ['_rtt_half_days.sql','_french_public_holidays.sql']){
  const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));
  await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 }
 for(const [year,dates] of Object.entries(official)){
  assert.deepEqual(Object.keys(FrenchHolidays.forYear(Number(year))).sort(),Object.keys(dates).sort());
  const {rows}=await db.query("select d::date::text date,public._is_french_public_holiday(d::date) holiday from generate_series($1::date,$2::date,interval '1 day') d",[year+'-01-01',year+'-12-31']);
  for(const row of rows)assert.equal(row.holiday,!!dates[row.date],row.date);
 }
 console.log('✓ Dates JS et SQL conformes au calendrier officiel 2026–2030 (tous les jours, dont années bissextiles)');
 const emp='00000000-0000-0000-0000-000000000001',date='2026-11-11';
 const batch=async()=> (await db.query('select public.system_get_reminder_batch($1,true) data',[date])).rows[0].data;
 assert.equal((await batch()).length,0);
 await db.query('insert into public.work_schedule values($1,$2,true)',[emp,date]);
 assert.equal((await batch()).length,1);
 await db.exec('delete from public.work_schedule');
 await db.query("insert into public.work_segments(employee_id,work_date,employer_id,start_time) values($1,$2,'00000000-0000-0000-0000-000000000004','08:00')",[emp,date]);
 assert.equal((await batch()).length,1);
 await db.query("insert into public.work_entries(employee_id,work_date,status,arrival,departure) values($1,$2,'worked','08:00','12:00')",[emp,date]);
 assert.equal((await batch()).length,0);
 assert.equal((await db.query("select has_function_privilege('anon','public._is_french_public_holiday(date)','execute') allowed")).rows[0].allowed,false);
 assert.equal((await db.query("select has_function_privilege('anon','public.system_get_reminder_batch(date,boolean)','execute') allowed")).rows[0].allowed,false);
 const fixture={employees:[{id:emp,name:'Fictif'}]};
 assert.equal(ownerSummaryState(fixture,date).planned.length,0);
 assert.equal(ownerSummaryState({...fixture,schedule:[{employee_id:emp,is_working:true}]},date).planned.length,1);
 assert.equal(ownerSummaryState({...fixture,segments:[{employee_id:emp}]},date).planned.length,1);
 assert.equal(ownerSummaryState({...fixture,entries:[{employee_id:emp,status:'worked',arrival:'08:00',departure:'12:00'}]},date).completed,1);
 console.log('✓ Rappels salariés et synthèse : férié exclu, planning explicite et travail réel conservés, accès privés');
}finally{await db.close()}

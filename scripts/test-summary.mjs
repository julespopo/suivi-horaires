import assert from 'node:assert/strict';
import {ownerSummaryState} from '../supabase/functions/send-reminders/summary-state.mjs';
const employee={id:'fixture',name:'Fictif'},date='2026-11-02';
const fixture={employees:[employee],schedule:[],entries:[],segments:[],leaves:[]};
const leave=type=>({employee_id:employee.id,start_date:date,end_date:date,status:'validated',leave_type:type});
for(const type of ['paid_leave','rtt'])assert.equal(ownerSummaryState({...fixture,leaves:[leave(type)]},date).planned.length,0);
console.log('✓ Congé et RTT journée exclus de la synthèse');
for(const type of ['rtt_morning','rtt_afternoon']){
 const state=ownerSummaryState({...fixture,leaves:[leave(type)]},date);
 assert.equal(state.planned.length,1);assert.deepEqual(state.incompleteNames,['Fictif']);
 const complete=ownerSummaryState({...fixture,leaves:[leave(type)],entries:[{employee_id:employee.id,status:'worked',arrival:'14:00',departure:'18:00'}]},date);
 assert.equal(complete.completed,1);
}
console.log('✓ Demi-RTT : travail attendu et journée complète comptée');
assert.equal(ownerSummaryState({...fixture,entries:[{employee_id:employee.id,status:'off'}]},date).planned.length,0);
assert.equal(ownerSummaryState(fixture,'2026-11-08').planned.length,0);
assert.equal(ownerSummaryState({...fixture,segments:[{employee_id:employee.id}]},'2026-11-08').planned.length,1);
console.log('✓ Jours non travaillés, dimanche et travail hors planning');

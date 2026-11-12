import "../shared/french-holidays.js";
// Pure shared logic: both production notifications and regression tests use this function.
export function ownerSummaryState({employees=[],schedule=[],entries=[],segments=[],leaves=[]},workDate){
  const plannedDays=new Map(schedule.map(r=>[r.employee_id,!!r.is_working]));
  const days=new Map(entries.map(r=>[r.employee_id,r]));
  const actualWorkers=new Set(segments.map(r=>r.employee_id));
  const fullDayLeave=new Set(leaves.filter(r=>r.status==='validated'&&r.start_date<=workDate&&r.end_date>=workDate&&!['rtt_morning','rtt_afternoon'].includes(r.leave_type)).map(r=>r.employee_id));
  const weekday=new Date(`${workDate}T12:00:00Z`).getUTCDay();
  const normallyWorking=weekday>=1&&weekday<=5&&!globalThis.FrenchHolidays.name(workDate);
  const planned=employees.filter(employee=>{
    if(fullDayLeave.has(employee.id))return false;
    const entry=days.get(employee.id);
    if(entry?.status==='off')return false;
    const scheduled=plannedDays.has(employee.id)?plannedDays.get(employee.id):normallyWorking;
    return scheduled||actualWorkers.has(employee.id)||entry?.status==='worked';
  });
  let completed=0;const incompleteNames=[];
  for(const employee of planned){
    const entry=days.get(employee.id);
    if(entry?.arrival&&entry?.departure)completed++;
    else incompleteNames.push(employee.name);
  }
  return {planned,completed,incompleteNames};
}

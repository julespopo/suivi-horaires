-- Defaults only: no employee, schedule, session, time or leave rows are changed.
create or replace function public._is_french_public_holiday(p_date date)
returns boolean language plpgsql immutable strict security invoker set search_path = ''
as $holiday$
declare
 y integer := extract(year from p_date)::integer;
 a integer; b integer; c integer; d integer; e integer; f integer; g integer;
 h integer; i integer; k integer; l integer; m integer; n integer; easter date;
begin
 if to_char(p_date,'MM-DD') in ('01-01','05-01','05-08','07-14','08-15','11-01','11-11','12-25') then return true; end if;
 a:=y%19; b:=y/100; c:=y%100; d:=b/4; e:=b%4;
 f:=(b+8)/25; g:=(b-f+1)/3; h:=(19*a+b-d-g+15)%30;
 i:=c/4; k:=c%4; l:=(32+2*e+2*i-h-k)%7; m:=(a+11*h+22*l)/451;
 n:=h+l-7*m+114; easter:=make_date(y,n/31,n%31+1);
 return p_date in (easter+1,easter+39,easter+50);
end;
$holiday$;
revoke all on function public._is_french_public_holiday(date) from public, anon, authenticated;

create or replace function public.system_get_reminder_batch(p_work_date date,p_ignore_log boolean)
returns jsonb language sql security definer set search_path = ''
as $reminder$

with employee_state as (
  select
    e.id as employee_id,
    e.name,
    coalesce(ws.is_working,(extract(isodow from p_work_date)::int between 1 and 5 and not public._is_french_public_holiday(p_work_date))) as scheduled_working,
    we.status,
    we.arrival,
    we.departure,
    exists(
      select 1 from public.work_segments sg
      where sg.employee_id=e.id and sg.work_date=p_work_date
    ) as has_segments,
    exists(
      select 1 from public.leave_requests lr
      where lr.employee_id=e.id and lr.status='validated' AND lr.leave_type NOT IN ('rtt_morning','rtt_afternoon')
        and p_work_date between lr.start_date and lr.end_date
    ) as on_leave
  from public.employees e
  left join public.work_schedule ws on ws.employee_id=e.id and ws.work_date=p_work_date
  left join public.work_entries we on we.employee_id=e.id and we.work_date=p_work_date
  where e.active=true
), targets as (
  select es.employee_id,es.name
  from employee_state es
  where es.on_leave=false
    and (es.scheduled_working=true or es.has_segments=true or coalesce(es.status,'')='worked')
    and coalesce(es.status,'')<>'off'
    and not (es.arrival is not null and es.departure is not null)
    and (
      coalesce(p_ignore_log,false)=true
      or not exists(
        select 1 from public.reminder_log rl
        where rl.employee_id=es.employee_id and rl.work_date=p_work_date
          and rl.reminder_type='missing_hours'
      )
    )
), grouped as (
  select
    t.employee_id,t.name,
    coalesce(jsonb_agg(jsonb_build_object(
      'endpoint',ps.endpoint,
      'p256dh',ps.p256dh,
      'auth',ps.auth,
      'launch_url',ps.launch_url
    )) filter(where ps.id is not null),'[]'::jsonb) as subscriptions
  from targets t
  left join public.push_subscriptions ps on ps.employee_id=t.employee_id and ps.active=true
  group by t.employee_id,t.name
)
select coalesce(jsonb_agg(jsonb_build_object(
  'employee_id',employee_id,
  'name',name,
  'subscriptions',subscriptions
) order by name),'[]'::jsonb)
from grouped;

$reminder$;
-- Reminder data remains restricted to the existing privileged notification service.
revoke all on function public.system_get_reminder_batch(date,boolean) from public,anon,authenticated;
grant execute on function public.system_get_reminder_batch(date,boolean) to service_role;

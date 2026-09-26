-- ============================================================
-- SUIVI HORAIRES — V1.9 RAPPELS PUSH
-- À exécuter une fois dans Supabase > SQL Editor.
-- ============================================================

begin;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);

create table if not exists public.reminder_log (
  id bigint generated always as identity primary key,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  reminder_type text not null default 'missing_hours',
  sent_at timestamptz not null default now(),
  unique(employee_id, work_date, reminder_type)
);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_log enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.reminder_log from anon, authenticated;

create or replace function public.api_employee_save_push_subscription(
  p_session_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_emp_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  if coalesce(p_endpoint,'')='' or coalesce(p_p256dh,'')='' or coalesce(p_auth,'')='' then
    raise exception 'invalid_push_subscription';
  end if;

  insert into public.push_subscriptions(employee_id,endpoint,p256dh,auth,user_agent,active,updated_at)
  values(v_emp_id,p_endpoint,p_p256dh,p_auth,coalesce(p_user_agent,''),true,now())
  on conflict(endpoint) do update set
    employee_id=excluded.employee_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    user_agent=excluded.user_agent,
    active=true,
    updated_at=now();

  return true;
end;
$function$;

create or replace function public.api_employee_remove_push_subscription(
  p_session_token text,
  p_endpoint text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_emp_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  update public.push_subscriptions
  set active=false,updated_at=now()
  where employee_id=v_emp_id and endpoint=p_endpoint;
  return true;
end;
$function$;

-- Fonction interne appelée uniquement par l'Edge Function avec la service role.
-- Elle applique la règle métier : rappel uniquement si le jour est travaillé
-- et si la journée n'est pas déjà complète / non travaillée.
create or replace function public.system_get_reminder_batch(p_work_date date)
returns jsonb
language sql
security definer
set search_path = public
as $function$
with employee_state as (
  select
    e.id as employee_id,
    e.name,
    coalesce(ws.is_working, extract(isodow from p_work_date)::int between 1 and 5) as is_working,
    we.status,
    we.arrival,
    we.departure
  from public.employees e
  left join public.work_schedule ws
    on ws.employee_id=e.id and ws.work_date=p_work_date
  left join public.work_entries we
    on we.employee_id=e.id and we.work_date=p_work_date
  where e.active=true
), targets as (
  select es.employee_id, es.name
  from employee_state es
  where es.is_working=true
    and not (coalesce(es.status,'')='off')
    and not (es.arrival is not null and es.departure is not null)
    and not exists (
      select 1 from public.reminder_log rl
      where rl.employee_id=es.employee_id
        and rl.work_date=p_work_date
        and rl.reminder_type='missing_hours'
    )
), grouped as (
  select
    t.employee_id,
    t.name,
    coalesce(jsonb_agg(jsonb_build_object(
      'endpoint',ps.endpoint,
      'p256dh',ps.p256dh,
      'auth',ps.auth
    )) filter (where ps.id is not null),'[]'::jsonb) as subscriptions
  from targets t
  left join public.push_subscriptions ps
    on ps.employee_id=t.employee_id and ps.active=true
  group by t.employee_id,t.name
)
select coalesce(jsonb_agg(jsonb_build_object(
  'employee_id',employee_id,
  'name',name,
  'subscriptions',subscriptions
) order by name),'[]'::jsonb)
from grouped;
$function$;

create or replace function public.system_record_reminder_success(
  p_employee_id uuid,
  p_work_date date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.reminder_log(employee_id,work_date,reminder_type,sent_at)
  values(p_employee_id,p_work_date,'missing_hours',now())
  on conflict(employee_id,work_date,reminder_type) do nothing;
  return true;
end;
$function$;

create or replace function public.system_mark_push_success(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.push_subscriptions
  set last_success_at=now(),active=true,updated_at=now()
  where endpoint=p_endpoint;
  return true;
end;
$function$;

create or replace function public.system_deactivate_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
begin
  update public.push_subscriptions
  set active=false,updated_at=now()
  where endpoint=p_endpoint;
  return true;
end;
$function$;

revoke all on function public.api_employee_save_push_subscription(text,text,text,text,text) from public;
revoke all on function public.api_employee_remove_push_subscription(text,text) from public;
revoke all on function public.system_get_reminder_batch(date) from public, anon, authenticated;
revoke all on function public.system_record_reminder_success(uuid,date) from public, anon, authenticated;
revoke all on function public.system_mark_push_success(text) from public, anon, authenticated;
revoke all on function public.system_deactivate_push_subscription(text) from public, anon, authenticated;

grant execute on function public.api_employee_save_push_subscription(text,text,text,text,text) to anon, authenticated;
grant execute on function public.api_employee_remove_push_subscription(text,text) to anon, authenticated;
grant execute on function public.system_get_reminder_batch(date) to service_role;
grant execute on function public.system_record_reminder_success(uuid,date) to service_role;
grant execute on function public.system_mark_push_success(text) to service_role;
grant execute on function public.system_deactivate_push_subscription(text) to service_role;

commit;
notify pgrst, 'reload schema';

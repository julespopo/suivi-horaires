-- RTT uses leave_type so existing read RPCs and old clients remain compatible.
-- Half-days are single dates, split at 13:00 Europe/Paris local work time.
-- No table grants or RLS policies are relaxed by this migration.
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_rtt_type_ck
 CHECK (leave_type IN ('paid_leave','rtt','rtt_morning','rtt_afternoon')) NOT VALID;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_half_day_ck
 CHECK (leave_type NOT IN ('rtt_morning','rtt_afternoon') OR start_date=end_date) NOT VALID;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT leave_requests_rtt_type_ck;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT leave_requests_half_day_ck;

CREATE FUNCTION public._rtt_conflicts(p_type text,p_start time,p_end time)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_type
 WHEN 'rtt_morning' THEN p_start IS NULL OR p_start < time '13:00'
 WHEN 'rtt_afternoon' THEN p_start IS NULL OR p_start >= time '13:00' OR p_end > time '13:00'
 ELSE true END;
$$;
REVOKE ALL ON FUNCTION public._rtt_conflicts(text,time,time) FROM PUBLIC,anon,authenticated;

-- Both sides take the same employee lock: concurrent approval/work writes serialize.
-- Trigger functions are private implementation details, never callable as RPCs.
CREATE FUNCTION public._rtt_guard_leave() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 IF NEW.status NOT IN ('pending','validated') THEN RETURN NEW; END IF;
 IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.end_date<NEW.start_date
   OR NEW.leave_type NOT IN ('paid_leave','rtt','rtt_morning','rtt_afternoon')
   OR (NEW.leave_type IN ('rtt_morning','rtt_afternoon') AND NEW.start_date<>NEW.end_date)
 THEN RAISE EXCEPTION 'invalid_leave_dates'; END IF;
 IF EXISTS(SELECT 1 FROM public.leave_requests l WHERE l.employee_id=NEW.employee_id
   AND l.id<>NEW.id AND l.status IN ('pending','validated')
   AND l.start_date<=NEW.end_date AND l.end_date>=NEW.start_date)
 THEN RAISE EXCEPTION 'leave_overlap'; END IF;
 IF EXISTS(SELECT 1 FROM public.work_segments s WHERE s.employee_id=NEW.employee_id
   AND s.work_date BETWEEN NEW.start_date AND NEW.end_date
   AND public._rtt_conflicts(NEW.leave_type,s.start_time,s.end_time))
 OR EXISTS(SELECT 1 FROM public.work_entries e WHERE e.employee_id=NEW.employee_id
   AND e.work_date BETWEEN NEW.start_date AND NEW.end_date AND e.status='worked'
   AND (e.arrival IS NOT NULL OR e.departure IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM public.work_segments s WHERE s.employee_id=e.employee_id AND s.work_date=e.work_date)
   AND public._rtt_conflicts(NEW.leave_type,e.arrival,e.departure))
 THEN RAISE EXCEPTION 'leave_has_work'; END IF;
 IF NEW.status='validated' AND NEW.leave_type IN ('rtt_morning','rtt_afternoon') THEN
   UPDATE public.work_entries SET pause_minutes=0,updated_at=now()
   WHERE employee_id=NEW.employee_id AND work_date=NEW.start_date AND pause_mode='auto';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._rtt_guard_leave() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rtt_guard_leave BEFORE INSERT OR UPDATE ON public.leave_requests
 FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_leave();

CREATE FUNCTION public._rtt_guard_work() RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path='' AS $$
DECLARE v_start time; v_end time;
BEGIN
 PERFORM 1 FROM public.employees WHERE id=NEW.employee_id FOR UPDATE;
 IF TG_TABLE_NAME='work_segments' THEN
   v_start:=NEW.start_time; v_end:=NEW.end_time;
 ELSE
   IF NEW.status='off' OR (NEW.arrival IS NULL AND NEW.departure IS NULL) THEN RETURN NEW; END IF;
   v_start:=NEW.arrival; v_end:=NEW.departure;
 END IF;
 IF EXISTS(SELECT 1 FROM public.leave_requests l WHERE l.employee_id=NEW.employee_id
   AND l.status='validated' AND NEW.work_date BETWEEN l.start_date AND l.end_date
   AND public._rtt_conflicts(l.leave_type,v_start,v_end))
 THEN RAISE EXCEPTION 'validated_leave'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._rtt_guard_work() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rtt_guard_segments BEFORE INSERT OR UPDATE ON public.work_segments
 FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_work();
CREATE TRIGGER rtt_guard_entries BEFORE INSERT OR UPDATE ON public.work_entries
 FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_work();

CREATE OR REPLACE FUNCTION public.api_employee_request_leave_typed(p_session_token text, p_start_date date, p_end_date date, p_note text, p_leave_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_leave_dates';
  end if;

  insert into public.leave_requests(
    employee_id,start_date,end_date,leave_type,status,note,requested_by,updated_at
  ) values(
    v_emp_id,p_start_date,p_end_date,p_leave_type,'pending',coalesce(p_note,''),'employee',now()
  ) returning id into v_id;

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'request_leave',p_start_date,jsonb_build_object('leave_id',v_id,'end_date',p_end_date,'leave_type',p_leave_type));

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_employee_request_leave_typed(text,date,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave_typed(text,date,date,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.api_owner_create_leave_typed(p_session_token text, p_employee_id uuid, p_start_date date, p_end_date date, p_note text, p_leave_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_id uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_leave_dates';
  end if;

  insert into public.leave_requests(
    employee_id,start_date,end_date,leave_type,status,note,requested_by,
    reviewed_at,reviewed_by,updated_at
  ) values(
    p_employee_id,p_start_date,p_end_date,p_leave_type,'validated',coalesce(p_note,''),'owner',
    now(),'owner',now()
  ) returning id into v_id;

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','create_leave',p_start_date,jsonb_build_object('leave_id',v_id,'end_date',p_end_date,'leave_type',p_leave_type));

  return v_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.api_owner_create_leave_typed(text,uuid,date,date,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_create_leave_typed(text,uuid,date,date,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.api_owner_review_leave(p_session_token text, p_leave_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_emp uuid;
  v_start date;
  v_end date;
begin
  v_owner := public._assert_owner(p_session_token);
  if p_status not in ('validated','rejected') then raise exception 'invalid_leave_status'; end if;

  select employee_id,start_date,end_date
  into v_emp,v_start,v_end
  from public.leave_requests
  where id=p_leave_id;

  if v_emp is null then raise exception 'leave_not_found'; end if;

  update public.leave_requests
  set status=p_status, reviewed_at=now(), reviewed_by='owner', updated_at=now()
  where id=p_leave_id;

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(v_emp,'owner','review_leave',v_start,jsonb_build_object('leave_id',p_leave_id,'status',p_status));

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public._v2_employee_start_segment_impl(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text, p_mode text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_id uuid;
  v_start time;
  v_open_date date;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  v_start:=nullif(p_start_time,'')::time;
  if v_start is null then raise exception 'invalid_start_time'; end if;
  if p_mode not in ('now','manual') then raise exception 'invalid_entry_mode'; end if;

  if not exists(
    select 1 from public.employee_employers ee
    join public.employers e on e.id=ee.employer_id
    where ee.employee_id=v_emp_id and ee.employer_id=p_employer_id
      and ee.active=true and e.active=true
  ) then raise exception 'employer_not_allowed'; end if;

  select work_date into v_open_date
  from public.work_segments
  where employee_id=v_emp_id and end_time is null
  limit 1;
  if found then
    if v_open_date<>p_work_date then raise exception 'stale_open_segment'; end if;
    raise exception 'segment_already_open';
  end if;

  if exists(
    select 1 from public.leave_requests
    where employee_id=v_emp_id and status='validated'
      and leave_type NOT IN ('rtt_morning','rtt_afternoon')
      and p_work_date between start_date and end_date
  ) then raise exception 'validated_leave'; end if;

  -- Si le début saisi tombe dans un créneau déjà terminé, rejet immédiat.
  if exists(
    select 1 from public.work_segments
    where employee_id=v_emp_id and work_date=p_work_date and end_time is not null
      and v_start>=start_time and v_start<end_time
  ) then raise exception 'overlapping_segments'; end if;

  insert into public.work_segments(employee_id,work_date,employer_id,start_time,end_time,source,updated_at)
  values(v_emp_id,p_work_date,p_employer_id,v_start,null,p_mode,now())
  returning id into v_id;

  perform public._v2_sync_work_entry(v_emp_id,p_work_date,p_mode,null);

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'v2_start_segment',p_work_date,
    jsonb_build_object('employer_id',p_employer_id,'segment_id',v_id,'mode',p_mode));
  return v_id;
end;
$function$;

CREATE FUNCTION public.api_employee_request_leave_typed_offline(
 p_session_token text,p_start_date date,p_end_date date,p_note text,p_client_event_id text,p_leave_type text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_emp uuid; v_existing jsonb; v_id uuid;
BEGIN
 v_emp:=public._session_employee_id(p_session_token);
 IF coalesce(btrim(p_client_event_id),'')='' THEN RAISE EXCEPTION 'invalid_client_event_id'; END IF;
 PERFORM 1 FROM public.employees WHERE id=v_emp FOR UPDATE;
 SELECT result INTO v_existing FROM public.employee_offline_events
 WHERE employee_id=v_emp AND client_event_id=p_client_event_id;
 IF FOUND THEN
   IF NOT (v_existing ? 'leave_id') THEN RAISE EXCEPTION 'invalid_client_event_id'; END IF;
   RETURN (v_existing->>'leave_id')::uuid;
 END IF;
 v_id:=public.api_employee_request_leave_typed(p_session_token,p_start_date,p_end_date,p_note,p_leave_type);
 INSERT INTO public.employee_offline_events(employee_id,client_event_id,event_type,result)
 VALUES(v_emp,p_client_event_id,'leave_request',jsonb_build_object('leave_id',v_id));
 RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.api_employee_request_leave_typed_offline(text,date,date,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave_typed_offline(text,date,date,text,text,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.system_get_reminder_batch(p_work_date date, p_ignore_log boolean)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with employee_state as (
  select
    e.id as employee_id,
    e.name,
    coalesce(ws.is_working,extract(isodow from p_work_date)::int between 1 and 5) as scheduled_working,
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
$function$;

CREATE OR REPLACE FUNCTION public._v2_sync_work_entry(p_employee_id uuid, p_work_date date, p_arrival_mode text DEFAULT NULL::text, p_departure_mode text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
  v_open_count integer;
  v_first time;
  v_last time;
  v_pause_mode text;
  v_pause integer;
  v_existing_arrival_mode text;
  v_existing_departure_mode text;
  v_gross integer := 0;
begin
  select count(*),
         count(*) filter (where end_time is null),
         min(start_time),
         max(end_time),
         coalesce(sum(
           case when end_time is null then 0
                else extract(epoch from (end_time-start_time))/60 end
         ),0)::integer
  into v_count, v_open_count, v_first, v_last, v_gross
  from public.work_segments
  where employee_id=p_employee_id and work_date=p_work_date;

  if v_count=0 then return true; end if;
  if v_open_count>0 then v_last:=null; end if;

  select pause_mode,pause_minutes,arrival_mode,departure_mode
  into v_pause_mode,v_pause,v_existing_arrival_mode,v_existing_departure_mode
  from public.work_entries
  where employee_id=p_employee_id and work_date=p_work_date;

  if not found then
    v_pause_mode:='auto';
    v_pause:=case
      when v_count>1 OR EXISTS (SELECT 1 FROM public.leave_requests l WHERE l.employee_id=p_employee_id AND l.status='validated' AND p_work_date BETWEEN l.start_date AND l.end_date AND l.leave_type IN ('rtt_morning','rtt_afternoon')) then 0
      when v_open_count>0 then 90
      when v_gross>=90 then 90
      else 0
    end;
    v_existing_arrival_mode:='';
    v_existing_departure_mode:='';
  elsif coalesce(v_pause_mode,'manual')='auto' then
    v_pause:=case
      when v_count>1 OR EXISTS (SELECT 1 FROM public.leave_requests l WHERE l.employee_id=p_employee_id AND l.status='validated' AND p_work_date BETWEEN l.start_date AND l.end_date AND l.leave_type IN ('rtt_morning','rtt_afternoon')) then 0
      when v_open_count>0 then 90
      when v_gross>=90 then 90
      else 0
    end;
  end if;

  insert into public.work_entries(
    employee_id,work_date,status,arrival,departure,pause_minutes,pause_mode,comment,
    arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
  ) values(
    p_employee_id,p_work_date,'worked',v_first,v_last,
    greatest(coalesce(v_pause,0),0),coalesce(v_pause_mode,'auto'),'',
    coalesce(nullif(p_arrival_mode,''),v_existing_arrival_mode,''),
    case when v_last is null then '' else coalesce(nullif(p_departure_mode,''),v_existing_departure_mode,'') end,
    case when v_open_count=0 then 'pending' else '' end,
    null,'',now()
  )
  on conflict(employee_id,work_date) do update set
    status='worked',arrival=excluded.arrival,departure=excluded.departure,
    pause_minutes=excluded.pause_minutes,pause_mode=excluded.pause_mode,
    arrival_mode=excluded.arrival_mode,departure_mode=excluded.departure_mode,
    validation_status=excluded.validation_status,
    validated_at=null,validated_by='',updated_at=now();

  return true;
end;
$function$;

NOTIFY pgrst, 'reload schema';

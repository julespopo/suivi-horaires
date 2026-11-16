-- =====================================================================
-- Suivi horaires — structure complète de la base Supabase (sans données)
-- Instantané de production du 16/11/2026, projet « suivi-horaires ».
--
-- Ce fichier permet de reconstruire la base à l'identique sur un projet
-- Supabase vide : tables, contraintes, index, fonctions RPC, déclencheurs,
-- droits d'accès et tâche planifiée des rappels.
--
-- Il ne contient AUCUNE donnée : ni salariés, ni horaires, ni PIN, ni lien
-- privé, ni secret. Les secrets se recréent dans le coffre-fort (voir la
-- fin du fichier) et les données se restaurent depuis une sauvegarde.
--
-- Non repris volontairement : le schéma launch_backup_20261102 (copie de
-- données d'avant le lancement du 02/11/2026).
--
-- Les 67 fonctions sont la copie exacte de pg_get_functiondef() en
-- production (contrôle md5 fonction par fonction le 16/11/2026).
-- =====================================================================

SET check_function_bodies = false;

-- [supabase-only:start] Extensions fournies par Supabase
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
-- [supabase-only:end]

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

CREATE TABLE public.app_sessions (
  session_hash text NOT NULL,
  role text NOT NULL,
  employee_id uuid,
  owner_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '3650 days'::interval) NOT NULL
);
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (session_hash);
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_actor_ck CHECK ((((role = 'employee'::text) AND (employee_id IS NOT NULL) AND (owner_id IS NULL)) OR ((role = 'owner'::text) AND (owner_id IS NOT NULL) AND (employee_id IS NULL))));
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_role_check CHECK ((role = ANY (ARRAY['employee'::text, 'owner'::text])));
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  employee_id uuid,
  actor_role text NOT NULL,
  actor_employee_id uuid,
  action text NOT NULL,
  work_date date,
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_role_check CHECK ((actor_role = ANY (ARRAY['employee'::text, 'owner'::text, 'system'::text])));
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_employers (
  employee_id uuid NOT NULL,
  employer_id uuid NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.employee_employers ADD CONSTRAINT employee_employers_pkey PRIMARY KEY (employee_id, employer_id);
ALTER TABLE public.employee_employers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_offline_events (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  client_event_id text NOT NULL,
  event_type text NOT NULL,
  result jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.employee_offline_events ADD CONSTRAINT employee_offline_events_pkey PRIMARY KEY (id);
ALTER TABLE public.employee_offline_events ADD CONSTRAINT employee_offline_events_employee_id_client_event_id_key UNIQUE (employee_id, client_event_id);
ALTER TABLE public.employee_offline_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employees (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  link_token text NOT NULL,
  pin_hash text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  weekly_objective_minutes integer DEFAULT 2100 NOT NULL,
  overtime_threshold_minutes integer DEFAULT 2100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_link_token_key UNIQUE (link_token);
ALTER TABLE public.employees ADD CONSTRAINT employees_overtime_threshold_minutes_check CHECK ((overtime_threshold_minutes >= 0));
ALTER TABLE public.employees ADD CONSTRAINT employees_weekly_objective_minutes_check CHECK ((weekly_objective_minutes >= 0));
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employers (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  name text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.employers ADD CONSTRAINT employers_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX employers_name_normalized_uq ON public.employers USING btree (lower(btrim(name)));
ALTER TABLE public.employers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leave_requests (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type text DEFAULT 'paid_leave'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  requested_by text DEFAULT 'employee'::text NOT NULL,
  reviewed_at timestamp with time zone,
  reviewed_by text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_actor_ck CHECK ((requested_by = ANY (ARRAY['employee'::text, 'owner'::text])));
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_dates_ck CHECK ((end_date >= start_date));
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_half_day_ck CHECK (((leave_type <> ALL (ARRAY['rtt_morning'::text, 'rtt_afternoon'::text])) OR (start_date = end_date)));
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_launch_date_ck CHECK ((start_date >= '2026-11-02'::date));
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_rtt_type_ck CHECK ((leave_type = ANY (ARRAY['paid_leave'::text, 'rtt'::text, 'rtt_morning'::text, 'rtt_afternoon'::text])));
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_ck CHECK ((status = ANY (ARRAY['pending'::text, 'validated'::text, 'rejected'::text])));
CREATE INDEX leave_requests_employee_dates_idx ON public.leave_requests USING btree (employee_id, start_date, end_date);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.login_rate_limits (
  subject_kind text NOT NULL,
  subject_hash text NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  window_started_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone DEFAULT clock_timestamp() NOT NULL
);
ALTER TABLE public.login_rate_limits ADD CONSTRAINT login_rate_limits_pkey PRIMARY KEY (subject_kind, subject_hash);
ALTER TABLE public.login_rate_limits ADD CONSTRAINT login_rate_limits_failed_count_check CHECK ((failed_count >= 0));
ALTER TABLE public.login_rate_limits ADD CONSTRAINT login_rate_limits_subject_kind_check CHECK ((subject_kind = ANY (ARRAY['employee'::text, 'owner'::text])));
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.owner_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text DEFAULT 'Pilotage'::text NOT NULL,
  link_token text NOT NULL,
  pin_hash text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.owner_accounts ADD CONSTRAINT owner_accounts_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_accounts ADD CONSTRAINT owner_accounts_link_token_key UNIQUE (link_token);
ALTER TABLE public.owner_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.owner_push_subscriptions (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  owner_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text DEFAULT ''::text NOT NULL,
  launch_url text DEFAULT './pilotage.html'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_success_at timestamp with time zone
);
ALTER TABLE public.owner_push_subscriptions ADD CONSTRAINT owner_push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_push_subscriptions ADD CONSTRAINT owner_push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.owner_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.owner_summary_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  owner_id uuid NOT NULL,
  work_date date NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.owner_summary_log ADD CONSTRAINT owner_summary_log_pkey PRIMARY KEY (id);
ALTER TABLE public.owner_summary_log ADD CONSTRAINT owner_summary_log_owner_id_work_date_key UNIQUE (owner_id, work_date);
ALTER TABLE public.owner_summary_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text DEFAULT ''::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  last_success_at timestamp with time zone,
  launch_url text DEFAULT './employee.html'::text NOT NULL
);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reminder_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  reminder_type text DEFAULT 'missing_hours'::text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reminder_log ADD CONSTRAINT reminder_log_pkey PRIMARY KEY (id);
ALTER TABLE public.reminder_log ADD CONSTRAINT reminder_log_employee_id_work_date_reminder_type_key UNIQUE (employee_id, work_date, reminder_type);
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.work_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  status text DEFAULT 'worked'::text NOT NULL,
  arrival time without time zone,
  departure time without time zone,
  pause_minutes integer DEFAULT 45 NOT NULL,
  comment text DEFAULT ''::text NOT NULL,
  arrival_mode text DEFAULT ''::text NOT NULL,
  departure_mode text DEFAULT ''::text NOT NULL,
  validation_status text DEFAULT ''::text NOT NULL,
  validated_at timestamp with time zone,
  validated_by text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pause_mode text DEFAULT 'manual'::text NOT NULL
);
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_pkey PRIMARY KEY (id);
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_employee_id_work_date_key UNIQUE (employee_id, work_date);
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_arrival_mode_check CHECK ((arrival_mode = ANY (ARRAY[''::text, 'now'::text, 'manual'::text, 'owner'::text])));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_departure_mode_check CHECK ((departure_mode = ANY (ARRAY[''::text, 'now'::text, 'manual'::text, 'owner'::text])));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_launch_date_ck CHECK ((work_date >= '2026-11-02'::date));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_pause_minutes_check CHECK (((pause_minutes >= 0) AND (pause_minutes <= 1440)));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_status_check CHECK ((status = ANY (ARRAY['worked'::text, 'off'::text])));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_times_ck CHECK (((status = 'off'::text) OR (arrival IS NULL) OR (departure IS NULL) OR (departure >= arrival)));
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_validation_status_check CHECK ((validation_status = ANY (ARRAY[''::text, 'pending'::text, 'validated'::text])));
ALTER TABLE public.work_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.work_schedule (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  is_working boolean NOT NULL,
  note text DEFAULT ''::text NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.work_schedule ADD CONSTRAINT work_schedule_pkey PRIMARY KEY (id);
ALTER TABLE public.work_schedule ADD CONSTRAINT work_schedule_employee_id_work_date_key UNIQUE (employee_id, work_date);
ALTER TABLE public.work_schedule ADD CONSTRAINT work_schedule_launch_date_ck CHECK ((work_date >= '2026-11-02'::date));
ALTER TABLE public.work_schedule ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.work_segments (
  id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  employer_id uuid NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone,
  source text DEFAULT 'employee'::text NOT NULL,
  comment text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  client_event_id text
);
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_pkey PRIMARY KEY (id);
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_launch_date_ck CHECK ((work_date >= '2026-11-02'::date));
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_order_ck CHECK (((end_time IS NULL) OR (end_time > start_time))) NOT VALID;
CREATE UNIQUE INDEX work_segments_employee_client_event_uidx ON public.work_segments USING btree (employee_id, client_event_id) WHERE (client_event_id IS NOT NULL);
CREATE INDEX work_segments_employee_date_idx ON public.work_segments USING btree (employee_id, work_date);
CREATE UNIQUE INDEX work_segments_one_open_per_employee ON public.work_segments USING btree (employee_id) WHERE (end_time IS NULL);
ALTER TABLE public.work_segments ENABLE ROW LEVEL SECURITY;

-- Clés étrangères
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.app_sessions ADD CONSTRAINT app_sessions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.owner_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_employee_id_fkey FOREIGN KEY (actor_employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE SET NULL;
ALTER TABLE public.employee_employers ADD CONSTRAINT employee_employers_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.employee_employers ADD CONSTRAINT employee_employers_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id) ON DELETE CASCADE;
ALTER TABLE public.employee_offline_events ADD CONSTRAINT employee_offline_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.owner_push_subscriptions ADD CONSTRAINT owner_push_subscriptions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.owner_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.owner_summary_log ADD CONSTRAINT owner_summary_log_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.owner_accounts(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.reminder_log ADD CONSTRAINT reminder_log_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_schedule ADD CONSTRAINT work_schedule_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_employer_id_fkey FOREIGN KEY (employer_id) REFERENCES public.employers(id);

-- ---------------------------------------------------------------------
-- Fonctions (copie exacte de la production)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._assert_owner(p_session_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
 SELECT s.owner_id INTO v_id FROM public.app_sessions s
 JOIN public.owner_accounts o ON o.id=s.owner_id AND o.active=true
 WHERE s.session_hash=public._session_token_hash(p_session_token)
   AND s.role='owner' AND s.expires_at>now();
 IF v_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 UPDATE public.app_sessions SET last_seen_at=now()
 WHERE session_hash=public._session_token_hash(p_session_token);
 RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._is_french_public_holiday(p_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._new_session_token()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'extensions'
AS $function$
  select encode(
    extensions.gen_random_bytes(32),
    'hex'
  );
$function$
;

CREATE OR REPLACE FUNCTION public._rtt_conflicts(p_type text, p_start time without time zone, p_end time without time zone)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 SELECT CASE p_type
 WHEN 'rtt_morning' THEN p_start IS NULL OR p_start < time '13:00'
 WHEN 'rtt_afternoon' THEN p_start IS NULL OR p_start >= time '13:00' OR p_end > time '13:00'
 ELSE true END;
$function$
;

CREATE OR REPLACE FUNCTION public._rtt_guard_leave()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._rtt_guard_work()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public._session_employee_id(p_session_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
 SELECT s.employee_id INTO v_id FROM public.app_sessions s
 JOIN public.employees e ON e.id=s.employee_id AND e.active=true
 WHERE s.session_hash=public._session_token_hash(p_session_token)
   AND s.role='employee' AND s.expires_at>now();
 IF v_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
 UPDATE public.app_sessions SET last_seen_at=now()
 WHERE session_hash=public._session_token_hash(p_session_token);
 RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._session_token_hash(p_token text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select encode(
    extensions.digest(coalesce(p_token, ''), 'sha256'),
    'hex'
  );
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public._v2_employee_stop_segment_impl(p_session_token text, p_segment_id uuid, p_end_time text, p_mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_seg public.work_segments%rowtype;
  v_end time;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  v_end:=nullif(p_end_time,'')::time;
  if v_end is null then raise exception 'invalid_end_time'; end if;
  if p_mode not in ('now','manual') then raise exception 'invalid_entry_mode'; end if;

  select * into v_seg from public.work_segments
  where id=p_segment_id and employee_id=v_emp_id and end_time is null;
  if v_seg.id is null then raise exception 'open_segment_not_found'; end if;
  if v_end<v_seg.start_time then raise exception 'end_before_start'; end if;
  if v_end=v_seg.start_time then raise exception 'zero_length_segment'; end if;

  if exists(
    select 1 from public.work_segments other
    where other.employee_id=v_emp_id and other.work_date=v_seg.work_date
      and other.id<>v_seg.id and other.end_time is not null
      and v_seg.start_time<other.end_time and other.start_time<v_end
  ) then raise exception 'overlapping_segments'; end if;

  update public.work_segments set end_time=v_end,source=coalesce(nullif(source,''),p_mode),updated_at=now()
  where id=v_seg.id;

  perform public._v2_sync_work_entry(v_emp_id,v_seg.work_date,null,p_mode);

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'v2_stop_segment',v_seg.work_date,
    jsonb_build_object('segment_id',v_seg.id,'mode',p_mode));
  return true;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_cancel_leave(p_session_token text, p_leave_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_emp_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  delete from public.leave_requests
  where id=p_leave_id
    and employee_id=v_emp_id
    and status='pending';
  if not found then raise exception 'leave_not_cancellable'; end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_cancel_leave_offline(p_session_token text, p_leave_id uuid, p_client_event_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_status text;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  if exists(
    select 1 from public.employee_offline_events
    where employee_id=v_emp_id and client_event_id=p_client_event_id
  ) then
    return true;
  end if;

  select status into v_status
  from public.leave_requests
  where id=p_leave_id and employee_id=v_emp_id;

  if found then
    if v_status<>'pending' then
      raise exception 'leave_not_cancellable';
    end if;

    delete from public.leave_requests
    where id=p_leave_id and employee_id=v_emp_id and status='pending';
  else
    if exists(select 1 from public.leave_requests where id=p_leave_id) then
      raise exception 'leave_not_cancellable';
    end if;
  end if;

  insert into public.employee_offline_events(employee_id,client_event_id,event_type,result)
  values(v_emp_id,p_client_event_id,'leave_cancel',jsonb_build_object('ok',true))
  on conflict(employee_id,client_event_id) do nothing;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_change_pin(p_session_token text, p_current_pin text, p_new_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_employee_id uuid;
  v_hash text;
begin
  if p_new_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
  end if;

  select s.employee_id
    into v_employee_id
  from public.app_sessions s
  where s.session_hash = encode(extensions.digest(coalesce(p_session_token,''), 'sha256'), 'hex')
    and s.role = 'employee'
    and s.employee_id is not null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_employee_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select pin_hash into v_hash
  from public.employees
  where id = v_employee_id and active = true;

  if v_hash is null or extensions.crypt(p_current_pin, v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_current_pin');
  end if;

  update public.employees
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_employee_id;

  insert into public.audit_log(employee_id, actor_role, actor_employee_id, action, details)
  values (v_employee_id, 'employee', v_employee_id, 'pin_changed', '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_emp public.employees%rowtype;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  select * into v_emp from public.employees where id=v_emp_id;

  return jsonb_build_object(
    'employee',jsonb_build_object(
      'id',v_emp.id,
      'name',v_emp.name,
      'weekly_objective_minutes',v_emp.weekly_objective_minutes,
      'overtime_threshold_minutes',v_emp.overtime_threshold_minutes
    ),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_date)
      from (
        select work_date,status,
               to_char(arrival,'HH24:MI') as arrival,
               to_char(departure,'HH24:MI') as departure,
               pause_minutes,comment,arrival_mode,departure_mode,
               validation_status,validated_at,updated_at
        from public.work_entries
        where employee_id=v_emp_id and work_date between p_from and p_to
      ) x
    ),'[]'::jsonb),
    'schedule',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.work_date)
      from (
        select work_date,is_working,note
        from public.work_schedule
        where employee_id=v_emp_id and work_date between p_from and p_to
      ) s
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_day_state_version(p_session_token text, p_work_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_entry timestamptz;
  v_segment timestamptz;
  v_schedule timestamptz;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  select updated_at into v_entry
  from public.work_entries
  where employee_id=v_emp_id and work_date=p_work_date;

  select max(updated_at) into v_segment
  from public.work_segments
  where employee_id=v_emp_id and work_date=p_work_date;

  select updated_at into v_schedule
  from public.work_schedule
  where employee_id=v_emp_id and work_date=p_work_date;

  return jsonb_build_object(
    'entry_updated_at', v_entry,
    'segment_updated_at', v_segment,
    'schedule_updated_at', v_schedule
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_delete_segment_offline(p_session_token text, p_segment_id uuid, p_client_event_id text, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_work_date date;
  v_updated_at timestamptz;
  v_end time;
  v_remaining integer:=0;
  v_gross integer:=0;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  if exists(
    select 1 from public.employee_offline_events
    where employee_id=v_emp_id and client_event_id=p_client_event_id
  ) then
    return true;
  end if;

  select work_date,updated_at,end_time
  into v_work_date,v_updated_at,v_end
  from public.work_segments
  where id=p_segment_id and employee_id=v_emp_id;

  if not found then
    raise exception 'segment_not_found';
  end if;

  if v_end is null then
    raise exception 'segment_still_open';
  end if;

  if p_expected_updated_at is not null and v_updated_at is distinct from p_expected_updated_at then
    raise exception 'segment_changed_on_server';
  end if;

  delete from public.work_segments
  where id=p_segment_id and employee_id=v_emp_id;

  select count(*),
         coalesce(sum(case when end_time is null then 0 else extract(epoch from (end_time-start_time))/60 end),0)::integer
  into v_remaining,v_gross
  from public.work_segments
  where employee_id=v_emp_id and work_date=v_work_date;

  if v_remaining=0 then
    delete from public.work_entries
    where employee_id=v_emp_id and work_date=v_work_date;
  else
    perform public._v2_sync_work_entry(v_emp_id,v_work_date,null,null);
    update public.work_entries
    set pause_minutes=least(greatest(coalesce(pause_minutes,0),0),greatest(v_gross,0)),
        validation_status=case
          when exists(
            select 1 from public.work_segments
            where employee_id=v_emp_id and work_date=v_work_date and end_time is null
          ) then '' else 'pending' end,
        validated_at=null,
        validated_by='',
        updated_at=now()
    where employee_id=v_emp_id and work_date=v_work_date;
  end if;

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'v2_delete_segment',v_work_date,jsonb_build_object('segment_id',p_segment_id));

  insert into public.employee_offline_events(employee_id,client_event_id,event_type,result)
  values(v_emp_id,p_client_event_id,'segment_delete',jsonb_build_object('ok',true,'segment_id',p_segment_id))
  on conflict(employee_id,client_event_id) do nothing;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_login(p_link_token text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text := encode(extensions.digest(coalesce(p_link_token,''), 'sha256'), 'hex');
  v_row public.login_rate_limits%rowtype;
  v_result jsonb;
  v_failures integer;
  v_retry integer;
begin
  perform pg_advisory_xact_lock(hashtext('employee:' || v_key));

  select *
    into v_row
    from public.login_rate_limits
   where subject_kind='employee'
     and subject_hash=v_key
   for update;

  if found and v_row.locked_until is not null
     and v_row.locked_until > clock_timestamp() then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_row.locked_until-clock_timestamp())))::integer
    );
    return jsonb_build_object(
      'error','too_many_attempts',
      'retry_after_seconds',v_retry
    );
  end if;

  v_result := public.api_employee_login_internal(p_link_token,p_pin);

  if v_result is not null
     and coalesce(v_result->>'session_token','') <> '' then
    delete from public.login_rate_limits
     where subject_kind='employee'
       and subject_hash=v_key;
    return v_result;
  end if;

  insert into public.login_rate_limits(
    subject_kind,subject_hash,failed_count,window_started_at,locked_until,updated_at
  )
  values(
    'employee',v_key,1,clock_timestamp(),null,clock_timestamp()
  )
  on conflict(subject_kind,subject_hash) do update
    set failed_count = case
          when public.login_rate_limits.window_started_at
               < clock_timestamp()-interval '15 minutes'
            then 1
          else public.login_rate_limits.failed_count+1
        end,
        window_started_at = case
          when public.login_rate_limits.window_started_at
               < clock_timestamp()-interval '15 minutes'
            then clock_timestamp()
          else public.login_rate_limits.window_started_at
        end,
        locked_until = null,
        updated_at = clock_timestamp()
  returning failed_count into v_failures;

  if v_failures >= 5 then
    update public.login_rate_limits
       set locked_until=clock_timestamp()+interval '15 minutes',
           updated_at=clock_timestamp()
     where subject_kind='employee'
       and subject_hash=v_key;

    return jsonb_build_object(
      'error','too_many_attempts',
      'retry_after_seconds',900
    );
  end if;

  return jsonb_build_object(
    'error','invalid_credentials',
    'remaining_attempts',greatest(0,5-v_failures)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_login_internal(p_link_token text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_employee public.employees%rowtype;
  v_session_token text;
  v_session_hash text;
begin
  select *
  into v_employee
  from public.employees
  where link_token = p_link_token
    and active = true
  limit 1;

  if v_employee.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials'
    );
  end if;

  if extensions.crypt(p_pin, v_employee.pin_hash) <> v_employee.pin_hash then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials'
    );
  end if;

  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_session_hash := encode(extensions.digest(v_session_token, 'sha256'), 'hex');

  insert into public.app_sessions (
    session_hash,
    role,
    employee_id,
    created_at,
    last_seen_at,
    expires_at
  )
  values (
    v_session_hash,
    'employee',
    v_employee.id,
    now(),
    now(),
    now() + interval '90 days'
  );

  return jsonb_build_object(
    'ok', true,
    'session_token', v_session_token,
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'name', v_employee.name
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_remove_push_subscription(p_session_token text, p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  update public.push_subscriptions
  set active=false,updated_at=now()
  where employee_id=v_emp_id and endpoint=p_endpoint;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_replace_day_v2(p_session_token text, p_work_date date, p_segments jsonb, p_pause_minutes integer, p_comment text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid; v_item jsonb; v_employer uuid; v_start time; v_end time;
  v_count integer:=0; v_first time; v_last time; v_gross integer:=0;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  delete from public.work_segments where employee_id=v_emp_id and work_date=p_work_date;

  for v_item in select value from jsonb_array_elements(coalesce(p_segments,'[]'::jsonb)) loop
    v_employer:=nullif(v_item->>'employer_id','')::uuid;
    v_start:=nullif(v_item->>'start_time','')::time;
    v_end:=nullif(v_item->>'end_time','')::time;
    if v_employer is null or v_start is null or v_end is null then raise exception 'invalid_segment'; end if;
    if v_end<v_start then raise exception 'end_before_start'; end if;
    if v_end=v_start then raise exception 'zero_length_segment'; end if;
    if not exists(
      select 1 from public.employee_employers ee join public.employers e on e.id=ee.employer_id
      where ee.employee_id=v_emp_id and ee.employer_id=v_employer and ee.active=true and e.active=true
    ) then raise exception 'employer_not_allowed'; end if;
    insert into public.work_segments(employee_id,work_date,employer_id,start_time,end_time,source,updated_at)
    values(v_emp_id,p_work_date,v_employer,v_start,v_end,'manual',now());
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception 'no_segments'; end if;

  if exists(
    select 1 from public.work_segments a join public.work_segments b
      on a.employee_id=b.employee_id and a.work_date=b.work_date and a.id<b.id
      and a.start_time<b.end_time and b.start_time<a.end_time
    where a.employee_id=v_emp_id and a.work_date=p_work_date
  ) then raise exception 'overlapping_segments'; end if;

  select min(start_time),max(end_time),coalesce(sum(extract(epoch from (end_time-start_time))/60),0)::integer
  into v_first,v_last,v_gross
  from public.work_segments where employee_id=v_emp_id and work_date=p_work_date;

  if greatest(coalesce(p_pause_minutes,0),0)>v_gross then raise exception 'pause_exceeds_work'; end if;

  insert into public.work_entries(
    employee_id,work_date,status,arrival,departure,pause_minutes,pause_mode,comment,
    arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
  ) values(
    v_emp_id,p_work_date,'worked',v_first,v_last,greatest(coalesce(p_pause_minutes,0),0),'manual',coalesce(p_comment,''),
    'manual','manual','pending',null,'',now()
  )
  on conflict(employee_id,work_date) do update set
    status='worked',arrival=excluded.arrival,departure=excluded.departure,
    pause_minutes=excluded.pause_minutes,pause_mode='manual',comment=excluded.comment,
    arrival_mode='manual',departure_mode='manual',validation_status='pending',
    validated_at=null,validated_by='',updated_at=now();

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'v2_replace_day',p_work_date,jsonb_build_object('segments',v_count));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_request_leave(p_session_token text, p_start_date date, p_end_date date, p_note text DEFAULT ''::text)
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

  if exists(
    select 1 from public.work_segments
    where employee_id=v_emp_id and work_date between p_start_date and p_end_date
  ) or exists(
    select 1 from public.work_entries
    where employee_id=v_emp_id and work_date between p_start_date and p_end_date
      and status='worked' and (arrival is not null or departure is not null)
  ) then raise exception 'leave_has_work'; end if;

  if exists(
    select 1 from public.leave_requests
    where employee_id=v_emp_id
      and status in ('pending','validated')
      and daterange(start_date,end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then raise exception 'leave_overlap'; end if;

  insert into public.leave_requests(
    employee_id,start_date,end_date,leave_type,status,note,requested_by,updated_at
  ) values(
    v_emp_id,p_start_date,p_end_date,'paid_leave','pending',coalesce(p_note,''),'employee',now()
  ) returning id into v_id;

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'request_leave',p_start_date,jsonb_build_object('leave_id',v_id,'end_date',p_end_date));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_request_leave_offline(p_session_token text, p_start_date date, p_end_date date, p_note text, p_client_event_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_leave_id uuid;
  v_existing jsonb;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  select result into v_existing
  from public.employee_offline_events
  where employee_id=v_emp_id and client_event_id=p_client_event_id;

  if v_existing is not null then
    return nullif(v_existing->>'leave_id','')::uuid;
  end if;

  v_leave_id:=public.api_employee_request_leave(
    p_session_token,
    p_start_date,
    p_end_date,
    coalesce(p_note,'')
  );

  insert into public.employee_offline_events(employee_id,client_event_id,event_type,result)
  values(v_emp_id,p_client_event_id,'leave_request',jsonb_build_object('leave_id',v_leave_id))
  on conflict(employee_id,client_event_id) do nothing;

  return v_leave_id;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_request_leave_typed_offline(p_session_token text, p_start_date date, p_end_date date, p_note text, p_client_event_id text, p_leave_type text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_save_entry(p_session_token text, p_work_date date, p_status text, p_arrival text, p_departure text, p_pause_minutes integer, p_comment text, p_arrival_mode text, p_departure_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_arrival time;
  v_departure time;
  v_entry public.work_entries%rowtype;
begin
  v_emp_id := public._session_employee_id(p_session_token);
  if p_status not in ('worked','off') then raise exception 'invalid_status'; end if;

  v_arrival := nullif(p_arrival,'')::time;
  v_departure := nullif(p_departure,'')::time;

  if p_status='off' then
    v_arrival := null; v_departure := null;
  end if;

  insert into public.work_entries(
    employee_id,work_date,status,arrival,departure,pause_minutes,comment,
    arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
  ) values (
    v_emp_id,p_work_date,p_status,v_arrival,v_departure,greatest(coalesce(p_pause_minutes,0),0),coalesce(p_comment,''),
    case when p_status='off' then '' else coalesce(p_arrival_mode,'manual') end,
    case when p_status='off' then '' else coalesce(p_departure_mode,'manual') end,
    case when p_status='off' or (v_arrival is not null and v_departure is not null) then 'pending' else '' end,
    null,'',now()
  )
  on conflict(employee_id,work_date) do update set
    status=excluded.status,
    arrival=excluded.arrival,
    departure=excluded.departure,
    pause_minutes=excluded.pause_minutes,
    comment=excluded.comment,
    arrival_mode=excluded.arrival_mode,
    departure_mode=excluded.departure_mode,
    validation_status=case when excluded.status='off' or (excluded.arrival is not null and excluded.departure is not null) then 'pending' else '' end,
    validated_at=null,
    validated_by='',
    updated_at=now()
  returning * into v_entry;

  insert into public.audit_log(employee_id,actor_role,actor_employee_id,action,work_date,details)
  values(v_emp_id,'employee',v_emp_id,'save_entry',p_work_date,jsonb_build_object('status',p_status));

  return to_jsonb(v_entry);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_launch_url text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  if coalesce(p_endpoint,'')='' or coalesce(p_p256dh,'')='' or coalesce(p_auth,'')='' then
    raise exception 'invalid_push_subscription';
  end if;

  insert into public.push_subscriptions(
    employee_id,endpoint,p256dh,auth,user_agent,launch_url,active,updated_at
  ) values(
    v_emp_id,p_endpoint,p_p256dh,p_auth,coalesce(p_user_agent,''),
    coalesce(nullif(p_launch_url,''),'./employee.html'),true,now()
  )
  on conflict(endpoint) do update set
    employee_id=excluded.employee_id,
    p256dh=excluded.p256dh,
    auth=excluded.auth,
    user_agent=excluded.user_agent,
    launch_url=excluded.launch_url,
    active=true,
    updated_at=now();
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_set_day_off_v2(p_session_token text, p_work_date date, p_is_off boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_deleted integer := 0;
begin
  v_emp_id := public._session_employee_id(p_session_token);

  if coalesce(p_is_off,false) then
    delete from public.work_segments
    where employee_id = v_emp_id
      and work_date = p_work_date;

    get diagnostics v_deleted = row_count;

    insert into public.work_entries(
      employee_id,work_date,status,arrival,departure,pause_minutes,pause_mode,comment,
      arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
    ) values(
      v_emp_id,p_work_date,'off',null,null,0,'manual','',
      '','','pending',null,'',now()
    )
    on conflict(employee_id,work_date) do update set
      status='off',
      arrival=null,
      departure=null,
      pause_minutes=0,
      pause_mode='manual',
      comment='',
      arrival_mode='',
      departure_mode='',
      validation_status='pending',
      validated_at=null,
      validated_by='',
      updated_at=now();
  else
    insert into public.work_entries(
      employee_id,work_date,status,pause_minutes,pause_mode,comment,
      validation_status,updated_at
    ) values(
      v_emp_id,p_work_date,'worked',90,'auto','',
      '',now()
    )
    on conflict(employee_id,work_date) do update set
      status='worked',
      pause_minutes=case when work_entries.status='off' then 90 else work_entries.pause_minutes end,
      pause_mode=case when work_entries.status='off' then 'auto' else work_entries.pause_mode end,
      validation_status='',
      validated_at=null,
      validated_by='',
      updated_at=now();
  end if;

  insert into public.audit_log(
    employee_id,actor_role,actor_employee_id,action,work_date,details
  )
  values(
    v_emp_id,'employee',v_emp_id,'v2_set_day_off',p_work_date,
    jsonb_build_object(
      'is_off',coalesce(p_is_off,false),
      'deleted_segments',v_deleted
    )
  );

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_set_day_status_offline(p_session_token text, p_work_date date, p_is_off boolean, p_client_event_id text, p_expected_entry_updated_at timestamp with time zone, p_expected_segment_updated_at timestamp with time zone, p_expected_schedule_updated_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_entry timestamptz;
  v_segment timestamptz;
  v_schedule timestamptz;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  if exists(
    select 1 from public.employee_offline_events
    where employee_id=v_emp_id and client_event_id=p_client_event_id
  ) then
    return true;
  end if;

  select updated_at into v_entry
  from public.work_entries
  where employee_id=v_emp_id and work_date=p_work_date;

  select max(updated_at) into v_segment
  from public.work_segments
  where employee_id=v_emp_id and work_date=p_work_date;

  select updated_at into v_schedule
  from public.work_schedule
  where employee_id=v_emp_id and work_date=p_work_date;

  if v_entry is distinct from p_expected_entry_updated_at
     or v_segment is distinct from p_expected_segment_updated_at
     or v_schedule is distinct from p_expected_schedule_updated_at then
    raise exception 'day_changed_on_server';
  end if;

  perform public.api_employee_set_day_off_v2(
    p_session_token,
    p_work_date,
    coalesce(p_is_off,false)
  );

  insert into public.employee_offline_events(employee_id,client_event_id,event_type,result)
  values(v_emp_id,p_client_event_id,'day_status',jsonb_build_object('ok',true))
  on conflict(employee_id,client_event_id) do nothing;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_start_segment(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public._v2_employee_start_segment_impl(p_session_token,p_work_date,p_employer_id,p_start_time,'now');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_start_segment_manual(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public._v2_employee_start_segment_impl(p_session_token,p_work_date,p_employer_id,p_start_time,'manual');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_start_segment_offline(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text, p_mode text, p_client_event_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_id uuid;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  if coalesce(btrim(p_client_event_id),'')='' then
    raise exception 'invalid_client_event_id';
  end if;

  select id into v_id
  from public.work_segments
  where employee_id=v_emp_id
    and client_event_id=p_client_event_id
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_id:=public._v2_employee_start_segment_impl(
    p_session_token,
    p_work_date,
    p_employer_id,
    p_start_time,
    p_mode
  );

  update public.work_segments
  set client_event_id=p_client_event_id,
      updated_at=now()
  where id=v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_stop_segment(p_session_token text, p_segment_id uuid, p_end_time text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public._v2_employee_stop_segment_impl(p_session_token,p_segment_id,p_end_time,'now');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_stop_segment_manual(p_session_token text, p_segment_id uuid, p_end_time text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public._v2_employee_stop_segment_impl(p_session_token,p_segment_id,p_end_time,'manual');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_stop_segment_offline(p_session_token text, p_segment_id uuid, p_end_time text, p_mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_existing_end time;
  v_requested_end time;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  v_requested_end:=nullif(p_end_time,'')::time;

  if v_requested_end is null then
    raise exception 'invalid_end_time';
  end if;

  select end_time into v_existing_end
  from public.work_segments
  where id=p_segment_id
    and employee_id=v_emp_id;

  if not found then
    raise exception 'open_segment_not_found';
  end if;

  if v_existing_end is not null then
    if v_existing_end=v_requested_end then
      return true;
    end if;
    raise exception 'segment_already_closed';
  end if;

  return public._v2_employee_stop_segment_impl(
    p_session_token,
    p_segment_id,
    p_end_time,
    p_mode
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_update_day_meta_offline(p_session_token text, p_work_date date, p_pause_minutes integer, p_comment text, p_client_event_id text, p_expected_entry_updated_at timestamp with time zone, p_expected_segment_updated_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
  v_entry timestamptz;
  v_segment timestamptz;
begin
  v_emp_id:=public._session_employee_id(p_session_token);

  if exists(
    select 1 from public.employee_offline_events
    where employee_id=v_emp_id and client_event_id=p_client_event_id
  ) then
    return true;
  end if;

  select updated_at into v_entry
  from public.work_entries
  where employee_id=v_emp_id and work_date=p_work_date;

  select max(updated_at) into v_segment
  from public.work_segments
  where employee_id=v_emp_id and work_date=p_work_date;

  if v_entry is distinct from p_expected_entry_updated_at
     or v_segment is distinct from p_expected_segment_updated_at then
    raise exception 'day_changed_on_server';
  end if;

  perform public.api_employee_update_day_meta_v2(
    p_session_token,
    p_work_date,
    greatest(coalesce(p_pause_minutes,0),0),
    coalesce(p_comment,'')
  );

  insert into public.employee_offline_events(employee_id,client_event_id,event_type,result)
  values(v_emp_id,p_client_event_id,'day_meta',jsonb_build_object('ok',true))
  on conflict(employee_id,client_event_id) do nothing;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_update_day_meta_v2(p_session_token text, p_work_date date, p_pause_minutes integer, p_comment text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid; v_count integer:=0; v_open integer:=0; v_gross integer:=0;
  v_arrival time; v_departure time;
begin
  v_emp_id:=public._session_employee_id(p_session_token);
  select count(*),count(*) filter(where end_time is null),
         coalesce(sum(case when end_time is null then 0 else extract(epoch from (end_time-start_time))/60 end),0)::integer
  into v_count,v_open,v_gross
  from public.work_segments where employee_id=v_emp_id and work_date=p_work_date;

  if v_count>0 and v_open=0 and greatest(coalesce(p_pause_minutes,0),0)>v_gross then
    raise exception 'pause_exceeds_work';
  end if;
  if v_count=0 then
    select arrival,departure into v_arrival,v_departure from public.work_entries
    where employee_id=v_emp_id and work_date=p_work_date;
    if v_arrival is not null and v_departure is not null
       and greatest(coalesce(p_pause_minutes,0),0) > extract(epoch from (v_departure-v_arrival))/60 then
      raise exception 'pause_exceeds_work';
    end if;
  end if;

  insert into public.work_entries(employee_id,work_date,status,pause_minutes,pause_mode,comment,validation_status,updated_at)
  values(v_emp_id,p_work_date,'worked',greatest(coalesce(p_pause_minutes,0),0),'manual',coalesce(p_comment,''),'',now())
  on conflict(employee_id,work_date) do update set
    pause_minutes=greatest(coalesce(p_pause_minutes,0),0),pause_mode='manual',comment=coalesce(p_comment,''),
    validation_status=case when work_entries.status='off' then 'pending'
      when work_entries.arrival is not null and work_entries.departure is not null then 'pending' else '' end,
    validated_at=null,validated_by='',updated_at=now();
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_employee_v2_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_emp_id uuid;
begin
  v_emp_id := public._session_employee_id(p_session_token);

  return jsonb_build_object(
    'employers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'active', e.active,
        'sort_order', e.sort_order
      ) order by e.sort_order, e.name)
      from public.employers e
      where exists(
        select 1
        from public.employee_employers ee
        where ee.employee_id=v_emp_id
          and ee.employer_id=e.id
          and ee.active=true
      )
      or exists(
        select 1
        from public.work_segments hs
        where hs.employee_id=v_emp_id
          and hs.employer_id=e.id
          and hs.work_date between p_from and p_to
      )
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', ee.employee_id,
        'employer_id', ee.employer_id,
        'active', ee.active
      ))
      from public.employee_employers ee
      where ee.employee_id=v_emp_id
    ), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'employee_id', s.employee_id,
        'work_date', s.work_date,
        'employer_id', s.employer_id,
        'employer_name', e.name,
        'start_time', to_char(s.start_time,'HH24:MI'),
        'end_time', case when s.end_time is null then null else to_char(s.end_time,'HH24:MI') end,
        'source', s.source,
        'comment', s.comment,
        'updated_at', s.updated_at
      ) order by s.work_date, s.start_time)
      from public.work_segments s
      join public.employers e on e.id=s.employer_id
      where s.employee_id=v_emp_id
        and s.work_date between p_from and p_to
    ), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'employee_id', l.employee_id,
        'start_date', l.start_date,
        'end_date', l.end_date,
        'leave_type', l.leave_type,
        'status', l.status,
        'note', l.note,
        'requested_by', l.requested_by,
        'reviewed_at', l.reviewed_at,
        'created_at', l.created_at
      ) order by l.start_date desc)
      from public.leave_requests l
      where l.employee_id=v_emp_id
        and l.end_date >= p_from
        and l.start_date <= p_to
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_logout(p_session_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.app_sessions
  where session_hash=public._session_token_hash(p_session_token);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_change_pin(p_session_token text, p_current_pin text, p_new_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_owner_id uuid;
  v_hash text;
begin
  if p_new_pin !~ '^\d{4}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_new_pin');
  end if;

  select s.owner_id
    into v_owner_id
  from public.app_sessions s
  where s.session_hash = encode(extensions.digest(coalesce(p_session_token,''), 'sha256'), 'hex')
    and s.role = 'owner'
    and s.owner_id is not null
    and (s.expires_at is null or s.expires_at > now())
  limit 1;

  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select pin_hash into v_hash
  from public.owner_accounts
  where id = v_owner_id and active = true;

  if v_hash is null or extensions.crypt(p_current_pin, v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid_current_pin');
  end if;

  update public.owner_accounts
  set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_owner_id;

  return jsonb_build_object('ok', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_create_employer(p_session_token text, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_id uuid;
  v_name text;
begin
  v_owner := public._assert_owner(p_session_token);
  v_name := btrim(coalesce(p_name,''));
  if length(v_name) < 2 then raise exception 'invalid_employer_name'; end if;
  if exists(select 1 from public.employers where lower(btrim(name))=lower(v_name)) then
    raise exception 'employer_name_exists';
  end if;

  insert into public.employers(name,active,updated_at)
  values(v_name,true,now())
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_create_leave(p_session_token text, p_employee_id uuid, p_start_date date, p_end_date date, p_note text DEFAULT ''::text)
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

  if exists(
    select 1 from public.work_segments
    where employee_id=p_employee_id and work_date between p_start_date and p_end_date
  ) or exists(
    select 1 from public.work_entries
    where employee_id=p_employee_id and work_date between p_start_date and p_end_date
      and status='worked' and (arrival is not null or departure is not null)
  ) then raise exception 'leave_has_work'; end if;

  if exists(
    select 1 from public.leave_requests
    where employee_id=p_employee_id
      and status in ('pending','validated')
      and daterange(start_date,end_date,'[]') && daterange(p_start_date,p_end_date,'[]')
  ) then raise exception 'leave_overlap'; end if;

  insert into public.leave_requests(
    employee_id,start_date,end_date,leave_type,status,note,requested_by,
    reviewed_at,reviewed_by,updated_at
  ) values(
    p_employee_id,p_start_date,p_end_date,'paid_leave','validated',coalesce(p_note,''),'owner',
    now(),'owner',now()
  ) returning id into v_id;

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','create_leave',p_start_date,jsonb_build_object('leave_id',v_id,'end_date',p_end_date));

  return v_id;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);

  return jsonb_build_object(
    'employees',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',id,'name',name,
        'weekly_objective_minutes',weekly_objective_minutes,
        'overtime_threshold_minutes',overtime_threshold_minutes
      ) order by name)
      from public.employees where active=true
    ),'[]'::jsonb),
    'entries',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.work_date,x.employee_id)
      from (
        select employee_id,work_date,status,
               to_char(arrival,'HH24:MI') as arrival,
               to_char(departure,'HH24:MI') as departure,
               pause_minutes,comment,arrival_mode,departure_mode,
               validation_status,validated_at,updated_at
        from public.work_entries
        where work_date between p_from and p_to
      ) x
    ),'[]'::jsonb),
    'schedule',coalesce((
      select jsonb_agg(to_jsonb(s) order by s.work_date,s.employee_id)
      from (
        select employee_id,work_date,is_working,note
        from public.work_schedule
        where work_date between p_from and p_to
      ) s
    ),'[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_delete_leave(p_session_token text, p_leave_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  delete from public.leave_requests where id=p_leave_id;
  if not found then raise exception 'leave_not_found'; end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_login(p_link_token text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key text := encode(extensions.digest(coalesce(p_link_token,''), 'sha256'), 'hex');
  v_row public.login_rate_limits%rowtype;
  v_result jsonb;
  v_failures integer;
  v_retry integer;
begin
  perform pg_advisory_xact_lock(hashtext('owner:' || v_key));

  select *
    into v_row
    from public.login_rate_limits
   where subject_kind='owner'
     and subject_hash=v_key
   for update;

  if found and v_row.locked_until is not null
     and v_row.locked_until > clock_timestamp() then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (v_row.locked_until-clock_timestamp())))::integer
    );
    return jsonb_build_object(
      'error','too_many_attempts',
      'retry_after_seconds',v_retry
    );
  end if;

  v_result := public.api_owner_login_internal(p_link_token,p_pin);

  if v_result is not null
     and coalesce(v_result->>'session_token','') <> '' then
    delete from public.login_rate_limits
     where subject_kind='owner'
       and subject_hash=v_key;
    return v_result;
  end if;

  insert into public.login_rate_limits(
    subject_kind,subject_hash,failed_count,window_started_at,locked_until,updated_at
  )
  values(
    'owner',v_key,1,clock_timestamp(),null,clock_timestamp()
  )
  on conflict(subject_kind,subject_hash) do update
    set failed_count = case
          when public.login_rate_limits.window_started_at
               < clock_timestamp()-interval '15 minutes'
            then 1
          else public.login_rate_limits.failed_count+1
        end,
        window_started_at = case
          when public.login_rate_limits.window_started_at
               < clock_timestamp()-interval '15 minutes'
            then clock_timestamp()
          else public.login_rate_limits.window_started_at
        end,
        locked_until = null,
        updated_at = clock_timestamp()
  returning failed_count into v_failures;

  if v_failures >= 5 then
    update public.login_rate_limits
       set locked_until=clock_timestamp()+interval '15 minutes',
           updated_at=clock_timestamp()
     where subject_kind='owner'
       and subject_hash=v_key;

    return jsonb_build_object(
      'error','too_many_attempts',
      'retry_after_seconds',900
    );
  end if;

  return jsonb_build_object(
    'error','invalid_credentials',
    'remaining_attempts',greatest(0,5-v_failures)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_login_internal(p_link_token text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_owner public.owner_accounts%rowtype;
  v_session_token text;
  v_session_hash text;
begin
  select *
  into v_owner
  from public.owner_accounts
  where link_token = p_link_token
    and active = true
  limit 1;

  if v_owner.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials'
    );
  end if;

  if extensions.crypt(p_pin, v_owner.pin_hash) <> v_owner.pin_hash then
    return jsonb_build_object(
      'ok', false,
      'error', 'invalid_credentials'
    );
  end if;

  v_session_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_session_hash := encode(extensions.digest(v_session_token, 'sha256'), 'hex');

  insert into public.app_sessions (
    session_hash,
    role,
    owner_id,
    created_at,
    last_seen_at,
    expires_at
  )
  values (
    v_session_hash,
    'owner',
    v_owner.id,
    now(),
    now(),
    now() + interval '90 days'
  );

  return jsonb_build_object(
    'ok', true,
    'session_token', v_session_token,
    'owner', jsonb_build_object(
      'id', v_owner.id,
      'label', v_owner.label
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_push_subscription_status(p_session_token text, p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner(p_session_token);

  return exists(
    select 1
    from public.owner_push_subscriptions
    where owner_id = v_owner_id
      and endpoint = p_endpoint
      and active = true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_remove_push_subscription(p_session_token text, p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner(p_session_token);

  update public.owner_push_subscriptions
  set
    active = false,
    updated_at = now()
  where owner_id = v_owner_id
    and endpoint = p_endpoint;

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_replace_day_v2(p_session_token text, p_employee_id uuid, p_work_date date, p_segments jsonb, p_pause_minutes integer, p_comment text, p_validation_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid; v_item jsonb; v_employer uuid; v_start time; v_end time;
  v_count integer:=0; v_first time; v_last time; v_gross integer:=0;
begin
  v_owner:=public._assert_owner(p_session_token);
  if p_validation_status not in ('pending','validated') then raise exception 'invalid_validation_status'; end if;
  delete from public.work_segments where employee_id=p_employee_id and work_date=p_work_date;
  for v_item in select value from jsonb_array_elements(coalesce(p_segments,'[]'::jsonb)) loop
    v_employer:=nullif(v_item->>'employer_id','')::uuid;
    v_start:=nullif(v_item->>'start_time','')::time;
    v_end:=nullif(v_item->>'end_time','')::time;
    if v_employer is null or v_start is null or v_end is null then raise exception 'invalid_segment'; end if;
    if v_end<v_start then raise exception 'end_before_start'; end if;
    if v_end=v_start then raise exception 'zero_length_segment'; end if;
    if not exists(select 1 from public.employers where id=v_employer) then raise exception 'employer_not_found'; end if;
    insert into public.work_segments(employee_id,work_date,employer_id,start_time,end_time,source,updated_at)
    values(p_employee_id,p_work_date,v_employer,v_start,v_end,'owner',now());
    v_count:=v_count+1;
  end loop;
  if v_count=0 then raise exception 'no_segments'; end if;
  if exists(
    select 1 from public.work_segments a join public.work_segments b
      on a.employee_id=b.employee_id and a.work_date=b.work_date and a.id<b.id
      and a.start_time<b.end_time and b.start_time<a.end_time
    where a.employee_id=p_employee_id and a.work_date=p_work_date
  ) then raise exception 'overlapping_segments'; end if;
  select min(start_time),max(end_time),coalesce(sum(extract(epoch from (end_time-start_time))/60),0)::integer
  into v_first,v_last,v_gross
  from public.work_segments where employee_id=p_employee_id and work_date=p_work_date;
  if greatest(coalesce(p_pause_minutes,0),0)>v_gross then raise exception 'pause_exceeds_work'; end if;

  insert into public.work_entries(
    employee_id,work_date,status,arrival,departure,pause_minutes,pause_mode,comment,
    arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
  ) values(
    p_employee_id,p_work_date,'worked',v_first,v_last,greatest(coalesce(p_pause_minutes,0),0),'manual',coalesce(p_comment,''),
    'owner','owner',p_validation_status,
    case when p_validation_status='validated' then now() else null end,
    case when p_validation_status='validated' then 'owner' else '' end,now()
  )
  on conflict(employee_id,work_date) do update set
    status='worked',arrival=excluded.arrival,departure=excluded.departure,
    pause_minutes=excluded.pause_minutes,pause_mode='manual',comment=excluded.comment,
    arrival_mode='owner',departure_mode='owner',validation_status=excluded.validation_status,
    validated_at=excluded.validated_at,validated_by=excluded.validated_by,updated_at=now();

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','v2_owner_replace_day',p_work_date,
    jsonb_build_object('segments',v_count,'validation_status',p_validation_status));
  return true;
end;
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_save_entry(p_session_token text, p_employee_id uuid, p_work_date date, p_status text, p_arrival text, p_departure text, p_pause_minutes integer, p_comment text, p_validation_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_arrival time;
  v_departure time;
begin
  v_owner := public._assert_owner(p_session_token);
  if p_status not in ('worked','off') then raise exception 'invalid_status'; end if;
  if p_validation_status not in ('pending','validated') then raise exception 'invalid_validation_status'; end if;

  v_arrival := nullif(p_arrival,'')::time;
  v_departure := nullif(p_departure,'')::time;
  if p_status='off' then v_arrival:=null; v_departure:=null; end if;

  insert into public.work_entries(
    employee_id,work_date,status,arrival,departure,pause_minutes,comment,
    arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
  ) values (
    p_employee_id,p_work_date,p_status,v_arrival,v_departure,greatest(coalesce(p_pause_minutes,0),0),coalesce(p_comment,''),
    case when p_status='off' then '' else 'owner' end,
    case when p_status='off' then '' else 'owner' end,
    p_validation_status,
    case when p_validation_status='validated' then now() else null end,
    case when p_validation_status='validated' then 'owner' else '' end,
    now()
  )
  on conflict(employee_id,work_date) do update set
    status=excluded.status,arrival=excluded.arrival,departure=excluded.departure,
    pause_minutes=excluded.pause_minutes,comment=excluded.comment,
    arrival_mode=excluded.arrival_mode,departure_mode=excluded.departure_mode,
    validation_status=excluded.validation_status,validated_at=excluded.validated_at,
    validated_by=excluded.validated_by,updated_at=now();

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','owner_save_entry',p_work_date,jsonb_build_object('validation_status',p_validation_status));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT ''::text, p_launch_url text DEFAULT './pilotage.html'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner(p_session_token);

  if coalesce(p_endpoint,'') = ''
     or coalesce(p_p256dh,'') = ''
     or coalesce(p_auth,'') = '' then
    raise exception 'invalid_push_subscription';
  end if;

  insert into public.owner_push_subscriptions(
    owner_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    launch_url,
    active,
    updated_at
  )
  values(
    v_owner_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    coalesce(p_user_agent,''),
    coalesce(nullif(p_launch_url,''),'./pilotage.html'),
    true,
    now()
  )
  on conflict(endpoint) do update set
    owner_id = excluded.owner_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    launch_url = excluded.launch_url,
    active = true,
    updated_at = now();

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_set_day_off_v2(p_session_token text, p_employee_id uuid, p_work_date date, p_is_off boolean, p_validation_status text DEFAULT 'pending'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  if p_validation_status not in ('pending','validated') then raise exception 'invalid_validation_status'; end if;

  if coalesce(p_is_off,false) then
    delete from public.work_segments
    where employee_id=p_employee_id and work_date=p_work_date;

    insert into public.work_entries(
      employee_id,work_date,status,arrival,departure,pause_minutes,pause_mode,comment,
      arrival_mode,departure_mode,validation_status,validated_at,validated_by,updated_at
    ) values(
      p_employee_id,p_work_date,'off',null,null,0,'manual','',
      '','',p_validation_status,
      case when p_validation_status='validated' then now() else null end,
      case when p_validation_status='validated' then 'owner' else '' end,
      now()
    )
    on conflict(employee_id,work_date) do update set
      status='off',arrival=null,departure=null,pause_minutes=0,pause_mode='manual',
      arrival_mode='',departure_mode='',validation_status=excluded.validation_status,
      validated_at=excluded.validated_at,validated_by=excluded.validated_by,updated_at=now();
  else
    insert into public.work_entries(
      employee_id,work_date,status,pause_minutes,pause_mode,validation_status,updated_at
    ) values(
      p_employee_id,p_work_date,'worked',90,'auto','',now()
    )
    on conflict(employee_id,work_date) do update set
      status='worked',
      pause_minutes=case when work_entries.status='off' then 90 else work_entries.pause_minutes end,
      pause_mode=case when work_entries.status='off' then 'auto' else work_entries.pause_mode end,
      validation_status='',validated_at=null,validated_by='',updated_at=now();
  end if;

  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','v2_owner_set_day_off',p_work_date,jsonb_build_object('is_off',coalesce(p_is_off,false)));

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_set_employee_employer(p_session_token text, p_employee_id uuid, p_employer_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  if not exists(select 1 from public.employees where id=p_employee_id and active=true) then
    raise exception 'employee_not_found';
  end if;
  if not exists(select 1 from public.employers where id=p_employer_id) then
    raise exception 'employer_not_found';
  end if;

  insert into public.employee_employers(employee_id,employer_id,active,updated_at)
  values(p_employee_id,p_employer_id,coalesce(p_active,false),now())
  on conflict(employee_id,employer_id) do update set
    active=excluded.active,
    updated_at=now();

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_set_employee_settings(p_session_token text, p_employee_id uuid, p_weekly_objective_minutes integer, p_overtime_threshold_minutes integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  update public.employees set
    weekly_objective_minutes=greatest(coalesce(p_weekly_objective_minutes,0),0),
    overtime_threshold_minutes=greatest(coalesce(p_overtime_threshold_minutes,0),0),
    updated_at=now()
  where id=p_employee_id;
  if not found then raise exception 'employee_not_found'; end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_set_employer_active(p_session_token text, p_employer_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  update public.employers
  set active=coalesce(p_active,false), updated_at=now()
  where id=p_employer_id;
  if not found then raise exception 'employer_not_found'; end if;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_set_schedule(p_session_token text, p_employee_id uuid, p_work_date date, p_is_working boolean, p_note text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  insert into public.work_schedule(employee_id,work_date,is_working,note,updated_at)
  values(p_employee_id,p_work_date,p_is_working,coalesce(p_note,''),now())
  on conflict(employee_id,work_date) do update set
    is_working=excluded.is_working,note=excluded.note,updated_at=now();
  insert into public.audit_log(employee_id,actor_role,action,work_date,details)
  values(p_employee_id,'owner','set_schedule',p_work_date,jsonb_build_object('is_working',p_is_working));
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_v2_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);

  return jsonb_build_object(
    'employers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'active', active,
        'sort_order', sort_order
      ) order by sort_order, name)
      from public.employers
    ), '[]'::jsonb),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', employee_id,
        'employer_id', employer_id,
        'active', active
      ))
      from public.employee_employers
    ), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'employee_id', s.employee_id,
        'work_date', s.work_date,
        'employer_id', s.employer_id,
        'employer_name', e.name,
        'start_time', to_char(s.start_time,'HH24:MI'),
        'end_time', case when s.end_time is null then null else to_char(s.end_time,'HH24:MI') end,
        'source', s.source,
        'comment', s.comment,
        'updated_at', s.updated_at
      ) order by s.work_date, s.start_time, s.employee_id)
      from public.work_segments s
      join public.employers e on e.id=s.employer_id
      where s.work_date between p_from and p_to
    ), '[]'::jsonb),
    'leaves', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'employee_id', l.employee_id,
        'start_date', l.start_date,
        'end_date', l.end_date,
        'leave_type', l.leave_type,
        'status', l.status,
        'note', l.note,
        'requested_by', l.requested_by,
        'reviewed_at', l.reviewed_at,
        'reviewed_by', l.reviewed_by,
        'created_at', l.created_at
      ) order by l.start_date desc, l.employee_id)
      from public.leave_requests l
      where l.end_date >= p_from
        and l.start_date <= p_to
    ), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.api_owner_validate_entry(p_session_token text, p_employee_id uuid, p_work_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  v_owner := public._assert_owner(p_session_token);
  update public.work_entries
  set validation_status='validated',validated_at=now(),validated_by='owner',updated_at=now()
  where employee_id=p_employee_id and work_date=p_work_date
    and (status='off' or (arrival is not null and departure is not null));
  if not found then raise exception 'entry_not_complete'; end if;
  insert into public.audit_log(employee_id,actor_role,action,work_date)
  values(p_employee_id,'owner','validate_entry',p_work_date);
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.system_deactivate_push_subscription(p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.push_subscriptions
  set active=false,updated_at=now()
  where endpoint=p_endpoint;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.system_get_reminder_batch(p_work_date date)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.system_get_reminder_batch(p_work_date,false);
$function$
;

CREATE OR REPLACE FUNCTION public.system_get_reminder_batch(p_work_date date, p_ignore_log boolean)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$

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

$function$
;

CREATE OR REPLACE FUNCTION public.system_mark_push_success(p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.push_subscriptions
  set last_success_at=now(),active=true,updated_at=now()
  where endpoint=p_endpoint;
  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.system_record_reminder_success(p_employee_id uuid, p_work_date date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.reminder_log(employee_id,work_date,reminder_type,sent_at)
  values(p_employee_id,p_work_date,'missing_hours',now())
  on conflict(employee_id,work_date,reminder_type) do nothing;
  return true;
end;
$function$
;

-- ---------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------

CREATE TRIGGER rtt_guard_entries BEFORE INSERT OR UPDATE ON public.work_entries FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_work();
CREATE TRIGGER rtt_guard_leave BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_leave();
CREATE TRIGGER rtt_guard_segments BEFORE INSERT OR UPDATE ON public.work_segments FOR EACH ROW EXECUTE FUNCTION public._rtt_guard_work();

-- [supabase-only:start] Active automatiquement la RLS sur toute nouvelle table de public.
CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
-- [supabase-only:end]

-- ---------------------------------------------------------------------
-- Droits d'accès
-- Le navigateur (rôles anon / authenticated) n'a accès à AUCUNE table :
-- il ne peut qu'appeler les fonctions RPC listées ci-dessous.
-- ---------------------------------------------------------------------

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.app_sessions TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.audit_log TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.employee_employers TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.employee_offline_events TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.employees TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.employers TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.leave_requests TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.login_rate_limits TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.owner_accounts TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.owner_push_subscriptions TO service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.owner_summary_log TO service_role;
GRANT SELECT, USAGE ON public.owner_summary_log_id_seq TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.push_subscriptions TO service_role;
GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON public.reminder_log TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.work_entries TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.work_schedule TO service_role;
GRANT MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON public.work_segments TO service_role;

GRANT EXECUTE ON FUNCTION public._assert_owner(p_session_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public._new_session_token() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._session_employee_id(p_session_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public._session_token_hash(p_token text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_cancel_leave(p_session_token text, p_leave_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_cancel_leave_offline(p_session_token text, p_leave_id uuid, p_client_event_id text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_change_pin(p_session_token text, p_current_pin text, p_new_pin text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_data(p_session_token text, p_from date, p_to date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_day_state_version(p_session_token text, p_work_date date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_delete_segment_offline(p_session_token text, p_segment_id uuid, p_client_event_id text, p_expected_updated_at timestamp with time zone) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_login(p_link_token text, p_pin text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_login_internal(p_link_token text, p_pin text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_remove_push_subscription(p_session_token text, p_endpoint text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_replace_day_v2(p_session_token text, p_work_date date, p_segments jsonb, p_pause_minutes integer, p_comment text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave(p_session_token text, p_start_date date, p_end_date date, p_note text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave_offline(p_session_token text, p_start_date date, p_end_date date, p_note text, p_client_event_id text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave_typed(p_session_token text, p_start_date date, p_end_date date, p_note text, p_leave_type text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_request_leave_typed_offline(p_session_token text, p_start_date date, p_end_date date, p_note text, p_client_event_id text, p_leave_type text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_save_entry(p_session_token text, p_work_date date, p_status text, p_arrival text, p_departure text, p_pause_minutes integer, p_comment text, p_arrival_mode text, p_departure_mode text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_employee_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_launch_url text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_set_day_off_v2(p_session_token text, p_work_date date, p_is_off boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_set_day_status_offline(p_session_token text, p_work_date date, p_is_off boolean, p_client_event_id text, p_expected_entry_updated_at timestamp with time zone, p_expected_segment_updated_at timestamp with time zone, p_expected_schedule_updated_at timestamp with time zone) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_start_segment(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_start_segment_manual(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_start_segment_offline(p_session_token text, p_work_date date, p_employer_id uuid, p_start_time text, p_mode text, p_client_event_id text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_stop_segment(p_session_token text, p_segment_id uuid, p_end_time text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_stop_segment_manual(p_session_token text, p_segment_id uuid, p_end_time text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_stop_segment_offline(p_session_token text, p_segment_id uuid, p_end_time text, p_mode text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_update_day_meta_offline(p_session_token text, p_work_date date, p_pause_minutes integer, p_comment text, p_client_event_id text, p_expected_entry_updated_at timestamp with time zone, p_expected_segment_updated_at timestamp with time zone) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_update_day_meta_v2(p_session_token text, p_work_date date, p_pause_minutes integer, p_comment text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_employee_v2_data(p_session_token text, p_from date, p_to date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_logout(p_session_token text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_change_pin(p_session_token text, p_current_pin text, p_new_pin text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_create_employer(p_session_token text, p_name text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_create_leave(p_session_token text, p_employee_id uuid, p_start_date date, p_end_date date, p_note text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_create_leave_typed(p_session_token text, p_employee_id uuid, p_start_date date, p_end_date date, p_note text, p_leave_type text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_data(p_session_token text, p_from date, p_to date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_delete_leave(p_session_token text, p_leave_id uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_login(p_link_token text, p_pin text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_login_internal(p_link_token text, p_pin text) TO service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_push_subscription_status(p_session_token text, p_endpoint text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_remove_push_subscription(p_session_token text, p_endpoint text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_replace_day_v2(p_session_token text, p_employee_id uuid, p_work_date date, p_segments jsonb, p_pause_minutes integer, p_comment text, p_validation_status text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_review_leave(p_session_token text, p_leave_id uuid, p_status text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_save_entry(p_session_token text, p_employee_id uuid, p_work_date date, p_status text, p_arrival text, p_departure text, p_pause_minutes integer, p_comment text, p_validation_status text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_launch_url text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_day_off_v2(p_session_token text, p_employee_id uuid, p_work_date date, p_is_off boolean, p_validation_status text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_employee_employer(p_session_token text, p_employee_id uuid, p_employer_id uuid, p_active boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_employee_settings(p_session_token text, p_employee_id uuid, p_weekly_objective_minutes integer, p_overtime_threshold_minutes integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_set_employer_active(p_session_token text, p_employer_id uuid, p_active boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_schedule(p_session_token text, p_employee_id uuid, p_work_date date, p_is_working boolean, p_note text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_v2_data(p_session_token text, p_from date, p_to date) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_validate_entry(p_session_token text, p_employee_id uuid, p_work_date date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
GRANT EXECUTE ON FUNCTION public.system_deactivate_push_subscription(p_endpoint text) TO service_role;
GRANT EXECUTE ON FUNCTION public.system_get_reminder_batch(p_work_date date) TO service_role;
GRANT EXECUTE ON FUNCTION public.system_get_reminder_batch(p_work_date date, p_ignore_log boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.system_mark_push_success(p_endpoint text) TO service_role;
GRANT EXECUTE ON FUNCTION public.system_record_reminder_success(p_employee_id uuid, p_work_date date) TO service_role;

-- ---------------------------------------------------------------------
-- [supabase-only:start] Tâche planifiée : appelle la fonction send-reminders
-- 5 minutes après chaque heure (elle décide elle-même s'il est 19 h à Paris).
--
-- Prérequis : créer d'abord ces trois secrets dans le coffre-fort Supabase
-- (Project Settings → Vault), avec les valeurs du nouveau projet :
--   hours_project_url       URL du projet (https://<ref>.supabase.co)
--   hours_publishable_key   clé publishable du projet
--   hours_cron_secret       même valeur que le secret CRON_SECRET de l'Edge Function
-- ---------------------------------------------------------------------
SELECT cron.schedule('suivi-horaires-reminder-hourly', '5 * * * *', $cron$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'hours_project_url'
    ) || '/functions/v1/send-reminders',

    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'hours_publishable_key'
      ),
      'x-cron-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'hours_cron_secret'
      )
    ),

    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
$cron$);
-- [supabase-only:end]

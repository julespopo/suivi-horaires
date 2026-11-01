-- Isolated PGlite fixture only. Never run against an application database.
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE TABLE public.employees(id uuid PRIMARY KEY,name text,active boolean DEFAULT true);
CREATE TABLE public.employers(id uuid PRIMARY KEY,name text,active boolean DEFAULT true);
CREATE TABLE public.employee_employers(employee_id uuid,employer_id uuid,active boolean);
CREATE TABLE public.work_entries(id uuid DEFAULT gen_random_uuid(),employee_id uuid,work_date date,status text,arrival time,departure time,pause_minutes int DEFAULT 0,pause_mode text DEFAULT 'auto',comment text DEFAULT '',arrival_mode text,departure_mode text,validation_status text,validated_at timestamptz,validated_by text,updated_at timestamptz DEFAULT now(),UNIQUE(employee_id,work_date));
CREATE TABLE public.work_segments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid,work_date date,employer_id uuid,start_time time,end_time time,source text,comment text,updated_at timestamptz DEFAULT now());
CREATE TABLE public.leave_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_id uuid REFERENCES public.employees(id),start_date date NOT NULL,end_date date NOT NULL,leave_type text NOT NULL DEFAULT 'paid_leave',status text,note text,requested_by text,reviewed_at timestamptz,reviewed_by text,updated_at timestamptz);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_segments ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.audit_log(employee_id uuid,actor_role text,actor_employee_id uuid,action text,work_date date,details jsonb);
CREATE TABLE public.employee_offline_events(employee_id uuid,client_event_id text,event_type text,result jsonb,UNIQUE(employee_id,client_event_id));
CREATE TABLE public.work_schedule(employee_id uuid,work_date date,is_working boolean);
CREATE TABLE public.reminder_log(employee_id uuid,work_date date,reminder_type text);
CREATE TABLE public.push_subscriptions(id uuid,employee_id uuid,endpoint text,p256dh text,auth text,launch_url text,active boolean);
-- Tokens below exist only in this fixture, with no real user/session data.
CREATE FUNCTION public._session_employee_id(token text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
 IF token='employee-a' THEN RETURN '00000000-0000-0000-0000-000000000001'; END IF;
 IF token='employee-b' THEN RETURN '00000000-0000-0000-0000-000000000002'; END IF;
 RAISE EXCEPTION 'unauthorized'; END $$;
CREATE FUNCTION public._assert_owner(token text) RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN
 IF token='owner' THEN RETURN '00000000-0000-0000-0000-000000000003'; END IF;
 RAISE EXCEPTION 'unauthorized'; END $$;
INSERT INTO public.employees(id,name) VALUES('00000000-0000-0000-0000-000000000001','Fictif A'),('00000000-0000-0000-0000-000000000002','Fictif B');
INSERT INTO public.employers(id,name) VALUES('00000000-0000-0000-0000-000000000004','Employeur fictif');
INSERT INTO public.employee_employers SELECT id,'00000000-0000-0000-0000-000000000004',true FROM public.employees;

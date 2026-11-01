-- One-time production launch reset, explicitly including future test planning/leaves.
-- Keep accounts, PIN hashes, private links, employers, assignments and push settings.
-- The private snapshot contains no account/session credentials; never expose it via API.
CREATE SCHEMA launch_backup_20261102;
REVOKE ALL ON SCHEMA launch_backup_20261102 FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text; snapshot_count bigint; live_count bigint;
BEGIN
 -- Freeze app writes for a consistent snapshot and atomic reset.
 LOCK TABLE public.work_entries,public.work_segments,public.work_schedule,
 public.leave_requests,public.audit_log,public.employee_offline_events,
 public.reminder_log,public.owner_summary_log,public.app_sessions IN ACCESS EXCLUSIVE MODE;
 FOREACH t IN ARRAY ARRAY['work_entries','work_segments','work_schedule','leave_requests',
   'audit_log','employee_offline_events','reminder_log','owner_summary_log'] LOOP
   EXECUTE format('CREATE TABLE launch_backup_20261102.%I AS TABLE public.%I', 'prelaunch_20261102_'||t,t);
   EXECUTE format('REVOKE ALL ON TABLE launch_backup_20261102.%I FROM PUBLIC,anon,authenticated','prelaunch_20261102_'||t);
   EXECUTE format('ALTER TABLE launch_backup_20261102.%I ENABLE ROW LEVEL SECURITY','prelaunch_20261102_'||t);
   EXECUTE format('SELECT count(*) FROM launch_backup_20261102.%I','prelaunch_20261102_'||t) INTO snapshot_count;
   EXECUTE format('SELECT count(*) FROM public.%I',t) INTO live_count;
   IF snapshot_count<>live_count THEN RAISE EXCEPTION 'launch_snapshot_mismatch'; END IF;
 END LOOP;
 DELETE FROM public.work_segments;
 DELETE FROM public.work_entries;
 DELETE FROM public.work_schedule;
 DELETE FROM public.leave_requests;
 DELETE FROM public.audit_log;
 DELETE FROM public.employee_offline_events;
 DELETE FROM public.reminder_log;
 DELETE FROM public.owner_summary_log;
 -- Reject pending writes from previously signed-in browsers, including future tests.
 DELETE FROM public.app_sessions;
END;
$$;

-- Old PWA versions must not recreate preparation data after reconnecting.
ALTER TABLE public.work_entries ADD CONSTRAINT work_entries_launch_date_ck CHECK (work_date>=DATE '2026-11-02');
ALTER TABLE public.work_segments ADD CONSTRAINT work_segments_launch_date_ck CHECK (work_date>=DATE '2026-11-02');
ALTER TABLE public.work_schedule ADD CONSTRAINT work_schedule_launch_date_ck CHECK (work_date>=DATE '2026-11-02');
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_launch_date_ck CHECK (start_date>=DATE '2026-11-02');

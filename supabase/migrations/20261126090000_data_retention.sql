-- Durées de conservation (RGPD, art. 5-1-e) : suppression automatique des données
-- arrivées au terme de leur durée de conservation, telle qu'annoncée aux salariés sur
-- la page « Mentions légales et données personnelles » (confidentialite.html).
--
-- • Heures, créneaux, planning, congés/RTT, reports du compte temps et journal des
--   modifications : 3 ans après la fin de la période de compte temps (1er mai → 30 avril)
--   à laquelle ils se rattachent (prescription des salaires, art. L3245-1 du code du
--   travail ; minimum légal d'un an, art. D3171-16).
-- • Traces techniques (rappels envoyés, synthèses envoyées, saisies hors ligne) : 1 an.
-- • Abonnements aux notifications désactivés : 3 mois.
-- • Sessions : à expiration, ou après 13 mois sans utilisation.
-- • Compteurs d'essais de PIN : 30 jours.
--
-- Les données de lancement datent du 02/11/2026 : rien ne sera supprimé avant mai 2030.

CREATE FUNCTION public._purge_expired_data(p_today date DEFAULT current_date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_period_start date := make_date(
    extract(year from p_today)::int - case when extract(month from p_today) >= 5 then 0 else 1 end,
    5, 1);
  v_hours_cutoff date := (v_period_start - interval '3 years')::date;
  v_result jsonb := '{}'::jsonb;
  v_n integer;
begin
  delete from public.work_segments where work_date < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('work_segments', v_n);
  delete from public.work_entries where work_date < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('work_entries', v_n);
  delete from public.work_schedule where work_date < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('work_schedule', v_n);
  delete from public.leave_requests where end_date < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('leave_requests', v_n);
  delete from public.compte_temps_reports where effective_date < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('compte_temps_reports', v_n);
  delete from public.audit_log
   where coalesce(work_date, created_at::date) < v_hours_cutoff;
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('audit_log', v_n);

  delete from public.reminder_log where sent_at < p_today - interval '1 year';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('reminder_log', v_n);
  delete from public.owner_summary_log where sent_at < p_today - interval '1 year';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('owner_summary_log', v_n);
  delete from public.employee_offline_events where created_at < p_today - interval '1 year';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('employee_offline_events', v_n);

  delete from public.push_subscriptions
   where not active and updated_at < p_today - interval '3 months';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('push_subscriptions', v_n);
  delete from public.owner_push_subscriptions
   where not active and updated_at < p_today - interval '3 months';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('owner_push_subscriptions', v_n);
  delete from public.app_sessions
   where expires_at < p_today or last_seen_at < p_today - interval '13 months';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('app_sessions', v_n);
  delete from public.login_rate_limits where updated_at < p_today - interval '30 days';
  get diagnostics v_n = row_count; v_result := v_result || jsonb_build_object('login_rate_limits', v_n);

  return v_result || jsonb_build_object('hours_cutoff', v_hours_cutoff);
end;
$function$;

-- Fonction interne : jamais appelable depuis le navigateur.
REVOKE ALL ON FUNCTION public._purge_expired_data(date) FROM PUBLIC, anon, authenticated, service_role;

-- Exécution automatique le 2 de chaque mois à 03:17 (UTC), là où pg_cron existe (Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('suivi-horaires-purge-monthly', '17 3 2 * *',
      'select public._purge_expired_data()');
  END IF;
END $$;

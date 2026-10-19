-- Suivi horaires — permissions Edge Function + durcissement RPC internes
-- Date : 2026-10-19
--
-- Objectifs :
-- 1. Autoriser uniquement le rôle serveur service_role à lire/mettre à jour
--    les tables nécessaires à send-reminders.
-- 2. Retirer l'accès navigateur aux helpers SECURITY DEFINER et RPC system_*.
--
-- Les RPC applicatives api_employee_* et api_owner_* restent accessibles :
-- elles constituent volontairement l'API publique du navigateur et valident
-- elles-mêmes le token de session applicatif.

begin;

-- Lecture nécessaire à la synthèse quotidienne Pilotage.
grant select on table
  public.employees,
  public.work_schedule,
  public.work_entries,
  public.work_segments,
  public.leave_requests,
  public.owner_accounts,
  public.owner_push_subscriptions,
  public.owner_summary_log
to service_role;

-- Mise à jour de l'état des abonnements Pilotage après un envoi push.
grant update on table public.owner_push_subscriptions to service_role;

-- Journalisation de la synthèse Pilotage envoyée.
grant insert on table public.owner_summary_log to service_role;

-- L'identité de owner_summary_log peut utiliser une séquence selon la version
-- PostgreSQL / définition exacte de la colonne.
do $$
declare
  v_seq text;
begin
  v_seq := pg_get_serial_sequence('public.owner_summary_log', 'id');
  if v_seq is not null then
    execute format('grant usage, select on sequence %s to service_role', v_seq);
  end if;
end
$$;

-- Helpers de session : utilisables uniquement depuis les fonctions serveur
-- qui les appellent sous leur contexte SECURITY DEFINER.
revoke execute on function public._assert_owner(text)
  from public, anon, authenticated;
revoke execute on function public._session_employee_id(text)
  from public, anon, authenticated;

-- Event trigger interne : aucune raison de l'exposer via PostgREST.
revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;

-- RPC réservées à l'Edge Function de rappels.
revoke execute on function public.system_deactivate_push_subscription(text)
  from public, anon, authenticated;
revoke execute on function public.system_mark_push_success(text)
  from public, anon, authenticated;
revoke execute on function public.system_record_reminder_success(uuid,date)
  from public, anon, authenticated;

grant execute on function public.system_deactivate_push_subscription(text)
  to service_role;
grant execute on function public.system_mark_push_success(text)
  to service_role;
grant execute on function public.system_record_reminder_success(uuid,date)
  to service_role;

commit;

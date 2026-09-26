-- V1.8.2 — sessions conservées jusqu'à déconnexion manuelle.
-- Les lignes de session sont supprimées par api_logout().
-- 'infinity' est une valeur timestamptz native de PostgreSQL.

update public.app_sessions
set expires_at = 'infinity'::timestamptz;

alter table public.app_sessions
  alter column expires_at set default 'infinity'::timestamptz;

-- Les fonctions de login actuelles renseignent encore explicitement une échéance.
-- Ce trigger force les nouvelles sessions à rester ouvertes, quelle que soit
-- la valeur fournie au moment de l'insertion.
create or replace function public._session_keep_open_until_logout()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.expires_at := 'infinity'::timestamptz;
  return new;
end;
$function$;

drop trigger if exists trg_session_keep_open_until_logout
on public.app_sessions;

create trigger trg_session_keep_open_until_logout
before insert on public.app_sessions
for each row
execute function public._session_keep_open_until_logout();

revoke all on function public._session_keep_open_until_logout() from public, anon, authenticated;

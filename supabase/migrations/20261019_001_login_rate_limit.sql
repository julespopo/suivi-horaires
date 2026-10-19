-- Suivi horaires — limitation des tentatives de PIN
-- Date : 2026-10-19
--
-- Politique :
-- - 5 échecs maximum sur une fenêtre de 15 minutes ;
-- - blocage de 15 minutes au 5e échec ;
-- - compteur remis à zéro après une connexion réussie ;
-- - limitation par lien privé, sans stocker le lien lui-même.
--
-- Cette migration conserve les mêmes noms RPC publics
-- api_employee_login(...) et api_owner_login(...), de sorte que les
-- anciens clients continuent à appeler la même API.

begin;

create table if not exists public.login_rate_limits (
  subject_kind text not null check (subject_kind in ('employee','owner')),
  subject_hash text not null,
  failed_count integer not null default 0 check (failed_count >= 0),
  window_started_at timestamptz not null default clock_timestamp(),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (subject_kind, subject_hash)
);

alter table public.login_rate_limits enable row level security;
revoke all on table public.login_rate_limits from public, anon, authenticated;

comment on table public.login_rate_limits is
  'Compteurs serveur anti-bruteforce des PIN, indexés par hash du lien privé.';

-- Vérifie que les signatures attendues existent avant toute modification.
do $$
begin
  if to_regprocedure('public.api_employee_login(text,text)') is null
     and to_regprocedure('public.api_employee_login_internal(text,text)') is null then
    raise exception 'api_employee_login(text,text) introuvable';
  end if;

  if to_regprocedure('public.api_owner_login(text,text)') is null
     and to_regprocedure('public.api_owner_login_internal(text,text)') is null then
    raise exception 'api_owner_login(text,text) introuvable';
  end if;
end
$$;

-- Une première exécution renomme les fonctions existantes.
-- Une réexécution de la migration laisse les fonctions internes en place.
do $$
begin
  if to_regprocedure('public.api_employee_login_internal(text,text)') is null then
    alter function public.api_employee_login(text,text)
      rename to api_employee_login_internal;
  end if;

  if to_regprocedure('public.api_owner_login_internal(text,text)') is null then
    alter function public.api_owner_login(text,text)
      rename to api_owner_login_internal;
  end if;
end
$$;

-- Les fonctions internes ne doivent plus être appelables depuis le navigateur.
revoke execute on function public.api_employee_login_internal(text,text)
  from public, anon, authenticated;
revoke execute on function public.api_owner_login_internal(text,text)
  from public, anon, authenticated;

create or replace function public.api_employee_login(
  p_link_token text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := md5(coalesce(p_link_token,''));
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

  begin
    select to_jsonb(public.api_employee_login_internal(p_link_token,p_pin))
      into v_result;
  exception when others then
    v_result := null;
  end;

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
$$;

create or replace function public.api_owner_login(
  p_link_token text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := md5(coalesce(p_link_token,''));
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

  begin
    select to_jsonb(public.api_owner_login_internal(p_link_token,p_pin))
      into v_result;
  exception when others then
    v_result := null;
  end;

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
$$;

revoke all on function public.api_employee_login(text,text) from public;
revoke all on function public.api_owner_login(text,text) from public;
grant execute on function public.api_employee_login(text,text) to anon, authenticated;
grant execute on function public.api_owner_login(text,text) to anon, authenticated;

comment on function public.api_employee_login(text,text) is
  'Connexion salarié protégée contre les tentatives répétées de PIN.';
comment on function public.api_owner_login(text,text) is
  'Connexion pilotage protégée contre les tentatives répétées de PIN.';

commit;

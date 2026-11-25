-- Comptes Pilotage « consultation » : mêmes droits de lecture que le Pilotage,
-- aucune modification possible (refus côté serveur, message 'read_only').
--
-- _assert_owner        : utilisé par toutes les fonctions qui MODIFIENT → réservé aux comptes admin.
-- _assert_owner_read   : utilisé par les fonctions de LECTURE → tout compte Pilotage actif.
-- Les comptes consultation sont créés / désactivés par un admin depuis le Pilotage ;
-- le PIN est choisi par l'admin et n'est jamais stocké en clair.

ALTER TABLE public.owner_accounts ADD COLUMN access text NOT NULL DEFAULT 'admin';
ALTER TABLE public.owner_accounts ADD CONSTRAINT owner_accounts_access_check CHECK (access IN ('admin', 'viewer'));

CREATE FUNCTION public._assert_owner_read(p_session_token text)
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
$function$;

CREATE OR REPLACE FUNCTION public._assert_owner(p_session_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid;
BEGIN
 v_id := public._assert_owner_read(p_session_token);
 IF NOT EXISTS (SELECT 1 FROM public.owner_accounts WHERE id = v_id AND access = 'admin') THEN
   RAISE EXCEPTION 'read_only';
 END IF;
 RETURN v_id;
END;
$function$;

-- Fonctions de lecture : accessibles aussi en consultation (corps identiques, seul le contrôle change ;
-- api_owner_data renvoie en plus le niveau d'accès du compte connecté).
CREATE OR REPLACE FUNCTION public.api_owner_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._assert_owner_read(p_session_token);

  return jsonb_build_object(
    'access',(select access from public.owner_accounts where id=v_owner),
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

CREATE OR REPLACE FUNCTION public.api_owner_v2_data(p_session_token text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  v_owner := public._assert_owner_read(p_session_token);

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

CREATE OR REPLACE FUNCTION public.api_owner_compte_temps_reports(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._assert_owner_read(p_session_token);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'employee_id', r.employee_id,
      'effective_date', r.effective_date,
      'minutes', r.minutes,
      'note', r.note
    ) ORDER BY r.effective_date, r.employee_id)
    FROM public.compte_temps_reports r
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.api_owner_push_subscription_status(p_session_token text, p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner_read(p_session_token);

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

CREATE OR REPLACE FUNCTION public.api_owner_save_push_subscription(p_session_token text, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT ''::text, p_launch_url text DEFAULT './pilotage.html'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner_read(p_session_token);

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

CREATE OR REPLACE FUNCTION public.api_owner_remove_push_subscription(p_session_token text, p_endpoint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
begin
  v_owner_id := public._assert_owner_read(p_session_token);

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

-- Gestion des comptes consultation (admin uniquement).
CREATE FUNCTION public.api_owner_viewers(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._assert_owner(p_session_token);
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'active', o.active, 'created_at', o.created_at)
                     ORDER BY o.created_at)
    FROM public.owner_accounts o WHERE o.access = 'viewer'
  ), '[]'::jsonb);
END;
$function$;

CREATE FUNCTION public.api_owner_create_viewer(p_session_token text, p_label text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner uuid; v_label text := btrim(coalesce(p_label, '')); v_token text; v_id uuid;
BEGIN
  v_owner := public._assert_owner(p_session_token);
  IF length(v_label) < 2 OR length(v_label) > 60 THEN RAISE EXCEPTION 'invalid_label'; END IF;
  IF coalesce(p_pin, '') !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid_new_pin'; END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.owner_accounts(label, link_token, pin_hash, access, active)
  VALUES (v_label, v_token, extensions.crypt(p_pin, extensions.gen_salt('bf')), 'viewer', true)
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log(actor_role, action, details)
  VALUES ('owner', 'create_viewer', jsonb_build_object('viewer_id', v_id, 'by', v_owner));
  RETURN jsonb_build_object('id', v_id, 'link_token', v_token);
END;
$function$;

-- Désactiver ferme aussi immédiatement les sessions ouvertes de ce compte.
CREATE FUNCTION public.api_owner_set_viewer_active(p_session_token text, p_viewer_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_owner uuid;
BEGIN
  v_owner := public._assert_owner(p_session_token);
  UPDATE public.owner_accounts SET active = coalesce(p_active, false), updated_at = now()
   WHERE id = p_viewer_id AND access = 'viewer';
  IF NOT FOUND THEN RAISE EXCEPTION 'viewer_not_found'; END IF;
  IF NOT coalesce(p_active, false) THEN
    DELETE FROM public.app_sessions WHERE owner_id = p_viewer_id;
  END IF;
  INSERT INTO public.audit_log(actor_role, action, details)
  VALUES ('owner', 'set_viewer_active', jsonb_build_object('viewer_id', p_viewer_id, 'active', coalesce(p_active, false), 'by', v_owner));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public._assert_owner_read(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._assert_owner_read(text) TO service_role;
REVOKE ALL ON FUNCTION public.api_owner_viewers(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_owner_create_viewer(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_owner_set_viewer_active(text, uuid, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_viewers(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_create_viewer(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_viewer_active(text, uuid, boolean) TO anon, authenticated;

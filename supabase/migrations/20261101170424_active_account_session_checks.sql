-- Existing session tokens must stop authorizing writes when an account is disabled.
-- Keep the established PIN/link session API and the existing helper privileges.
CREATE OR REPLACE FUNCTION public._session_employee_id(p_session_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
$$;
CREATE OR REPLACE FUNCTION public._assert_owner(p_session_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
$$;
REVOKE ALL ON FUNCTION public._session_employee_id(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public._assert_owner(text) FROM PUBLIC,anon,authenticated;

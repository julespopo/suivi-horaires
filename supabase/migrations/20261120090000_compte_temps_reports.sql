-- Reports du compte temps : solde d'heures à reprendre pour un salarié à une date donnée
-- (ex. compte temps calculé à la main avant l'arrivée de l'appli, au 01/11/2026).
-- Le report s'ajoute au solde de la période (1er mai → 30 avril) qui contient sa date.
CREATE TABLE public.compte_temps_reports (
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  minutes integer NOT NULL CHECK (minutes BETWEEN -100000 AND 100000),
  note text NOT NULL DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, effective_date)
);
ALTER TABLE public.compte_temps_reports ENABLE ROW LEVEL SECURITY;
-- Comme les autres tables : aucun accès direct depuis le navigateur.
REVOKE ALL ON public.compte_temps_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.compte_temps_reports TO backup_reader;

CREATE FUNCTION public.api_owner_compte_temps_reports(p_session_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._assert_owner(p_session_token);
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

-- p_minutes nul ou 0 : supprime le report de cette date.
CREATE FUNCTION public.api_owner_set_compte_temps_report(p_session_token text, p_employee_id uuid, p_effective_date date, p_minutes integer, p_note text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public._assert_owner(p_session_token);
  IF p_effective_date IS NULL THEN RAISE EXCEPTION 'invalid_date'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee_id) THEN
    RAISE EXCEPTION 'employee_not_found';
  END IF;
  IF coalesce(p_minutes, 0) = 0 THEN
    DELETE FROM public.compte_temps_reports
     WHERE employee_id = p_employee_id AND effective_date = p_effective_date;
  ELSE
    INSERT INTO public.compte_temps_reports(employee_id, effective_date, minutes, note, updated_at)
    VALUES (p_employee_id, p_effective_date, p_minutes, coalesce(p_note, ''), now())
    ON CONFLICT (employee_id, effective_date) DO UPDATE
      SET minutes = excluded.minutes, note = excluded.note, updated_at = now();
  END IF;
  INSERT INTO public.audit_log(employee_id, actor_role, action, work_date, details)
  VALUES (p_employee_id, 'owner', 'set_compte_temps_report', p_effective_date,
          jsonb_build_object('minutes', coalesce(p_minutes, 0)));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.api_owner_compte_temps_reports(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.api_owner_set_compte_temps_report(text, uuid, date, integer, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.api_owner_compte_temps_reports(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_owner_set_compte_temps_report(text, uuid, date, integer, text) TO anon, authenticated;

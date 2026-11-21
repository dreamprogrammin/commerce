-- Ключ Vercel для расхода и сборок в админке (21 ноября 2026).
--
-- Владелец 21.11, после перехода на Pro: «а ты можешь взять и в версел данные и
-- показывать в админке и давать подсказки туда». На Pro Vercel отдаёт расход по
-- услугам (/v1/billing/charges) и список сборок. Ключ вводит владелец в админке,
-- как ключи ИИ; лежит в Vault одной записью JSON {token, teamId, teamName},
-- сайт читает только сервером. Ключ сайта, не ключ CLI с машины разработчика.

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.vercel_key_set(text, text, text, uuid)') IS NOT NULL
     OR to_regprocedure('public.vercel_key_get()') IS NOT NULL
     OR to_regprocedure('public.vercel_key_status()') IS NOT NULL
     OR to_regprocedure('public.vercel_key_delete()') IS NOT NULL THEN
    RAISE EXCEPTION 'функции ключа Vercel уже есть';
  END IF;
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE EXCEPTION 'нет Vault';
  END IF;
END $$;

-- ── 1. Ключ ──────────────────────────────────────────────────────────────────
CREATE FUNCTION public.vercel_key_set(p_token text, p_team_id text, p_team_name text, p_admin uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text := btrim(p_token);
  v_desc text := format('Ключ Vercel, задан администратором %s', p_admin);
  v_id uuid;
BEGIN
  IF v_token IS NULL OR length(v_token) < 20 OR length(v_token) > 200 OR v_token ~ '\s' THEN
    RAISE EXCEPTION 'Ключ не похож на ключ Vercel';
  END IF;
  IF p_team_id IS NULL OR p_team_id !~ '^team_[A-Za-z0-9]{8,64}$' THEN
    RAISE EXCEPTION 'Неверная команда Vercel';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'vercel_token';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(jsonb_build_object('token', v_token, 'teamId', p_team_id, 'teamName', left(coalesce(p_team_name, ''), 100))::text, 'vercel_token', v_desc);
  ELSE
    PERFORM vault.update_secret(v_id, jsonb_build_object('token', v_token, 'teamId', p_team_id, 'teamName', left(coalesce(p_team_name, ''), 100))::text, 'vercel_token', v_desc);
  END IF;
END;
$$;

CREATE FUNCTION public.vercel_key_delete()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'vercel_token';
$$;

CREATE FUNCTION public.vercel_key_get()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret::jsonb FROM vault.decrypted_secrets WHERE name = 'vercel_token';
$$;

-- Без самого ключа: последние 4 знака, команда, когда задан
CREATE FUNCTION public.vercel_key_status()
RETURNS TABLE (last4 text, team_id text, team_name text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT right(s ->> 'token', 4), s ->> 'teamId', s ->> 'teamName', updated_at
  FROM (SELECT decrypted_secret::jsonb AS s, updated_at FROM vault.decrypted_secrets WHERE name = 'vercel_token') x;
$$;

REVOKE EXECUTE ON FUNCTION public.vercel_key_set(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vercel_key_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vercel_key_get() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vercel_key_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vercel_key_set(text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.vercel_key_delete() TO service_role;
GRANT EXECUTE ON FUNCTION public.vercel_key_get() TO service_role;
GRANT EXECUTE ON FUNCTION public.vercel_key_status() TO service_role;

-- ── 2. Проверка результата ───────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.vercel_key_get()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.vercel_key_get()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.vercel_key_status()', 'EXECUTE') THEN
    RAISE EXCEPTION 'ключ Vercel доступен гостю или покупателю';
  END IF;
END $$;

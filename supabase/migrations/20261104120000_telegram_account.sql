-- ============================================================================
-- Аккаунт Telegram для закрытых каналов поставщиков — из админки, в Vault.
--
-- Зачем (4 ноября 2026). Закрытый канал (ссылка-приглашение t.me/+…) без
-- аккаунта не читается: у него нет просмотра t.me/s/. Владелец заводит
-- отдельный аккаунт (решено 3.11), вступает им в каналы поставщиков и входит
-- в него на странице «Аккаунт Telegram» в админке — код из Telegram и пароль
-- вводятся там, а не присылаются в чат (как ключи ИИ, 20261031120000).
--
-- Как устроено:
--   * секреты — в Supabase Vault, читает только service_role (маршруты
--     админки после requireAdmin):
--       telegram_api_id, telegram_api_hash — приложение владельца с
--         my.telegram.org;
--       telegram_session — сессия после входа: полный доступ к аккаунту;
--       telegram_login — вход в процессе: временная сессия, телефон и
--         phone_code_hash между шагами «прислать код» и «войти»;
--   * telegram_account — кто вошёл: имя, @username, последние 4 цифры
--     телефона. Секретов в ней нет, строка одна;
--   * браузеру значения секретов не возвращаются никогда — только «задан» и
--     когда.
--
-- Проверка — supabase/tests/test_telegram_account.sql.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.telegram_account') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('telegram_secret_set', 'telegram_secret_get', 'telegram_secret_delete', 'telegram_secrets_status')) THEN
    RAISE EXCEPTION 'аккаунт Telegram уже заведён — миграция применялась?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION 'нет расширения supabase_vault';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'нет таблицы profiles';
  END IF;
END $$;

-- ── 1. Кто вошёл ────────────────────────────────────────────────────────────
CREATE TABLE public.telegram_account (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  user_id bigint NOT NULL,
  display_name text NOT NULL CHECK (length(display_name) <= 200),
  username text CHECK (username ~ '^[A-Za-z0-9_]{3,32}$'),
  phone_last4 text CHECK (phone_last4 ~ '^\d{4}$'),
  logged_in_at timestamptz NOT NULL DEFAULT now(),
  logged_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
COMMENT ON TABLE public.telegram_account IS
  'Аккаунт Telegram, которым читаются закрытые каналы поставщиков. Сессия — в Vault (telegram_session).';
-- Без политик: читает и пишет только service_role (маршруты админки)
ALTER TABLE public.telegram_account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_account FROM anon, authenticated;
GRANT ALL ON public.telegram_account TO service_role;

-- ── 2. Секреты в Vault ──────────────────────────────────────────────────────
CREATE FUNCTION public.telegram_secret_set(p_name text, p_value text, p_admin uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := 'telegram_' || p_name;
  v_value text := btrim(p_value);
  v_desc text := format('Telegram %s, задан администратором %s', p_name, p_admin);
  v_id uuid;
BEGIN
  IF p_name IS NULL OR p_name NOT IN ('api_id', 'api_hash', 'session', 'login') THEN
    RAISE EXCEPTION 'Секрет Telegram % не предусмотрен: только api_id, api_hash, session, login', p_name;
  END IF;
  IF v_value IS NULL
     OR (p_name = 'api_id' AND v_value !~ '^[1-9]\d{0,11}$')
     OR (p_name = 'api_hash' AND v_value !~ '^[0-9a-f]{32}$')
     OR (p_name IN ('session', 'login') AND (length(v_value) < 20 OR length(v_value) > 20000)) THEN
    RAISE EXCEPTION 'Значение не похоже на % Telegram', p_name;
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_value, v_name, v_desc);
  ELSE
    PERFORM vault.update_secret(v_id, v_value, v_name, v_desc);
  END IF;
END;
$$;

CREATE FUNCTION public.telegram_secret_get(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets
  WHERE name = 'telegram_' || p_name AND p_name IN ('api_id', 'api_hash', 'session', 'login');
$$;

CREATE FUNCTION public.telegram_secret_delete(p_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets
  WHERE name = 'telegram_' || p_name AND p_name IN ('api_id', 'api_hash', 'session', 'login');
$$;

-- Какие заданы и когда — без значений
CREATE FUNCTION public.telegram_secrets_status()
RETURNS TABLE (name text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT substr(s.name, 10), s.updated_at
  FROM vault.secrets s
  WHERE s.name IN ('telegram_api_id', 'telegram_api_hash', 'telegram_session', 'telegram_login');
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_secret_set(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.telegram_secret_get(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.telegram_secret_delete(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.telegram_secrets_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_secret_set(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_secret_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_secret_delete(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_secrets_status() TO service_role;

-- ── 3. Проверка результата ──────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.telegram_account'::regclass) THEN
    RAISE EXCEPTION 'у telegram_account не включён RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_account') THEN
    RAISE EXCEPTION 'у telegram_account есть политики — таблица должна быть закрыта';
  END IF;
  IF has_table_privilege('anon', 'public.telegram_account', 'SELECT')
     OR has_table_privilege('authenticated', 'public.telegram_account', 'SELECT') THEN
    RAISE EXCEPTION 'telegram_account видна гостю или покупателю';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.telegram_secret_set(text, text, uuid)', 'public.telegram_secret_get(text)',
    'public.telegram_secret_delete(text)', 'public.telegram_secrets_status()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% доступна гостю или покупателю', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% недоступна service_role', v_fn;
    END IF;
  END LOOP;
END $$;

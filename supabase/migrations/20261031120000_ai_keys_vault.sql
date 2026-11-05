-- ============================================================================
-- Ключи моделей ИИ — из админки, в Vault.
--
-- Владелец 31.10.2026: «не через код писать ключ API, а через прямой интерфейс
-- в админке». Ключ хранится в Supabase Vault (зашифрован в базе), читать его
-- может только сервер (service_role): маршруты админки после проверки роли и
-- функции Supabase. Браузеру ключ не возвращается никогда — только последние
-- 4 символа, чтобы узнать, какой задан.
--
-- Провайдеры — только официальные API (решение владельца 31.10.2026, см.
-- supabase/functions/_shared/supplierVision.ts): anthropic, openai, gemini.
--
-- ai_settings — выбор модели под задачу (сейчас одна: чтение постов
-- поставщиков), без секретов.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.ai_settings') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname IN ('ai_key_set', 'ai_key_get', 'ai_key_delete', 'ai_keys_status')) THEN
    RAISE EXCEPTION 'ключи ИИ уже заведены — миграция не для этой базы';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION 'нет расширения supabase_vault';
  END IF;
END $$;

CREATE TABLE public.ai_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
-- Без политик: читает и пишет только service_role (маршруты админки)
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_settings FROM anon, authenticated;

CREATE FUNCTION public.ai_key_set(p_provider text, p_key text, p_admin uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_name text := 'ai_key_' || p_provider;
  v_key text := btrim(p_key);
  v_desc text := format('Ключ %s, задан администратором %s', p_provider, p_admin);
  v_id uuid;
BEGIN
  IF p_provider NOT IN ('anthropic', 'openai', 'gemini') THEN
    RAISE EXCEPTION 'Провайдер % не разрешён: только anthropic, openai, gemini', p_provider;
  END IF;
  IF v_key IS NULL OR length(v_key) < 20 OR length(v_key) > 500 OR v_key ~ '\s' THEN
    RAISE EXCEPTION 'Ключ не похож на ключ API';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = v_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_key, v_name, v_desc);
  ELSE
    PERFORM vault.update_secret(v_id, v_key, v_name, v_desc);
  END IF;
END;
$$;

CREATE FUNCTION public.ai_key_delete(p_provider text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'ai_key_' || p_provider;
$$;

CREATE FUNCTION public.ai_key_get(p_provider text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ai_key_' || p_provider;
$$;

CREATE FUNCTION public.ai_keys_status()
RETURNS TABLE (provider text, last4 text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT substr(name, 8), right(decrypted_secret, 4), updated_at
  FROM vault.decrypted_secrets
  WHERE name IN ('ai_key_anthropic', 'ai_key_openai', 'ai_key_gemini');
$$;

REVOKE EXECUTE ON FUNCTION public.ai_key_set(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_key_delete(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_key_get(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_keys_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_key_set(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_key_delete(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_key_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_keys_status() TO service_role;
GRANT ALL ON public.ai_settings TO service_role;

-- ============================================================================
-- «Батарейки» дашборда «Умный закуп» (6 ноября 2026)
--
-- Владелец 5.11: «давай введем батарейку здоровье сколько у нас там осталась
-- таких запросов итд если есть ресет тоже можно вести». Выбраны: бюджет ИИ,
-- лимит запросов ИИ, баланс DataForSEO, сбор Telegram.
--
-- ai_usage_daily — расход токенов на чтение постов по дням и моделям. Из
-- supplier_offers его не собрать: товары старше 30 дней удаляются, а бюджет
-- (пополнение счёта провайдера) живёт дольше. Пишет сборщик одной строкой
-- на проход (server/utils/supplierOffers.ts), функцией ai_usage_add — чтобы
-- два прохода разом не затёрли друг другу счёт.
--
-- service_meters — последние показания внешних лимитов: заголовки лимитов
-- провайдера ИИ после последнего ответа, ограничение Telegram (FLOOD_WAIT).
-- Перезаписываются, истории нет.
--
-- Самого бюджета здесь нет: он — настройка ИИ, ключ 'ai_budget' в ai_settings.
-- Без этой миграции сборщик и дашборд работают, как прежде, без батареек.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.ai_settings') IS NULL THEN
    RAISE EXCEPTION 'нет ai_settings — сначала 20261031120000_ai_keys_vault';
  END IF;
  IF to_regclass('public.ai_usage_daily') IS NOT NULL OR to_regclass('public.service_meters') IS NOT NULL THEN
    RAISE EXCEPTION 'ai_usage_daily или service_meters уже есть — миграция применялась?';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ai_usage_add') THEN
    RAISE EXCEPTION 'ai_usage_add уже существует';
  END IF;
END $$;

-- ── 1. Расход ИИ по дням ─────────────────────────────────────────────────────
CREATE TABLE public.ai_usage_daily (
  -- День по Алматы
  day date NOT NULL,
  -- `провайдер/модель`, как в ai_settings
  model text NOT NULL,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  -- Удачных чтений
  posts integer NOT NULL DEFAULT 0 CHECK (posts >= 0),
  PRIMARY KEY (day, model)
);
-- Без политик: читает и пишет только service_role (маршруты админки)
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_daily FROM anon, authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;

CREATE FUNCTION public.ai_usage_add(p_model text, p_input bigint, p_output bigint, p_posts integer)
RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.ai_usage_daily (day, model, input_tokens, output_tokens, posts)
  VALUES ((now() AT TIME ZONE 'Asia/Almaty')::date, p_model, greatest(p_input, 0), greatest(p_output, 0), greatest(p_posts, 0))
  ON CONFLICT (day, model) DO UPDATE SET
    input_tokens = public.ai_usage_daily.input_tokens + excluded.input_tokens,
    output_tokens = public.ai_usage_daily.output_tokens + excluded.output_tokens,
    posts = public.ai_usage_daily.posts + excluded.posts;
$$;
REVOKE ALL ON FUNCTION public.ai_usage_add(text, bigint, bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_add(text, bigint, bigint, integer) TO service_role;

-- ── 2. Последние показания лимитов ───────────────────────────────────────────
CREATE TABLE public.service_meters (
  -- 'ai_limits:anthropic', 'ai_limits:openai', 'telegram_flood'
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.service_meters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_meters FROM anon, authenticated;
GRANT ALL ON public.service_meters TO service_role;

-- ── 3. Проверка ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'ai_usage_add') <> 1 THEN
    RAISE EXCEPTION 'ai_usage_add — не ровно одна версия';
  END IF;
END $$;

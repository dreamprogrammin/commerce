-- ============================================================================
-- «Товары поставщиков»: артикул и цена — чтением ИИ (5 ноября 2026)
--
-- Владелец 4.11: «актуальная цена в чате, если её нет — он читает из картинки,
-- там также написан артикул в самой картинке». Модель выбрана стендом 5.11
-- (docs/HANDOFF.md): Claude Haiku 5.5, ключ и выбор — на странице «Модели
-- ИИ». Читает сборщик (server/utils/supplierOffers.ts), пока фото поста ещё в
-- памяти, — лишнего трафика из хранилища нет. Не прочлось — «Прочитать» на
-- странице, тогда фото берётся из бакета.
--
-- Колонки — с NULL: сборщик без этой миграции собирает товары, как прежде,
-- только без чтения. Живой master о таблице не знает.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_offers') IS NULL THEN
    RAISE EXCEPTION 'нет supplier_offers — сначала 20261104160000_supplier_offers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_offers' AND column_name LIKE 'read\_%'
  ) THEN
    RAISE EXCEPTION 'у supplier_offers уже есть колонки read_* — миграция применялась?';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_offers_read_summary') THEN
    RAISE EXCEPTION 'supplier_offers_read_summary уже существует';
  END IF;
END $$;

-- ── 1. Что прочла модель ─────────────────────────────────────────────────────
ALTER TABLE public.supplier_offers
  -- Товары поста — ReadItem[] из supabase/functions/_shared/supplierVisionCore.ts;
  -- null — ещё не прочитан или не прочёлся
  ADD COLUMN read_items jsonb CHECK (read_items IS NULL OR jsonb_typeof(read_items) = 'array'),
  -- Какой моделью и когда читали — и удачно, и нет
  ADD COLUMN read_model text,
  ADD COLUMN read_at timestamptz,
  -- Почему не прочёлся — для карточки
  ADD COLUMN read_error text CHECK (length(read_error) <= 500),
  -- Токены удачного чтения — расход на дашборде «Умный закуп»
  ADD COLUMN read_input_tokens integer CHECK (read_input_tokens >= 0),
  ADD COLUMN read_output_tokens integer CHECK (read_output_tokens >= 0),
  ADD CONSTRAINT supplier_offers_read_attempt CHECK ((read_at IS NULL) = (read_model IS NULL)),
  ADD CONSTRAINT supplier_offers_read_outcome CHECK (read_items IS NULL OR read_error IS NULL);

COMMENT ON COLUMN public.supplier_offers.read_items IS
  'Товары поста, как их прочла модель ИИ: название, артикул, цена из подписи и с фото; null — не прочитан';

-- ── 2. Сводка чтения ─────────────────────────────────────────────────────────
-- unread — новые товары с фото, которые ещё не прочитаны (в том числе не
-- прочлись, их — failed); models — удачные чтения за 30 дней по моделям
CREATE FUNCTION public.supplier_offers_read_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'unread', count(*) FILTER (WHERE o.read_items IS NULL),
    'failed', count(*) FILTER (WHERE o.read_items IS NULL AND o.read_error IS NOT NULL),
    'models', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'model', m.read_model,
        'posts', m.posts,
        'inputTokens', m.input_tokens,
        'outputTokens', m.output_tokens
      ) ORDER BY m.posts DESC, m.read_model)
      FROM (
        SELECT r.read_model, count(*) AS posts,
               coalesce(sum(r.read_input_tokens), 0) AS input_tokens,
               coalesce(sum(r.read_output_tokens), 0) AS output_tokens
        FROM public.supplier_offers r
        WHERE r.read_items IS NOT NULL AND r.read_at >= now() - interval '30 days'
        GROUP BY r.read_model
      ) m
    ), '[]'::jsonb)
  )
  FROM public.supplier_offers o
  WHERE o.status = 'new'
    AND o.posted_at >= now() - interval '30 days'
    AND o.photo_path IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.supplier_offers_read_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_offers_read_summary() TO service_role;

-- ── 3. Проверка ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'supplier_offers' AND column_name LIKE 'read\_%') <> 6 THEN
    RAISE EXCEPTION 'у supplier_offers не шесть колонок read_*';
  END IF;
  IF has_function_privilege('anon', 'public.supplier_offers_read_summary()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.supplier_offers_read_summary()', 'EXECUTE') THEN
    RAISE EXCEPTION 'supplier_offers_read_summary доступна гостю или покупателю';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'supplier_offers_read_summary') <> 1 THEN
    RAISE EXCEPTION 'supplier_offers_read_summary — не ровно одна версия';
  END IF;
  IF has_table_privilege('anon', 'public.supplier_offers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.supplier_offers', 'SELECT') THEN
    RAISE EXCEPTION 'supplier_offers доступна гостю или покупателю';
  END IF;
END $$;

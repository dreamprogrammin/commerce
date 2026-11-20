-- Цифры Kaspi у тем спроса и товаров поставщиков (20 ноября 2026).
--
-- Владелец 19.11: «по мимо гугла главный источник еще каспи магазин»; 20.11
-- выбраны оба способа: кнопка в браузере владельца (забирает цену, отзывы,
-- рейтинг и продавцов с открытой им страницы Kaspi) и скриншот, который
-- читает ИИ. Сервер на kaspi.kz не ходит — цифры приносит владелец.
--
-- Каждый замер — отдельная строка с датой: по двум замерам одного товара
-- видно, сколько отзывов добавилось (так считают продажи сервисы аналитики
-- Kaspi). Таблица закрыта, как supplier_offers: читает и пишет только сервер.

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_offers') IS NULL OR to_regclass('public.market_demand_topics') IS NULL THEN
    RAISE EXCEPTION 'нет supplier_offers или market_demand_topics — миграции закупа не применены';
  END IF;
  IF to_regclass('public.kaspi_snapshots') IS NOT NULL THEN
    RAISE EXCEPTION 'kaspi_snapshots уже есть';
  END IF;
END $$;

-- ── 1. Замеры ────────────────────────────────────────────────────────────────
CREATE TABLE public.kaspi_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- К чему замер: тема спроса или товар поставщика (пост; item — номер товара в посте)
  topic_id uuid REFERENCES public.market_demand_topics(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.supplier_offers(id) ON DELETE CASCADE,
  offer_item smallint CHECK (offer_item >= 0),
  CHECK (num_nonnulls(topic_id, offer_id) = 1),
  CHECK (offer_item IS NULL OR offer_id IS NOT NULL),
  -- Страница товара на Kaspi; по ней сравниваются замеры одного товара
  kaspi_url text CHECK (kaspi_url ~ '^https://kaspi\.kz/'),
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 300),
  price integer CHECK (price >= 0),
  reviews integer CHECK (reviews >= 0),
  rating numeric(2, 1) CHECK (rating BETWEEN 0 AND 5),
  sellers integer CHECK (sellers >= 0),
  CHECK (num_nonnulls(price, reviews, rating, sellers) > 0),
  -- page — кнопка в браузере; screenshot — прочитал ИИ; manual — набрано руками
  source text NOT NULL CHECK (source IN ('page', 'screenshot', 'manual')),
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX kaspi_snapshots_topic_idx ON public.kaspi_snapshots (topic_id, taken_at DESC) WHERE topic_id IS NOT NULL;
CREATE INDEX kaspi_snapshots_offer_idx ON public.kaspi_snapshots (offer_id, taken_at DESC) WHERE offer_id IS NOT NULL;
CREATE INDEX kaspi_snapshots_url_idx ON public.kaspi_snapshots (kaspi_url, taken_at) WHERE kaspi_url IS NOT NULL;
CREATE INDEX kaspi_snapshots_created_by_idx ON public.kaspi_snapshots (created_by) WHERE created_by IS NOT NULL;

ALTER TABLE public.kaspi_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kaspi_snapshots FROM anon, authenticated;
GRANT ALL ON public.kaspi_snapshots TO service_role;

-- ── 2. Проверка ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.kaspi_snapshots'::regclass) THEN
    RAISE EXCEPTION 'у kaspi_snapshots не включён RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'kaspi_snapshots') THEN
    RAISE EXCEPTION 'у kaspi_snapshots есть политики — таблица должна быть закрыта';
  END IF;
  IF has_table_privilege('anon', 'public.kaspi_snapshots', 'SELECT')
     OR has_table_privilege('authenticated', 'public.kaspi_snapshots', 'SELECT') THEN
    RAISE EXCEPTION 'kaspi_snapshots доступна гостю или покупателю';
  END IF;
END $$;

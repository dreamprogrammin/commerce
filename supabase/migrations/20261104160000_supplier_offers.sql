-- ============================================================================
-- «Товары поставщиков» — список ссылок умного закупа (4 ноября 2026)
--
-- Владелец 4.11: «ссылки можно собирать в админке чтобы было удобно можно
-- разгруппировать»; брать у поставщиков можно в любом количестве. Страница
-- /admin/supplier-offers: новые товары из каналов поставщиков за 30 дней —
-- фото, подпись, ссылка на пост; по поставщикам, по дням или одним списком.
--
-- Товар — фото со своей подписью (правило альбома — utils/supplierPosts.ts).
-- Собирает их кнопка на странице (server/utils/supplierOffers.ts): открытый
-- канал — через t.me/s/<имя>, закрытый — аккаунтом со страницы «Аккаунт
-- Telegram». Первое фото товара — в закрытом бакете supplier-photos: адреса
-- фото с t.me живут меньше суток. Ссылка на него подписана на 30 дней —
-- столько товар и держится в списке, старше сборщик удаляет вместе с фото.
--
-- Только service_role: страница ходит через маршруты /api/admin/* с
-- requireAdmin. Живой master о таблице не знает — выкатке не мешает.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_channels') IS NULL THEN
    RAISE EXCEPTION 'нет supplier_channels — сначала 20261103120000_supplier_channels';
  END IF;
  IF to_regclass('public.supplier_offers') IS NOT NULL THEN
    RAISE EXCEPTION 'supplier_offers уже существует — миграция применялась?';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'supplier_channels' AND column_name IN ('collected_up_to', 'collected_at')
  ) THEN
    RAISE EXCEPTION 'у supplier_channels уже есть collected_up_to или collected_at';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'supplier-photos') THEN
    RAISE EXCEPTION 'бакет supplier-photos уже существует';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'supplier_offers_summary') THEN
    RAISE EXCEPTION 'supplier_offers_summary уже существует';
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'нет таблицы profiles';
  END IF;
END $$;

-- ── 1. Докуда собран канал ───────────────────────────────────────────────────
ALTER TABLE public.supplier_channels
  ADD COLUMN collected_up_to integer CHECK (collected_up_to > 0),
  ADD COLUMN collected_at timestamptz;

COMMENT ON COLUMN public.supplier_channels.collected_up_to IS
  'Номер последнего разобранного сообщения канала: следующий сбор начинается после него';

-- ── 2. Товары ────────────────────────────────────────────────────────────────
CREATE TABLE public.supplier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.supplier_channels(id) ON DELETE CASCADE,
  -- Первое сообщение товара; товар из альбома может тянуться на несколько
  message_id integer NOT NULL CHECK (message_id > 0),
  posted_at timestamptz NOT NULL,
  caption text NOT NULL DEFAULT '' CHECK (length(caption) <= 4096),
  post_url text NOT NULL CHECK (post_url ~ '^https://t\.me/'),
  -- Первое фото в бакете и подписанная ссылка на него; null — не скачалось
  photo_path text,
  photo_url text,
  CHECK ((photo_path IS NULL) = (photo_url IS NULL)),
  -- Фото у товара всего: остальные — в посте
  photo_count smallint NOT NULL DEFAULT 1 CHECK (photo_count > 0),
  -- new — новый; added — владелец добавил на сайт; skipped — «Не брать»
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'added', 'skipped')),
  status_at timestamptz,
  status_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_id, message_id)
);

CREATE INDEX supplier_offers_posted_at_idx ON public.supplier_offers (posted_at DESC);

ALTER TABLE public.supplier_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_offers FROM anon, authenticated;
GRANT ALL ON public.supplier_offers TO service_role;

-- ── 3. Бакет миниатюр ────────────────────────────────────────────────────────
-- Закрытый, без политик: кладёт и подписывает ссылки только сервер
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('supplier-photos', 'supplier-photos', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- ── 4. Сводка для дашборда «Умный закуп» ─────────────────────────────────────
CREATE FUNCTION public.supplier_offers_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'fresh', count(*) FILTER (WHERE o.status = 'new'),
    'added', count(*) FILTER (WHERE o.status = 'added'),
    'skipped', count(*) FILTER (WHERE o.status = 'skipped'),
    'collectedAt', (SELECT max(c.collected_at) FROM public.supplier_channels c)
  )
  FROM public.supplier_offers o
  WHERE o.posted_at >= now() - interval '30 days'
$$;

REVOKE ALL ON FUNCTION public.supplier_offers_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_offers_summary() TO service_role;

-- ── 5. Проверка ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.supplier_offers'::regclass) THEN
    RAISE EXCEPTION 'у supplier_offers не включён RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_offers') THEN
    RAISE EXCEPTION 'у supplier_offers есть политики — таблица должна быть закрыта';
  END IF;
  IF has_table_privilege('anon', 'public.supplier_offers', 'SELECT')
     OR has_table_privilege('authenticated', 'public.supplier_offers', 'SELECT') THEN
    RAISE EXCEPTION 'supplier_offers доступна гостю или покупателю';
  END IF;
  IF has_function_privilege('anon', 'public.supplier_offers_summary()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.supplier_offers_summary()', 'EXECUTE') THEN
    RAISE EXCEPTION 'supplier_offers_summary доступна гостю или покупателю';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'supplier_offers_summary') <> 1 THEN
    RAISE EXCEPTION 'supplier_offers_summary — не ровно одна версия';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'supplier-photos' AND NOT public) THEN
    RAISE EXCEPTION 'бакет supplier-photos не создан закрытым';
  END IF;
END $$;

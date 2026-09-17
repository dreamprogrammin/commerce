-- История адресов товара: переименование больше не убивает URL.
--
-- ЗАЧЕМ. Карточка теряет свой адрес двумя штатными способами: правка названия
-- в админке перегенерирует slug (`ProductForm.vue` следит за `formData.name`),
-- а удаление товара — жёсткий DELETE. Истории адресов нигде нет, поэтому
-- старый URL просто начинает отдавать 404.
--
-- Чем это обошлось: замер Search Console 17 сентября 2026 — пять адресов
-- карточек продолжают получать показы и все пять отдают 404. Крупнейший — 165
-- показов на средней позиции 4.8 по запросу «xx2028», самый показываемый
-- запрос сайта. Товар при этом есть в наличии: карточку пересоздали под новым
-- артикулом.
--
-- Те пять адресов закрыты картой в коде (`constants/productSlugRedirects.ts`
-- плюс `vercel.json`) — их товаров уже нет в базе, а три из пяти ведут на
-- раздел, а не на карточку, чего таблица выразить не может. Эта миграция — про
-- БУДУЩИЕ переименования: они станут чиниться сами, без правки кода и выкатки.
--
-- КАК УСТРОЕНО. Триггер на `products` пишет старый slug при каждой смене и
-- удаляет из истории адрес, который заняла живая карточка (иначе рабочий URL
-- увёл бы редиректом сам на себя).
--
-- ЧЕГО НЕ ДЕЛАЕТ. Не помнит, куда вёл адрес удалённого товара: при удалении
-- `product_id` обнуляется, строка остаётся как след («адрес был, товара нет»),
-- но цели у неё нет. Замену удалённому товару человек выбирает сам — это
-- по-прежнему карта в коде.

-- ── Состояние: миграция готовилась под эту схему ──────────────────────────
DO $check$
BEGIN
  IF to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION 'Нет таблицы products — база не та, под которую готовилась миграция';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'slug'
  ) THEN
    RAISE EXCEPTION 'В products нет колонки slug';
  END IF;
END
$check$;

CREATE TABLE IF NOT EXISTS public.product_slug_history (
  -- Ключ — сам адрес: он и есть то, по чему ищут.
  old_slug text PRIMARY KEY,
  -- NULL значит «товара больше нет»: строка остаётся следом, но цели не имеет.
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.product_slug_history IS
  'Прежние адреса карточек. Заполняется триггером при смене slug; используется страницей товара для 301 вместо 404.';

CREATE INDEX IF NOT EXISTS product_slug_history_product_id_idx
  ON public.product_slug_history (product_id);

ALTER TABLE public.product_slug_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.product_slug_history;
CREATE POLICY "Enable read access for all users"
  ON public.product_slug_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable write for admins" ON public.product_slug_history;
CREATE POLICY "Enable write for admins"
  ON public.product_slug_history FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.product_slug_history TO anon, authenticated;
GRANT ALL    ON public.product_slug_history TO service_role;

-- ── Триггер ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_product_slug_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Сменился адрес — запоминаем прежний.
  IF TG_OP = 'UPDATE' AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO public.product_slug_history (old_slug, product_id)
    VALUES (OLD.slug, NEW.id)
    ON CONFLICT (old_slug) DO UPDATE
      SET product_id = EXCLUDED.product_id,
          created_at = now();
  END IF;

  /*
   * Адрес, который занят живой карточкой, устаревшим числиться не может.
   * Без этой строки возможен цикл: товар переименовали и вернули обратно —
   * старый адрес остался бы в истории и уводил редиректом сам на себя.
   */
  DELETE FROM public.product_slug_history WHERE old_slug = NEW.slug;

  RETURN NEW;
END
$fn$;

COMMENT ON FUNCTION public.record_product_slug_change() IS
  'Пишет прежний slug товара в product_slug_history и снимает из истории адрес, занятый живой карточкой.';

DROP TRIGGER IF EXISTS trg_product_slug_history ON public.products;
CREATE TRIGGER trg_product_slug_history
  AFTER INSERT OR UPDATE OF slug ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.record_product_slug_change();

-- ── Проверка после ────────────────────────────────────────────────────────
DO $after$
BEGIN
  IF to_regclass('public.product_slug_history') IS NULL THEN
    RAISE EXCEPTION 'Таблица product_slug_history не создана';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_product_slug_history'
       AND tgrelid = 'public.products'::regclass
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Триггер trg_product_slug_history не повешен на products';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'product_slug_history'
       AND policyname = 'Enable read access for all users'
  ) THEN
    RAISE EXCEPTION 'Нет политики публичного чтения — страница товара не сможет найти старый адрес';
  END IF;
END
$after$;

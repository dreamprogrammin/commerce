-- Дата начала текущей цены со скидкой — для `validFrom` в разметке Offer.
--
-- Зачем. Search Console на 13 октября 2026 держал предупреждение «Отсутствует
-- поле validFrom» на 168 карточках и 42 разделах: у всех товаров со скидкой.
-- Google (merchant listing): `validFrom` — начало действия цены со скидкой,
-- ставится на Offer рядом с `priceValidUntil`. Даты в базе не было — выдумывать
-- её в разметку нельзя. Теперь её ведёт триггер.
--
-- Правило триггера: скидки нет — даты нет; скидка появилась, изменилась или
-- поменялась цена — дата = сейчас (с этого момента действует НОВАЯ цена).
--
-- Уже стоящие скидки: дата = `updated_at` товара. Это честная нижняя граница —
-- цена со скидкой действует как минимум с последней правки товара. Заполнение
-- идёт с выключенным `trigger_products_updated_at`: иначе у всех 168 товаров
-- сдвинулся бы `updated_at`, а от него — `lastmod` в карте сайта.

-- Страж: база та, под которую готовилось.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'discount_started_at'
  ) THEN
    RAISE EXCEPTION 'products.discount_started_at уже есть — миграция не для этой базы';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_discount_started_at') THEN
    RAISE EXCEPTION 'функция set_discount_started_at уже есть';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'products' AND t.tgname = 'trigger_products_updated_at'
  ) THEN
    RAISE EXCEPTION 'нет trigger_products_updated_at — заполнение сдвинуло бы не тот триггер';
  END IF;
END $$;

ALTER TABLE public.products ADD COLUMN discount_started_at timestamptz;

COMMENT ON COLUMN public.products.discount_started_at IS
  'С какого момента действует текущая цена со скидкой (validFrom в разметке). Ведёт триггер trigger_discount_started_at; без скидки — NULL.';

-- Заполнение уже стоящих скидок без сдвига updated_at.
ALTER TABLE public.products DISABLE TRIGGER trigger_products_updated_at;
UPDATE public.products
SET discount_started_at = COALESCE(updated_at, created_at, now())
WHERE COALESCE(discount_percentage, 0) > 0;
ALTER TABLE public.products ENABLE TRIGGER trigger_products_updated_at;

CREATE FUNCTION public.set_discount_started_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.discount_percentage, 0) <= 0 THEN
    NEW.discount_started_at := NULL;
  ELSIF TG_OP = 'INSERT'
     OR COALESCE(OLD.discount_percentage, 0) IS DISTINCT FROM COALESCE(NEW.discount_percentage, 0)
     OR OLD.price IS DISTINCT FROM NEW.price
     OR NEW.discount_started_at IS NULL THEN
    NEW.discount_started_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_discount_started_at
BEFORE INSERT OR UPDATE OF discount_percentage, price ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_discount_started_at();

-- Проверка результата: у каждой скидки есть дата, без скидки — нет, триггер updated_at снова включён.
DO $$
DECLARE
  missing int;
  stray int;
BEGIN
  SELECT count(*) INTO missing FROM public.products
  WHERE COALESCE(discount_percentage, 0) > 0 AND discount_started_at IS NULL;
  SELECT count(*) INTO stray FROM public.products
  WHERE COALESCE(discount_percentage, 0) <= 0 AND discount_started_at IS NOT NULL;
  IF missing > 0 OR stray > 0 THEN
    RAISE EXCEPTION 'discount_started_at: без даты % , лишняя дата %', missing, stray;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'products' AND t.tgname = 'trigger_products_updated_at' AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'trigger_products_updated_at не включён обратно';
  END IF;
END $$;

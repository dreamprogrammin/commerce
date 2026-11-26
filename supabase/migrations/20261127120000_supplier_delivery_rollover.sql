-- ============================================================================
-- Поставки: не пришла в свой день — переносится на завтра (27 ноября 2026)
--
-- Владелец 26.11: «если товаров от разных поставщиков много, мы должны перейти
-- к поставщику, который доставляет нам товар; мы планируем время ожидания
-- поставки, у нас там должен быть календарь; если, допустим, поставка сегодня
-- не пришла, она переносится на следующий день». Решения владельца в окне
-- вопросов: переносится сама, и видно, сколько раз и когда ждали сначала;
-- ожидание — только день, без времени.
--
--   • supplier_orders.planned_at — день, который поставили руками («Заказано»
--     или «Дата»): «сначала ждали». У уже заказанных — их expected_at.
--   • supplier_orders.postponed — сколько дней поставка переезжала сама.
--   • supplier_orders_plan (триггер) — дату поменяли не переносом: planned_at
--     = новая дата, postponed = 0. Новая дата от человека — новый план, счёт
--     опозданий начинается заново. Так admin_place_supplier_order и
--     admin_set_supplier_order_expected (20261126140000) не пересоздаются.
--   • supplier_orders_rollover() — открытые заказы (ordered, in_transit), чей
--     день прошёл: expected_at = сегодня по Алматы, postponed + сколько дней
--     пропущено. Частично принятый заказ открыт — переезжает тоже.
--     Отличает себя от правки руками локальной настройкой
--     app.delivery_rollover в транзакции.
--   • pg_cron «Supplier Delivery Rollover» — 00:01 по Алматы (19:01 UTC,
--     Алматы UTC+5 круглый год). Пропущенная ночь не теряется: следующий
--     запуск прибавит все пропущенные дни. Страница до запуска покажет
--     «опаздывает», как и раньше.
--
-- Функции — только ключу сервиса.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'supplier_orders' AND column_name IN ('ordered_at', 'expected_at')) <> 2 THEN
    RAISE EXCEPTION 'нет дат поставки — сначала 20261126140000_supplier_deliveries';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_orders' AND column_name IN ('planned_at', 'postponed')) THEN
    RAISE EXCEPTION 'planned_at/postponed уже есть — миграция применена?';
  END IF;
  IF to_regprocedure('public.supplier_orders_rollover()') IS NOT NULL
     OR to_regprocedure('public.supplier_orders_plan()') IS NOT NULL THEN
    RAISE EXCEPTION 'функции переноса уже есть';
  END IF;
  IF to_regnamespace('cron') IS NULL THEN
    RAISE EXCEPTION 'нет pg_cron';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Supplier Delivery Rollover') THEN
    RAISE EXCEPTION 'расписание «Supplier Delivery Rollover» уже есть';
  END IF;
END $$;

-- ── 1. Колонки ───────────────────────────────────────────────────────────────
ALTER TABLE public.supplier_orders
  ADD COLUMN planned_at date,
  ADD COLUMN postponed integer NOT NULL DEFAULT 0 CONSTRAINT supplier_orders_postponed_check CHECK (postponed >= 0);

COMMENT ON COLUMN public.supplier_orders.planned_at IS
  'День поставки, поставленный руками («Заказано» или «Дата»), — «сначала ждали»; переносы его не трогают';
COMMENT ON COLUMN public.supplier_orders.postponed IS
  'Сколько дней поставка переезжала сама (supplier_orders_rollover); ручная дата — снова 0';

UPDATE public.supplier_orders SET planned_at = expected_at WHERE expected_at IS NOT NULL;

-- ── 2. Ручная дата — новый план ──────────────────────────────────────────────
CREATE FUNCTION public.supplier_orders_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('app.delivery_rollover', true) IS DISTINCT FROM 'on'
     AND (TG_OP = 'INSERT' OR NEW.expected_at IS DISTINCT FROM OLD.expected_at) THEN
    NEW.planned_at := NEW.expected_at;
    NEW.postponed := 0;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER supplier_orders_plan
  BEFORE INSERT OR UPDATE OF expected_at ON public.supplier_orders
  FOR EACH ROW EXECUTE FUNCTION public.supplier_orders_plan();

-- ── 3. Перенос на сегодня ────────────────────────────────────────────────────
CREATE FUNCTION public.supplier_orders_rollover()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Almaty')::date;
  v_moved integer;
BEGIN
  PERFORM set_config('app.delivery_rollover', 'on', true);
  UPDATE supplier_orders
  SET postponed = postponed + (v_today - expected_at),
      expected_at = v_today,
      updated_at = now()
  WHERE status IN ('ordered', 'in_transit') AND expected_at < v_today;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  PERFORM set_config('app.delivery_rollover', 'off', true);
  RETURN v_moved;
END;
$function$;

REVOKE ALL ON FUNCTION public.supplier_orders_rollover() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_orders_rollover() TO service_role;
REVOKE ALL ON FUNCTION public.supplier_orders_plan() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('Supplier Delivery Rollover', '1 19 * * *', $cron$SELECT public.supplier_orders_rollover()$cron$);

-- Опоздавшие на момент применения — сразу на сегодня
SELECT public.supplier_orders_rollover();

-- ── 4. Проверка результата ───────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('supplier_orders_rollover', 'supplier_orders_plan')
      AND pronamespace = 'public'::regnamespace) <> 2 THEN
    RAISE EXCEPTION 'функций переноса не по одной';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'supplier_orders_plan' AND tgrelid = 'public.supplier_orders'::regclass) THEN
    RAISE EXCEPTION 'нет триггера supplier_orders_plan';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'Supplier Delivery Rollover') <> 1 THEN
    RAISE EXCEPTION 'нет расписания переноса';
  END IF;
  IF EXISTS (SELECT 1 FROM public.supplier_orders
             WHERE status IN ('ordered', 'in_transit') AND expected_at < (now() AT TIME ZONE 'Asia/Almaty')::date) THEN
    RAISE EXCEPTION 'остались опоздавшие';
  END IF;
END $$;

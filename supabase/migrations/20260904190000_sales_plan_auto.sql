-- =====================================================================================
-- ПЛАН ПРОДАЖ СЧИТАЕТСЯ САМ
-- =====================================================================================
-- Владелец: «план должен сам рассчитываться по умному, а не владелец чтобы
-- выписывал». Ручная команда `/plan` остаётся как перебивка — иногда владелец
-- знает про акцию или поставку, о которых в истории ничего нет.
--
-- Здесь только хранилище: откуда план взялся и на чём посчитан. Сама формула
-- живёт в `_shared/salesDigest.ts`, чтобы её можно было менять без миграций.
--
-- `basis` держим JSON-ом намеренно: состав расчёта будет меняться (появится
-- трафик — добавится конверсия), а плодить колонки под каждую промежуточную
-- цифру незачем. Из него же собирается строка «посчитан по…» в сводке.
-- =====================================================================================

ALTER TABLE public.sales_plans
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS basis JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_plans_source_check'
  ) THEN
    ALTER TABLE public.sales_plans
      ADD CONSTRAINT sales_plans_source_check CHECK (source IN ('auto', 'manual'));
  END IF;
END $$;

COMMENT ON COLUMN public.sales_plans.source IS
'auto — план посчитан ботом по истории продаж; manual — поставлен владельцем
командой /plan. Ручной автоматика не перетирает.';

COMMENT ON COLUMN public.sales_plans.basis IS
'Из чего сложился автоплан: средняя выручка в день, тренд, коэффициент роста,
сколько живых заказов было в базе. Показывается в сводке, чтобы цифра не
выглядела взятой с потолка.';

DO $$
DECLARE
  v_source INTEGER;
BEGIN
  SELECT count(*) INTO v_source
  FROM information_schema.columns
  WHERE table_name = 'sales_plans' AND column_name IN ('source', 'basis');

  IF v_source <> 2 THEN
    RAISE EXCEPTION 'Ожидались колонки source и basis, найдено %', v_source;
  END IF;

  RAISE NOTICE '✅ План продаж умеет считаться сам';
END $$;

NOTIFY pgrst, 'reload schema';

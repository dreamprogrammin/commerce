-- Увольнение сотрудника: статус `fired` и след от решения.
--
-- ЗАЧЕМ. Бот умел принимать людей — заявка, кнопка «Принять», доступ к
-- заказам, — но обратного хода не было вовсе. Уволенного оставалось разве что
-- удалить из `staff` руками в дашборде; тогда терялось всё: кто это был, когда
-- его приняли, кто и когда убрал.
--
-- ПОЧЕМУ ОТДЕЛЬНЫЙ СТАТУС, А НЕ `rejected`. `rejected` — это «не взяли по
-- заявке», человек в магазине не работал ни дня. Уволенный работал, и его
-- заказы, доставки и след в отчётах никуда не делись. Один статус на два
-- разных события врал бы и владельцу в списке команды, и отчётам.
--
-- ДОСТУП СЧИТАЕТСЯ ТОЛЬКО ПО `status`. Проверки в боте уже написаны как
-- `status = 'approved'`, поэтому новый статус закрывает доступ сам собой, без
-- правок в местах проверки. `fired_at` — не признак увольнения, а дата
-- последнего: у принятого заново человека она остаётся заполненной, и по ней
-- владелец видит в новой заявке, что с этим человеком уже расставались.

-- ── Проверка состояния ─────────────────────────────────────────────────────
-- Ограничение статуса пересоздаётся ниже по имени. Если имя другое (таблицу
-- пересоздавали руками), молча получилось бы две проверки статуса или ни
-- одной — падаем здесь, до изменений.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff'
  ) THEN
    RAISE EXCEPTION 'Таблицы public.staff нет — миграция готовилась под другую базу';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.staff'::regclass AND conname = 'staff_status_check'
  ) THEN
    RAISE EXCEPTION 'Ограничение staff_status_check не найдено: проверьте, как названа проверка статуса';
  END IF;
END $$;

-- ── Изменения ──────────────────────────────────────────────────────────────
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fired_by BIGINT;

COMMENT ON COLUMN public.staff.fired_at IS
  'Когда уволен в последний раз. Доступ определяется статусом, а не этой датой: у принятого заново она остаётся заполненной.';
COMMENT ON COLUMN public.staff.fired_by IS
  'Telegram-id владельца, нажавшего «Уволить». Как и approved_by — id, а не ссылка на profiles.';

-- Расширение проверки статуса. Старые значения остаются допустимыми, поэтому
-- живым записям ничего не грозит: проверка только разрешает новое.
ALTER TABLE public.staff DROP CONSTRAINT staff_status_check;
ALTER TABLE public.staff ADD CONSTRAINT staff_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'fired'));

-- ── Проверка ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_def TEXT;
  v_broken INTEGER;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.staff'::regclass AND conname = 'staff_status_check';

  IF v_def IS NULL OR position('fired' IN v_def) = 0 THEN
    RAISE EXCEPTION 'Статус fired не разрешён: %', COALESCE(v_def, 'ограничения нет');
  END IF;

  -- Ровно одна проверка статуса: две одинаково пропускали бы вставку, но
  -- разошлись бы при следующем изменении.
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'public.staff'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%') <> 1 THEN
    RAISE EXCEPTION 'Проверок статуса на staff не одна';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff'
      AND column_name IN ('fired_at', 'fired_by')
    GROUP BY table_name HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION 'Колонки fired_at / fired_by не добавились';
  END IF;

  -- Ни одна живая запись не должна была пострадать: старые статусы те же.
  SELECT count(*) INTO v_broken FROM public.staff
  WHERE status NOT IN ('draft', 'pending', 'approved', 'rejected', 'fired');
  IF v_broken > 0 THEN
    RAISE EXCEPTION 'Записей с неизвестным статусом: %', v_broken;
  END IF;

  RAISE NOTICE 'Увольнение готово: статус fired разрешён, колонки на месте';
END $$;

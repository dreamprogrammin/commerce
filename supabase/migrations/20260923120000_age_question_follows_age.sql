-- ═══════════════════════════════════════════════════════════════════════════
--  Ответ «С какого возраста…» следует за возрастом товара — 23 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. Автоматические вопросы о товаре (доставка, возврат, возраст) пишет
--  generate_product_questions — по кнопке «Сгенерировать вопросы» в админке.
--  При сохранении товара они не пересобираются. Поэтому возраст, поправленный
--  потом, расходится с ответом: 23 сентября у трёх каталок-твистеров KS105 в
--  характеристиках стояло «от 3 лет», а в вопросе ниже — «Производитель
--  рекомендует от 1 года». Этот ответ попадает и в разметку FAQPage карточки,
--  то есть в поиск уходило противоречие с самим товаром.
--
--  С возрастом в месяцах (миграция 20260922120000) его будут править чаще —
--  значит, и расходиться он будет чаще.
--
--  ЧТО ДЕЛАЕТ.
--   1. Триггер на products: когда меняется возраст (месяцы или годы — годы
--      пересчитываются в месяцы триггером trigger_sync_product_age раньше),
--      ответ на автоматический вопрос о возрасте переписывается тем же
--      текстом, что пишет генератор: «Производитель рекомендует для детей
--      от 6 месяцев.». Возраст стёрли — вопрос удаляется, как если бы его
--      пересобрал генератор. Вопросов, которых нет, триггер не создаёт: это
--      по-прежнему дело кнопки «Сгенерировать вопросы».
--      Правится строка на месте, а не пересоздаётся: вопросы на карточке идут
--      по дате создания, и пересоздание сдвинуло бы порядок. Уведомления не
--      уходят: notify_question_answered пишет только автору-покупателю и
--      только на первый ответ.
--   2. Разовая сверка: ответы, уже разошедшиеся с возрастом, переписываются,
--      вопрос о стёртом возрасте удаляется. На бою 23 сентября расхождений
--      три — те самые твистеры, стёртых нет.
--
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе в транзакции с откатом.

-- ── 0. ПРОВЕРКА СОСТОЯНИЯ ─────────────────────────────────────────────────
DO $check$
BEGIN
  IF to_regprocedure('public.age_range_ru(integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'нет public.age_range_ru — сначала миграция 20260922120000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.products'::regclass
                    AND tgname = 'trigger_sync_product_age') THEN
    RAISE EXCEPTION 'нет триггера trigger_sync_product_age — сначала миграция 20260922120000';
  END IF;
  IF to_regprocedure('public.sync_product_age_question()') IS NOT NULL THEN
    RAISE EXCEPTION 'public.sync_product_age_question уже есть — миграция готовилась под другую базу';
  END IF;
END
$check$;

-- ── 1. ТРИГГЕР ────────────────────────────────────────────────────────────
CREATE FUNCTION public.sync_product_age_question()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- Тот же текст, что пишет generate_product_questions
  v_age text := public.age_range_ru(NEW.min_age_months, NEW.max_age_months);
  v_answer text := 'Производитель рекомендует для детей ' || v_age || '.';
BEGIN
  IF v_age IS NULL THEN
    DELETE FROM public.product_questions
     WHERE product_id = NEW.id
       AND is_auto_generated
       AND question_text = 'С какого возраста можно играть с этой игрушкой?';
  ELSE
    UPDATE public.product_questions
       SET answer_text = v_answer,
           answered_at = now()
     WHERE product_id = NEW.id
       AND is_auto_generated
       AND question_text = 'С какого возраста можно играть с этой игрушкой?'
       AND answer_text IS DISTINCT FROM v_answer;
  END IF;
  RETURN NULL;
END;
$function$;

-- Годы в списке колонок — ради старой админки: она пишет только их, а
-- месяцы досчитывает BEFORE-триггер. К моменту AFTER-триггера NEW уже с
-- месяцами, и WHEN сравнивает именно их.
CREATE TRIGGER trigger_sync_product_age_question
  AFTER UPDATE OF min_age_years, max_age_years, min_age_months, max_age_months
  ON public.products
  FOR EACH ROW
  WHEN (NEW.min_age_months IS DISTINCT FROM OLD.min_age_months
        OR NEW.max_age_months IS DISTINCT FROM OLD.max_age_months)
  EXECUTE FUNCTION public.sync_product_age_question();

-- ── 2. РАЗОВАЯ СВЕРКА ─────────────────────────────────────────────────────
UPDATE public.product_questions q
   SET answer_text = 'Производитель рекомендует для детей '
                     || public.age_range_ru(p.min_age_months, p.max_age_months) || '.',
       answered_at = now()
  FROM public.products p
 WHERE q.product_id = p.id
   AND q.is_auto_generated
   AND q.question_text = 'С какого возраста можно играть с этой игрушкой?'
   AND public.age_range_ru(p.min_age_months, p.max_age_months) IS NOT NULL
   AND q.answer_text NOT LIKE '%' || public.age_range_ru(p.min_age_months, p.max_age_months) || '.';

-- Возраст стёрт, а вопрос о нём остался (на бою 23 сентября таких нет)
DELETE FROM public.product_questions q
 USING public.products p
 WHERE q.product_id = p.id
   AND q.is_auto_generated
   AND q.question_text = 'С какого возраста можно играть с этой игрушкой?'
   AND public.age_range_ru(p.min_age_months, p.max_age_months) IS NULL;

-- ── 3. САМОПРОВЕРКА ───────────────────────────────────────────────────────
DO $selfcheck$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.product_questions q
    JOIN public.products p ON p.id = q.product_id
   WHERE q.is_auto_generated
     AND q.question_text = 'С какого возраста можно играть с этой игрушкой?'
     AND (public.age_range_ru(p.min_age_months, p.max_age_months) IS NULL
          OR q.answer_text NOT LIKE '%' || public.age_range_ru(p.min_age_months, p.max_age_months) || '.');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'после сверки ответов о возрасте, расходящихся с товаром: %', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'sync_product_age_question';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'версий sync_product_age_question: %', v_n;
  END IF;
END
$selfcheck$;

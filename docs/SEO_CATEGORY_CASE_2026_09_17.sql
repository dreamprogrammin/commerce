-- ═══════════════════════════════════════════════════════════════════════════
-- Падежи в вопросах разделов. Запускать ПОСЛЕ применения миграции
-- 20260917120000_category_name_case_in_generators.sql.
--
-- Порядок важен: миграция учит генераторы брать читаемую форму названия из
-- `categories.seo_h1` и убирает из шаблонов места, где нужен падеж. Этот файл
-- дозаполняет `seo_h1` там, где он пуст или сам стоит в дательном падеже, и
-- перегенерирует уже записанные вопросы.
--
-- Если запустить ДО миграции, вопросы перепишутся старыми шаблонами и
-- останутся кривыми. Проверка на это стоит первой и остановит запуск.
--
-- Проверено запуском на локальной копии боевой базы в транзакции с ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Миграция точно приехала? ────────────────────────────────────────────
DO $check$
BEGIN
  IF to_regprocedure('public.lower_first(text)') IS NULL
     OR (SELECT pg_get_functiondef(oid) NOT LIKE '%seo_h1%'
           FROM pg_proc WHERE proname = 'generate_category_questions' LIMIT 1) THEN
    RAISE EXCEPTION 'Сначала примените миграцию 20260917120000 через Actions → Миграции Supabase → Run workflow → APPLY';
  END IF;
END
$check$;

-- ── 1. Читаемая форма названия там, где её не было ─────────────────────────
--
--  У этих пяти разделов `seo_h1` пуст или сам в дательном падеже, поэтому
--  генератор взял бы `name` и снова написал «Что такое Мальчикам?».
--  Остальным 47 разделам `seo_h1` уже заполнен правильно — их не трогаем.
--
--  Формулировки взяты из `meta_title` тех же разделов, чтобы заголовок,
--  описание и вопросы говорили об одном и том же.

UPDATE public.categories SET seo_h1 = 'Игрушки для девочек'
 WHERE slug = 'girls'                  AND COALESCE(btrim(seo_h1), '') IN ('', 'Девочкам');

UPDATE public.categories SET seo_h1 = 'Игрушки для мальчиков'
 WHERE slug = 'boys'                   AND COALESCE(btrim(seo_h1), '') IN ('', 'Мальчикам');

UPDATE public.categories SET seo_h1 = 'Игрушки для малышей'
 WHERE slug = 'kiddy'                  AND COALESCE(btrim(seo_h1), '') IN ('', 'Малышам');

UPDATE public.categories SET seo_h1 = 'Конструкторы для мальчиков'
 WHERE slug = 'konstruktory-malchikam' AND COALESCE(btrim(seo_h1), '') IN ('', 'Конструкторы Мальчикам');

UPDATE public.categories SET seo_h1 = 'Конструкторы для малышей'
 WHERE slug = 'konstruktory-malysham'  AND COALESCE(btrim(seo_h1), '') IN ('', 'Конструкторы малышам');

-- Контроль: ни у одного раздела с вопросами не осталось падежного названия.
SELECT count(*) AS razdelov_s_datelnym_padezhom
  FROM public.categories
 WHERE COALESCE(NULLIF(btrim(seo_h1), ''), name) ~ '(ам|ям)$';
-- Ожидается 0.

-- ── 2. Убрать прежние формулировки связок ──────────────────────────────────
--
--  `generate_category_brand_faq` пишет через ON CONFLICT по тексту вопроса.
--  Текст меняется («конструкторы мальчикам Sluban» → «конструкторы для
--  мальчиков Sluban»), значит новая строка со старой не столкнётся и старая
--  останется рядом. Поэтому сначала сносим авто-строки.
--
--  Написанных руками среди них нет: на 17 сентября 2026 все 56 строк —
--  is_auto_generated = true. Условие ниже всё равно оставлено.

DELETE FROM public.category_brand_questions WHERE is_auto_generated = true;

-- ── 3. Перегенерация ───────────────────────────────────────────────────────
--
--  Вопросы разделов генератор сносит сам (DELETE внутри функции), связки —
--  сносим выше. Вопросы товаров не трогаем: падежных ошибок в них нет
--  (проверено по всем 200 строкам).

SELECT count(*) AS razdelov_obrabotano FROM public.generate_questions_for_all_categories();
SELECT count(*) AS svyazok_obrabotano  FROM public.generate_faq_for_all_category_brands();

-- ── 4. Проверка после ──────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE question_text ~ '(ам|ям)\?')                    AS vopros_v_datelnom,
  count(*) FILTER (WHERE answer_text LIKE '%Стоимость <strong>%')        AS staraya_stoimost,
  count(*) FILTER (WHERE answer_text LIKE '%Развитие через игру с%')     AS staraya_igra,
  count(*) FILTER (WHERE question_text LIKE '%Какие бренды %можно купить?%'
                     AND question_text NOT LIKE '%в разделе%')           AS starye_brendy
  FROM public.category_questions;
-- Ожидается четыре нуля.

SELECT count(*) AS svyazki_v_datelnom
  FROM public.category_brand_questions
 WHERE question_text ~ '(мальчикам|девочкам|малышам)';
-- Ожидается 0.

COMMIT;

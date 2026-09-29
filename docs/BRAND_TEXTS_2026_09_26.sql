-- ═══════════════════════════════════════════════════════════════════════════
--  Тексты брендов: вопросы пересобраны новым генератором, пустые бренды честные
--  — 26.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАПУСКАТЬ ПОСЛЕ МИГРАЦИИ 20260926120000_brand_questions_generator
--  (GitHub → Actions → «Миграции Supabase» → Run workflow → APPLY). Без неё
--  файл остановится на первой проверке и ничего не изменит.
--
--  ЧТО ДЕЛАЕТ.
--   1. У брендов без товаров убирает из описания («О бренде») абзац «Купить
--      игрушки X в Казахстане — магазин Ухтышка… Какие модели сейчас в
--      наличии, видно в каталоге на этой странице» и пункт «Богатый выбор —
--      …»: товаров нет, выбирать не из чего.
--   2. У MokaToys чинит начало описания: заголовок и первый абзац стояли без
--      тегов, и страница показывала их одной строкой.
--   3. Пересобирает вопросы у ВСЕХ брендов новым генератором: цены со скидкой
--      и с пробелами («от 7 490 до 18 890 ₸»), «в разделе «…»» вместо «в 1
--      категориях», без абзаца «доставка по всему Казахстану… 1–3 рабочих дня»
--      и без «представлен 0 игрушками». Вопросов от покупателей нет — удаляются
--      только автоматические.
--
--  Повторный запуск безвреден: описания уже чистые, вопросы соберутся те же.
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых строк и боевыми телами
--  функций, с откатом.

-- ── 0. ПРОВЕРКА: генератор уже новый ──────────────────────────────────────
DO $check$
BEGIN
  IF pg_get_functiondef('public.generate_brand_questions(uuid,boolean)'::regprocedure)
     NOT LIKE '%В каталоге Ухтышки%' THEN
    RAISE EXCEPTION 'Сначала примените миграцию 20260926120000 (Actions → Миграции Supabase → Run workflow → APPLY). Ничего не менял.';
  END IF;
END
$check$;

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: UPDATE 8 (пустые бренды с такими абзацами на 26 сентября),
--  UPDATE 1 (MokaToys), затем одна строка с числом пересобранных брендов (43).

BEGIN;

-- Пустые бренды: заголовок (h2 «Купить … — магазин Ухтышка» или h3 «X в
-- Ухтышке») вместе с абзацем «Какие модели сейчас в наличии…» и пункт
-- «Богатый выбор».
UPDATE public.brands b
   SET description = regexp_replace(
         regexp_replace(description,
           '<h[23][^>]*>[^<]*</h[23]>\s*<p>[^<]*Какие модели сейчас в наличии[^<]*</p>\s*', '', 'g'),
         '\s*<li[^>]*>Богатый выбор[^<]*</li>', '', 'g')
 WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.brand_id = b.id AND p.is_active)
   AND (description ~ '<h[23][^>]*>[^<]*</h[23]>\s*<p>[^<]*Какие модели сейчас в наличии'
        OR description ~ '<li[^>]*>Богатый выбор');

-- MokaToys: описание начиналось без тегов — заголовок и первый абзац стояли
-- голым текстом до первого </p>. Страница показывала их слитно, а в разметку
-- Brand уходило «…для настоящих гонщиков Moka Toys — китайский…».
UPDATE public.brands
   SET description = regexp_replace(description,
         '^Moka Toys — радиоуправляемые машины для настоящих гонщиков\s*',
         '<h2 data-icon="fluent-emoji-flat:racing-car">Moka Toys — радиоуправляемые машины для настоящих гонщиков</h2>' || chr(10) || '<p>')
 WHERE slug = 'mokatoys'
   AND description LIKE 'Moka Toys — радиоуправляемые машины для настоящих гонщиков%';

SELECT count(*) AS peresobrano
  FROM (SELECT public.generate_brand_questions(id, true) FROM public.brands) AS t;

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: все счётчики «ostalos_…» — нули; voprosov ≈ 3 на бренд с
--  товарами и 1 на пустой.

SELECT count(*)                                                                    AS voprosov,
       count(*) FILTER (WHERE answer_text ~ 'тенге')                              AS ostalos_tenge,
       count(*) FILTER (WHERE answer_text ~ '(от|до) \d{4,}')                     AS ostalos_bez_probela,
       count(*) FILTER (WHERE answer_text ~ ' 1 категориях| 0 игрушками')          AS ostalos_sklonenie,
       count(*) FILTER (WHERE answer_text ~* 'доставк|самовывоз')                 AS ostalos_dostavka
  FROM public.brand_questions
 WHERE is_auto_generated;

SELECT count(*) AS pustyh_s_obeshchaniyami
  FROM public.brands b
 WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.brand_id = b.id AND p.is_active)
   AND description ~ 'Какие модели сейчас в наличии|Богатый выбор';

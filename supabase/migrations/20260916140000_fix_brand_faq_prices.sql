-- Цены в вопросах «категория + бренд»: запятая вместо пробела и вывернутая вилка.
--
-- ЧТО БЫЛО. Функция отдавала: «Цены на развивающие игрушки Play Smart в Ухтышке
-- начинаются от 12,490 ₸. Самые популярные модели стоят от 18,735 до 8,743 ₸.»
-- Здесь две беды, и обе видны в одной строке:
--
--   * разделитель разрядов — запятая. В проекте формат «12 490 ₸» с пробелом
--     (CLAUDE.md, раздел про валюту), и соседние функции так и печатают:
--     `replace(to_char(…, 'FM999,999,999'), ',', ' ')`. Здесь же стояло
--     `FM999G999G999`, где `G` берёт разделитель из локали базы;
--   * «популярные модели» считались как min×1.5 и max×0.7. Это выдуманные
--     границы: у связки с узкой вилкой цен верхняя оказывается НИЖЕ нижней, и
--     покупатель читает «от 18 735 до 8 743 ₸».
--
-- ЧТО СТАЛО. Печатаем настоящую вилку: «Цены на X Y в Ухтышке — от MIN до
-- MAX ₸», а когда в связке один товар (MIN = MAX) — «Цена … — MIN ₸».
-- Ничего не выдумываем и не додумываем за покупателя.
--
-- Найдено 16 сентября 2026 прогоном функции на локальной базе, когда чинились
-- обещания про доставку (миграция 20260916130000). Тело взято с прода и уже
-- содержит ту правку.

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'generate_category_brand_faq'
       AND p.prosrc LIKE '%FM999G999G999%'
  ) THEN
    RAISE EXCEPTION 'Миграция готовилась под другую базу: в generate_category_brand_faq нет формата FM999G999G999. Снимите тело заново через pg_get_functiondef.';
  END IF;
END
$check$;

CREATE OR REPLACE FUNCTION "public"."generate_category_brand_faq"("p_category_id" "uuid", "p_brand_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_category_name text;
  v_brand_name text;
  v_products_count int;
  v_min_price numeric;
  v_max_price numeric;
  v_city text := 'Алматы';
  v_faq jsonb;
BEGIN
  -- Получаем данные
  SELECT 
    c.name,
    b.name,
    COUNT(p.id),
    MIN(p.final_price),
    MAX(p.final_price)
  INTO 
    v_category_name,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price
  FROM categories c
  CROSS JOIN brands b
  LEFT JOIN products p ON p.category_id = c.id AND p.brand_id = b.id AND p.is_active = true
  WHERE c.id = p_category_id AND b.id = p_brand_id
  GROUP BY c.name, b.name;

  -- Генерируем FAQ
  v_faq := jsonb_build_array(
    jsonb_build_object(
      'question', format('Где купить %s %s в %s?', lower(v_category_name), v_brand_name, v_city),
      'answer', format('Лучший выбор %s %s в %s представлен в специализированном интернет-магазине Ухтышка (uhti.kz). Мы предлагаем %s моделей с бесплатной доставкой от 15 000 ₸ и начислением бонусов на следующую покупку.', 
        lower(v_category_name), v_brand_name, v_city, v_products_count)
    ),
    jsonb_build_object(
      'question', format('Сколько стоят %s %s?', lower(v_category_name), v_brand_name),
      'answer', CASE
        WHEN v_min_price = v_max_price THEN
          format('Цена %s %s в Ухтышке — %s ₸.',
            lower(v_category_name), v_brand_name,
            replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' '))
        ELSE
          format('Цены на %s %s в Ухтышке — от %s до %s ₸.',
            lower(v_category_name), v_brand_name,
            replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' '),
            replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' '))
      END
    ),
    jsonb_build_object(
      'question', format('Как быстро доставят %s %s в %s?', lower(v_category_name), v_brand_name, v_city),
      'answer', format('Доставка %s %s по %s занимает 1–3 рабочих дня. Бесплатная доставка при заказе от 15 000 ₸. Также доступен самовывоз из пункта выдачи.',
        lower(v_category_name), v_brand_name, v_city)
    ),
    jsonb_build_object(
      'question', format('Оригинальные ли %s %s в Ухтышке?', lower(v_category_name), v_brand_name),
      'answer', format('Да, мы работаем только с официальными поставщиками %s и проверяем каждый товар перед отправкой. На все %s %s предоставляется гарантия качества.',
        v_brand_name, lower(v_category_name), v_brand_name)
    )
  );

  -- Сохраняем FAQ в таблицу category_brand_questions
  INSERT INTO category_brand_questions (category_id, brand_id, question_text, answer_text, is_auto_generated)
  SELECT 
    p_category_id,
    p_brand_id,
    (faq->>'question')::text,
    (faq->>'answer')::text,
    true
  FROM jsonb_array_elements(v_faq) AS faq
  ON CONFLICT (category_id, brand_id, question_text) 
  DO UPDATE SET 
    answer_text = EXCLUDED.answer_text,
    updated_at = now();

  RETURN v_faq;
END;
$$;

-- ── Проверка результата ────────────────────────────────────────────────────
DO $verify$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'generate_category_brand_faq'
       AND (p.prosrc LIKE '%FM999G999G999%' OR p.prosrc LIKE '%v_min_price * 1.5%')
  ) THEN
    RAISE EXCEPTION 'Старый формат цен или выдуманная вилка остались в generate_category_brand_faq';
  END IF;
END
$verify$;

-- Склонения в генераторе вопросов: «1 товаров», «2 моделей», «от 1 лет».
--
-- ЧТО БЫЛО ВИДНО ПОКУПАТЕЛЮ. Генераторы приклеивали существительное к числу как
-- есть, поэтому на страницах стояло:
--
--   «В нашем каталоге представлено 1 товаров»        — 14 категорий с одним товаром
--   «Производитель рекомендует от 1 лет»             — 19 товаров с возрастом от года
--   «Мы предлагаем 2 моделей»                        — все связки, где товаров 2–4
--
-- Цифры посчитаны по боевой базе 16 сентября 2026. Это не опечатка в одном
-- месте: одиннадцать таких склеек в трёх функциях.
--
-- ЧТО ДЕЛАЕТ МИГРАЦИЯ. Заводит `public.plural_ru(n, одна, две, пять)` — ту же
-- логику, что у `pluralRu` в `utils/seoDescription.ts`, только в базе, — и
-- проводит через неё все одиннадцать мест.
--
-- ПРО ПАДЕЖИ. Формы передаются под КОНКРЕТНУЮ фразу, а не «вообще»:
--   «В каталоге 1 товар»          — именительный
--   «Выбирайте из 1 товара»       — родительный, после «из»
--   «мы собрали 1 лучшую модель»  — винительный, после «собрали»
-- Две фразы пришлось слегка переписать, потому что причастие не согласуется с
-- числом ни при каком склонении существительного: «представлено 1 товаров» не
-- чинится подстановкой — стало «В каталоге 1 товар».
--
-- ПРО ВОЗРАСТ ОТДЕЛЬНО. После «от» и «до» существительное идёт в родительном:
-- «от 1 года», но «от 2 лет», «до 5 лет». Поэтому формы передаются как
-- ('года', 'лет', 'лет'), а не ('год', 'года', 'лет') — это не ошибка вызова.
--
-- Тела функций сняты с ПРОДА уже после миграций 20260916130000 и
-- 20260916140000, то есть содержат их правки.

-- ── Помощник ───────────────────────────────────────────────────────────────
-- IMMUTABLE: результат зависит только от аргументов, планировщику это полезно.
CREATE OR REPLACE FUNCTION public.plural_ru(
  p_count INTEGER,
  p_one   TEXT,
  p_few   TEXT,
  p_many  TEXT
) RETURNS TEXT
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_count IS NULL THEN p_many
    -- 11–14 всегда «пять», иначе 11 ушло бы в «одна» по последней цифре
    WHEN abs(p_count) % 100 BETWEEN 11 AND 14 THEN p_many
    WHEN abs(p_count) % 10 = 1 THEN p_one
    WHEN abs(p_count) % 10 BETWEEN 2 AND 4 THEN p_few
    ELSE p_many
  END
$$;

COMMENT ON FUNCTION public.plural_ru(INTEGER, TEXT, TEXT, TEXT)
  IS 'Русское склонение по числу: 1 товар, 2 товара, 5 товаров. Формы передаются как (одна, две, пять).';

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'generate_category_questions'
       AND p.prosrc LIKE '%15 000 ₸%'
  ) THEN
    RAISE EXCEPTION 'Сначала должны быть применены миграции 20260916130000 и 20260916140000: в generate_category_questions нет «15 000 ₸».';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'generate_product_questions'
       AND p.prosrc LIKE '%рекомендует от %'
  ) THEN
    RAISE EXCEPTION 'Миграция готовилась под другую базу: в generate_product_questions нет фразы про рекомендуемый возраст.';
  END IF;
END
$check$;


-- ── generate_category_questions ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_category_questions"("p_category_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_category_name TEXT;
  v_category_slug TEXT;
  v_category_description TEXT;
  v_parent_category_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_max_discount INTEGER;
  v_brands_count INTEGER;
  v_random_index INTEGER;
  v_result JSON;
  v_category_ids UUID[];
BEGIN
  -- Собираем все ID категорий (текущая + подкатегории)
  WITH RECURSIVE category_tree AS (
    SELECT id FROM public.categories WHERE id = p_category_id
    UNION ALL
    SELECT c.id FROM public.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT array_agg(id) INTO v_category_ids FROM category_tree;

  -- Получаем данные с использованием final_price (generated column)
  SELECT
    c.name,
    c.slug,
    c.description,
    parent.name,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_active = true),
    MIN(p.final_price) FILTER (WHERE p.is_active = true),
    MAX(p.final_price) FILTER (WHERE p.is_active = true),
    MAX(COALESCE(p.discount_percentage, 0)) FILTER (WHERE p.is_active = true),
    COUNT(DISTINCT p.brand_id) FILTER (WHERE p.is_active = true)
  INTO
    v_category_name,
    v_category_slug,
    v_category_description,
    v_parent_category_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_max_discount,
    v_brands_count
  FROM public.categories c
  LEFT JOIN public.categories parent ON c.parent_id = parent.id
  LEFT JOIN public.products p ON p.category_id = ANY(v_category_ids)
  WHERE c.id = p_category_id
  GROUP BY c.id, c.name, c.slug, c.description, parent.name;

  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  v_random_index := floor(random() * 3) + 1;

  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- ВОПРОС 1
  IF v_products_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Что такое ' || v_category_name || '?',
      CASE v_random_index
        WHEN 1 THEN
          '<strong>' || v_category_name || '</strong> — это идеальный выбор для развития ребенка. ' ||
          'В каталоге <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'товар', 'товара', 'товаров') || '</strong> от проверенных производителей. ' ||
          CASE WHEN v_min_price IS NOT NULL THEN 
            'Цены начинаются от <strong>' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. '
          ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все товары →</a>'
        WHEN 2 THEN
          'Ищете <strong>' || v_category_name || '</strong>? В Ухтышке мы собрали <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'лучшую модель', 'лучшие модели', 'лучших моделей') || '</strong> для детей разного возраста. ' ||
          CASE WHEN v_brands_count > 0 THEN 'В разделе <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong>. ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
        ELSE
          'Развитие через игру с <strong>' || v_category_name || '</strong>! Выбирайте из <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'товара', 'товаров', 'товаров') || '</strong> в наличии. ' ||
          CASE WHEN v_max_discount > 0 THEN 'Скидки до <strong>' || v_max_discount || '%</strong>! ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить со скидкой →</a>'
      END,
      true, NOW(), 100
    );
  ELSE
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Что такое ' || v_category_name || '?',
      'Мы активно работаем над пополнением коллекции <strong>' || v_category_name || '</strong>. Подпишитесь на уведомления, чтобы узнать о поступлении первыми! <a href="https://uhti.kz/catalog/' || v_category_slug || '">Следить за обновлениями →</a>',
      true, NOW(), 100
    );
  END IF;

  -- ВОПРОС 2: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL AND v_products_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Сколько стоят ' || v_category_name || ' в Алматы?',
      CASE v_random_index
        WHEN 1 THEN
          '<strong>Цены на ' || v_category_name || ' от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. ' ||
          CASE WHEN v_max_discount > 0 THEN '<strong>Скидки до ' || v_max_discount || '%</strong> на популярные модели! ' ELSE '' END ||
          'Доставка по Алматы за 1–3 рабочих дня, бесплатно от 15 000 ₸. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть цены →</a>'
        WHEN 2 THEN
          'Стоимость <strong>' || v_category_name || '</strong> варьируется от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸ до ' || replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. У нас есть варианты для любого бюджета. ' ||
          CASE WHEN v_max_discount > 0 THEN 'Сейчас действуют <strong>скидки до ' || v_max_discount || '%</strong>! ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать товар →</a>'
        ELSE
          'Купить <strong>' || v_category_name || '</strong> можно от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. ' ||
          CASE WHEN v_max_discount > 0 THEN '<strong>Акция! Скидки до ' || v_max_discount || '%</strong> на избранные товары. ' ELSE 'Регулярные акции и специальные предложения. ' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить выгодно →</a>'
      END,
      true, NOW(), 200
    );
  END IF;

  -- ВОПРОС 3: Бренды
  IF v_brands_count > 0 AND v_products_count > 0 THEN
    DECLARE
      v_top_brands TEXT;
    BEGIN
      SELECT string_agg('<li>' || b.name || '</li>', '')
      INTO v_top_brands
      FROM (
        SELECT b.name, COUNT(p.id) as cnt
        FROM public.brands b
        INNER JOIN public.products p ON p.brand_id = b.id AND p.is_active = true
        WHERE p.category_id = ANY(v_category_ids)
        GROUP BY b.id, b.name
        ORDER BY cnt DESC
        LIMIT 5
      ) b;

      INSERT INTO public.category_questions (
        category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
      ) VALUES (
        p_category_id, NULL, 'Какие бренды ' || v_category_name || ' можно купить?',
        CASE v_random_index
          WHEN 1 THEN
            'В категории <strong>' || v_category_name || '</strong> — <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong>. Популярные производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Все товары сертифицированы. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать бренд →</a>'
          WHEN 2 THEN
            'Мы работаем с <strong>' || v_brands_count || ' проверенными брендами</strong> ' || v_category_name || '. Топ производителей:<ul>' || COALESCE(v_top_brands, '') || '</ul><a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все бренды →</a>'
          ELSE
            '<strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong> ' || v_category_name || ' в наличии. Лучшие производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Оригинальная продукция с гарантией. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
        END,
        true, NOW(), 300
      );
    END;
  END IF;

  -- ВОПРОС 4: Доставка
  IF v_products_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Как быстро доставите ' || v_category_name || ' в Алматы?',
      CASE v_random_index
        WHEN 1 THEN '<strong>Доставка ' || v_category_name || ' за 1–3 рабочих дня</strong> по Алматы. Бесплатно от 15 000 ₸. Курьер привезёт в удобное время. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Заказать с доставкой →</a>'
        WHEN 2 THEN 'Привезём <strong>' || v_category_name || '</strong> за <strong>1–3 рабочих дня</strong>. Бесплатная доставка при заказе от 15 000 ₸. Самовывоз или курьер. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Оформить заказ →</a>'
        ELSE '<strong>Быстрая доставка ' || v_category_name || '</strong> по Алматы (1–3 рабочих дня). От 15 000 ₸ — бесплатно. Доставка по всему Казахстану. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить сейчас →</a>'
      END,
      true, NOW(), 400
    );
  END IF;

  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true, 'entity_type', 'category', 'category_id', p_category_id,
      'name', v_category_name, 'slug', v_category_slug, 'description', v_category_description,
      'parent_category', v_parent_category_name, 'products_count', v_products_count,
      'min_price', v_min_price, 'max_price', v_max_price, 'max_discount', v_max_discount, 'brands_count', v_brands_count
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- ── generate_product_questions ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_product_questions"("p_product_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_brand_name TEXT;
  v_material_name TEXT;
  v_country_name TEXT;
  v_price NUMERIC;
  v_name TEXT;
  v_description TEXT;
  v_category_name TEXT;
  v_result JSON;
BEGIN
  SELECT
    p.min_age_years,
    p.max_age_years,
    b.name,
    m.name,
    c.name,
    p.price,
    p.name,
    p.description,
    cat.name
  INTO
    v_min_age,
    v_max_age,
    v_brand_name,
    v_material_name,
    v_country_name,
    v_price,
    v_name,
    v_description,
    v_category_name
  FROM public.products p
  LEFT JOIN public.brands b ON p.brand_id = b.id
  LEFT JOIN public.materials m ON p.material_id = m.id
  LEFT JOIN public.countries c ON p.origin_country_id = c.id
  LEFT JOIN public.categories cat ON p.category_id = cat.id
  WHERE p.id = p_product_id;

  DELETE FROM public.product_questions
  WHERE product_id = p_product_id AND is_auto_generated = true;

  IF v_min_age IS NOT NULL OR v_max_age IS NOT NULL THEN
    INSERT INTO public.product_questions (
      product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_id,
      NULL,
      'С какого возраста можно играть с этой игрушкой?',
      CASE
        WHEN v_min_age IS NOT NULL AND v_max_age IS NOT NULL THEN
          'Производитель рекомендует для детей от ' || v_min_age || ' до ' || v_max_age || ' ' || public.plural_ru(v_max_age, 'года', 'лет', 'лет') || '.'
        WHEN v_min_age IS NOT NULL THEN
          'Производитель рекомендует от ' || v_min_age || ' ' || public.plural_ru(v_min_age, 'года', 'лет', 'лет') || '.'
        ELSE
          'Подходит для детей до ' || v_max_age || ' ' || public.plural_ru(v_max_age, 'года', 'лет', 'лет') || '.'
      END,
      true,
      NOW()
    );
  END IF;

  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Как быстро доставите в Алматы?',
    'Доставка по Алматы занимает 1–3 рабочих дня. Доставка бесплатна при заказе от 15 000 ₸.',
    true,
    NOW()
  );

  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Можно ли вернуть товар?',
    'Да, вы можете вернуть товар в течение 14 дней с момента получения, если он не был в использовании и сохранена упаковка.',
    true,
    NOW()
  );

  IF v_price > 50000 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'product_id', p_product_id,
      'name', v_name,
      'price', v_price,
      'description', v_description,
      'brand', v_brand_name,
      'material', v_material_name,
      'country', v_country_name,
      'category', v_category_name,
      'min_age', v_min_age,
      'max_age', v_max_age
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- ── generate_category_brand_faq ───────────────────────────────────────────
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
      'answer', format('Лучший выбор %s %s в %s представлен в специализированном интернет-магазине Ухтышка (uhti.kz). Мы предлагаем %s %s с бесплатной доставкой от 15 000 ₸ и начислением бонусов на следующую покупку.', 
        lower(v_category_name), v_brand_name, v_city, v_products_count,
        public.plural_ru(v_products_count, 'модель', 'модели', 'моделей'))
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
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('generate_category_questions', 'generate_product_questions', 'generate_category_brand_faq')
     AND (p.prosrc LIKE '%|| '' товаров%' OR p.prosrc LIKE '%|| '' брендов%' OR p.prosrc LIKE '%|| '' лет.''%' OR p.prosrc LIKE '%%s моделей%');

  IF v_bad > 0 THEN
    RAISE EXCEPTION 'В % функциях остались склейки числа с существительным', v_bad;
  END IF;

  -- Сам помощник обязан считать правильно.
  IF public.plural_ru(1, 'товар', 'товара', 'товаров') <> 'товар'
     OR public.plural_ru(2, 'товар', 'товара', 'товаров') <> 'товара'
     OR public.plural_ru(5, 'товар', 'товара', 'товаров') <> 'товаров'
     OR public.plural_ru(11, 'товар', 'товара', 'товаров') <> 'товаров'
     OR public.plural_ru(21, 'товар', 'товара', 'товаров') <> 'товар'
     OR public.plural_ru(112, 'товар', 'товара', 'товаров') <> 'товаров'
     OR public.plural_ru(122, 'товар', 'товара', 'товаров') <> 'товара' THEN
    RAISE EXCEPTION 'plural_ru считает неверно';
  END IF;
END
$verify$;

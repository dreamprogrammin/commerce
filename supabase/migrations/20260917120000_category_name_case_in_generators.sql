-- Названия разделов в сгенерированных вопросах — в нужном падеже.
--
-- ЧТО СЛОМАНО. Генераторы вставляют название раздела в шаблон как есть, а
-- шаблоны требуют разных падежей. Замер прод-базы 17 сентября 2026 — 78
-- мест, и это видно покупателю в блоке вопросов на странице раздела:
--
--   «Стоимость Питомцы сюрпризы варьируется…»   (нужен родительный)
--   «Какие бренды Машинки можно купить?»         (нужен родительный)
--   «Развитие через игру с Интерактивные куклы!» (нужен творительный)
--   «Доставка Куклы за 1–3 рабочих дня»          (нужен родительный)
--
-- Поверх этого — сами названия у семи разделов стоят в дательном падеже:
-- «Девочкам», «Мальчикам», «Малышам», «Конструкторы мальчикам». Для меню это
-- верно («игрушки — девочкам»), а как подлежащее даёт «Что такое Питомцы
-- мальчикам?». Проверено на живой `/catalog/boys/pitomcy-malchikam`: это
-- заголовок <h3>, не служебный текст.
--
-- ЧЕМ ЧИНИМ — ДВЕ ВЕЩИ СРАЗУ.
--
-- 1. Источник названия. В `categories` есть колонка `seo_h1` с читаемой
--    формой: «Питомцы для мальчиков», «Конструкторы для девочек», «Куклы для
--    девочек». Заполнена у 52 разделов из 64, в 47 случаях отличается от
--    `name`. Генераторы переходят на неё: COALESCE(NULLIF(btrim(seo_h1),''), name).
--    Где `seo_h1` пуст — поведение прежнее, берётся `name`.
--
--    Отдельную колонку не заводим: `seo_h1` и есть человеческое имя раздела
--    для страницы, а второе такое же поле пришлось бы заполнять дважды и
--    следить, чтобы они не разошлись.
--
-- 2. Сами шаблоны. Склонять произвольное русское словосочетание в PL/pgSQL
--    нечем, поэтому переписаны те места, где падеж был нужен, — так, чтобы
--    везде годился именительный:
--
--      «Стоимость X варьируется от …»  →  «Цены в разделе «X» — от …»
--      «Какие бренды X можно купить?»  →  «Какие бренды можно купить в разделе «X»?»
--      «Развитие через игру с X!»      →  «Раздел «X» — развитие через игру.»
--      «Доставка X за 1–3 дня»         →  «Доставим X за 1–3 рабочих дня»
--      «Лучший выбор X Brand …»        →  «Купить X Brand … можно в Ухтышке»
--
--    Где падеж совпадает с именительным (винительный у неодушевлённых во
--    множественном числе — «Ищете X?», «Привезём X»), шаблон не тронут.
--
-- ПОЧЕМУ lower() ЗАМЕНЁН. `generate_category_brand_faq` делал `lower(name)`
-- целиком, и аббревиатуры ломались: «куклы l.o.l для девочек Mattel». Теперь
-- строчной делается только первая буква — `public.lower_first`.
--
-- ЧЕГО МИГРАЦИЯ НЕ ДЕЛАЕТ. Не перегенерирует уже записанные вопросы и не
-- заполняет `seo_h1` там, где он пуст или сам в дательном падеже (`girls`,
-- `boys`, `kiddy`, `konstruktory-malchikam`, `konstruktory-malysham`).
-- И то, и другое — в `docs/SEO_CATEGORY_CASE_2026_09_17.sql`, который
-- запускает владелец ПОСЛЕ применения миграции.
--
-- Тела функций сняты с ПРОДА (`supabase db dump --linked`, 17 сентября 2026),
-- а не взяты из репозитория: они уже расходились.

-- Проверка состояния: миграция готовилась под эти сигнатуры.
DO $check$
BEGIN
  IF to_regprocedure('public.generate_category_questions(uuid, boolean)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции generate_category_questions(uuid, boolean) — база не та, под которую готовилась миграция';
  END IF;
  IF to_regprocedure('public.generate_category_brand_faq(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции generate_category_brand_faq(uuid, uuid) — база не та, под которую готовилась миграция';
  END IF;
  IF to_regprocedure('public.plural_ru(integer, text, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции plural_ru — сначала должна приехать миграция 20260916150000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'seo_h1'
  ) THEN
    RAISE EXCEPTION 'В categories нет колонки seo_h1 — переводить генераторы не на что';
  END IF;
END
$check$;


-- Строчная только первая буква: lower() целиком ломает аббревиатуры
-- («куклы l.o.l»), а середине предложения нужна именно строчная первая.
CREATE OR REPLACE FUNCTION public.lower_first(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN t IS NULL OR t = '' THEN t
    ELSE lower(left(t, 1)) || substr(t, 2)
  END;
$fn$;

COMMENT ON FUNCTION public.lower_first(text) IS
  'Строчная первая буква, остальное без изменений. Для подстановки названий в середину предложения.';


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
  -- То же название со строчной буквы — для середины предложения.
  v_name_l TEXT;
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
    -- Читаемая форма названия вместо падежной, см. шапку миграции.
    COALESCE(NULLIF(btrim(c.seo_h1), ''), c.name),
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
  GROUP BY c.id, c.name, c.seo_h1, c.slug, c.description, parent.name;

  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  v_name_l := public.lower_first(v_category_name);

  v_random_index := floor(random() * 3) + 1;

  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- ВОПРОС 1
  IF v_products_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Что такое ' || v_name_l || '?',
      CASE v_random_index
        WHEN 1 THEN
          '<strong>' || v_category_name || '</strong> — это идеальный выбор для развития ребенка. ' ||
          'В каталоге <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'товар', 'товара', 'товаров') || '</strong> от проверенных производителей. ' ||
          CASE WHEN v_min_price IS NOT NULL THEN 
            'Цены начинаются от <strong>' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. '
          ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все товары →</a>'
        WHEN 2 THEN
          'В разделе «<strong>' || v_category_name || '</strong>» мы собрали <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'лучшую модель', 'лучшие модели', 'лучших моделей') || '</strong> для детей разного возраста. ' ||
          CASE WHEN v_brands_count > 0 THEN 'В разделе <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong>. ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
        ELSE
          'Раздел «<strong>' || v_category_name || '</strong>» — развитие через игру. Выбирайте из <strong>' || v_products_count || ' ' || public.plural_ru(v_products_count, 'товара', 'товаров', 'товаров') || '</strong> в наличии. ' ||
          CASE WHEN v_max_discount > 0 THEN 'Скидки до <strong>' || v_max_discount || '%</strong>! ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить со скидкой →</a>'
      END,
      true, NOW(), 100
    );
  ELSE
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Что такое ' || v_name_l || '?',
      'Мы активно работаем над пополнением раздела «<strong>' || v_category_name || '</strong>». Подпишитесь на уведомления, чтобы узнать о поступлении первыми! <a href="https://uhti.kz/catalog/' || v_category_slug || '">Следить за обновлениями →</a>',
      true, NOW(), 100
    );
  END IF;

  -- ВОПРОС 2: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL AND v_products_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id, NULL, 'Сколько стоят ' || v_name_l || ' в Алматы?',
      CASE v_random_index
        WHEN 1 THEN
          '<strong>Цены в разделе «' || v_category_name || '» — от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. ' ||
          CASE WHEN v_max_discount > 0 THEN '<strong>Скидки до ' || v_max_discount || '%</strong> на популярные модели! ' ELSE '' END ||
          'Доставка по Алматы за 1–3 рабочих дня, бесплатно от 15 000 ₸. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть цены →</a>'
        WHEN 2 THEN
          'Цены в разделе «<strong>' || v_category_name || '</strong>» — от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸ до ' || replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. У нас есть варианты для любого бюджета. ' ||
          CASE WHEN v_max_discount > 0 THEN 'Сейчас действуют <strong>скидки до ' || v_max_discount || '%</strong>! ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать товар →</a>'
        ELSE
          'В разделе «<strong>' || v_category_name || '</strong>» цены начинаются от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. ' ||
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
        p_category_id, NULL, 'Какие бренды можно купить в разделе «' || v_category_name || '»?',
        CASE v_random_index
          WHEN 1 THEN
            'В разделе «<strong>' || v_category_name || '</strong>» — <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong>. Популярные производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Все товары сертифицированы. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать бренд →</a>'
          WHEN 2 THEN
            'В разделе «<strong>' || v_category_name || '</strong>» мы работаем с <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'проверенным брендом', 'проверенными брендами', 'проверенными брендами') || '</strong>. Топ производителей:<ul>' || COALESCE(v_top_brands, '') || '</ul><a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все бренды →</a>'
          ELSE
            'В разделе «<strong>' || v_category_name || '</strong>» — <strong>' || v_brands_count || ' ' || public.plural_ru(v_brands_count, 'бренд', 'бренда', 'брендов') || '</strong> в наличии. Лучшие производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Оригинальная продукция с гарантией. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
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
      p_category_id, NULL, 'Как быстро доставите товары из раздела «' || v_category_name || '» в Алматы?',
      CASE v_random_index
        WHEN 1 THEN '<strong>Доставим заказ за 1–3 рабочих дня</strong> по Алматы. Бесплатно от 15 000 ₸. Курьер привезёт в удобное время. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Заказать с доставкой →</a>'
        WHEN 2 THEN 'Привезём заказ за <strong>1–3 рабочих дня</strong>. Бесплатная доставка при заказе от 15 000 ₸. Самовывоз или курьер. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Оформить заказ →</a>'
        ELSE '<strong>Доставка по Алматы — 1–3 рабочих дня</strong>. От 15 000 ₸ — бесплатно. Доставка по всему Казахстану. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить сейчас →</a>'
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
    -- Читаемая форма названия вместо падежной, см. шапку миграции.
    COALESCE(NULLIF(btrim(c.seo_h1), ''), c.name),
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
  GROUP BY c.name, c.seo_h1, b.name;

  -- Генерируем FAQ
  v_faq := jsonb_build_array(
    jsonb_build_object(
      'question', format('Где купить %s %s в %s?', public.lower_first(v_category_name), v_brand_name, v_city),
      'answer', format('Купить %s %s в %s можно в интернет-магазине Ухтышка (uhti.kz). В наличии %s %s, бесплатная доставка от 15 000 ₸ и бонусы на следующую покупку.', 
        public.lower_first(v_category_name), v_brand_name, v_city, v_products_count,
        public.plural_ru(v_products_count, 'модель', 'модели', 'моделей'))
    ),
    jsonb_build_object(
      'question', format('Сколько стоят %s %s?', public.lower_first(v_category_name), v_brand_name),
      'answer', CASE
        WHEN v_min_price = v_max_price THEN
          format('%s %s в Ухтышке — %s ₸.',
            v_category_name, v_brand_name,
            replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' '))
        ELSE
          format('Цены на %s %s в Ухтышке — от %s до %s ₸.',
            public.lower_first(v_category_name), v_brand_name,
            replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' '),
            replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' '))
      END
    ),
    jsonb_build_object(
      'question', format('Как быстро доставят %s %s в %s?', public.lower_first(v_category_name), v_brand_name, v_city),
      'answer', format('%s %s доставим по %s за 1–3 рабочих дня. Бесплатно при заказе от 15 000 ₸. Также доступен самовывоз из пункта выдачи.',
        v_category_name, v_brand_name, v_city)
    ),
    jsonb_build_object(
      'question', format('Оригинальные ли %s %s в Ухтышке?', public.lower_first(v_category_name), v_brand_name),
      'answer', format('Да, мы работаем только с официальными поставщиками %s и проверяем каждый товар перед отправкой. На все %s %s предоставляется гарантия качества.',
        v_brand_name, public.lower_first(v_category_name), v_brand_name)
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


-- Проверка после замены.
DO $after$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(p.proname, ', ')
    INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('generate_category_questions', 'generate_category_brand_faq')
     AND pg_get_functiondef(p.oid) NOT LIKE '%seo_h1%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Функции не перешли на seo_h1: %', v_bad;
  END IF;

  -- Падежные обороты, которые переписаны, не должны остаться в телах.
  SELECT string_agg(p.proname, ', ')
    INTO v_bad
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('generate_category_questions', 'generate_category_brand_faq')
     AND (pg_get_functiondef(p.oid) LIKE '%Стоимость <strong>%'
       OR pg_get_functiondef(p.oid) LIKE '%Какие бренды '' ||%'
       OR pg_get_functiondef(p.oid) LIKE '%Развитие через игру с%'
       OR pg_get_functiondef(p.oid) LIKE '%Лучший выбор%'
       OR pg_get_functiondef(p.oid) LIKE '%lower(v_category_name)%');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'В телах остались обороты, требующие склонения: %', v_bad;
  END IF;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'generate_category_questions') <> 1 THEN
    RAISE EXCEPTION 'generate_category_questions существует не в одном экземпляре';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'generate_category_brand_faq') <> 1 THEN
    RAISE EXCEPTION 'generate_category_brand_faq существует не в одном экземпляре';
  END IF;
END
$after$;

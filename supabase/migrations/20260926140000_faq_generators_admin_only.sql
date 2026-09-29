-- Генераторы вопросов (FAQ) — только для администратора.
--
-- ЧТО БЫЛО (боевая база, 26 сентября 2026). Все 14 функций generate_*, которыми
-- админка собирает вопросы брендов, разделов, товаров, серий, стран и
-- материалов, исполнялись ролями anon и PUBLIC — то есть любым, у кого есть
-- публичный ключ, а он стоит в разметке сайта. Проверено запросом с этим
-- ключом: POST /rest/v1/rpc/generate_brand_questions ответил 200 (id был
-- несуществующий — функция вернулась до записи, ничего не поменялось).
--
-- Шесть из них — SECURITY DEFINER и пишут в обход RLS: с настоящим id удаляют
-- автоматические вопросы бренда, раздела, товара, серии, страны или материала
-- и собирают заново, а generate_questions_for_all_products() делает это со
-- всеми товарами разом. Ручная правка автоматического ответа при этом
-- затирается, а цикл таких вызовов — лишняя нагрузка на ту же базу, что
-- принимает заказы.
--
-- Снять права только у anon мало: войти через Google может кто угодно, и те же
-- вызовы пойдут с ролью authenticated. Её отнять нельзя — под ней работает
-- админка. Поэтому:
--   • шесть SECURITY DEFINER-генераторов первой строкой зовут
--     assert_faq_generator_caller(): вызов через API с ролью anon или
--     authenticated проходит только у администратора (is_admin()).
--     service_role и вызовы без токена — SQL-редактор, миграции, SQL-файлы
--     из docs/ — работают как прежде. Триггеры auto_generate_*_faq тоже:
--     вставку бренда, раздела, страны, материала или серии делает админ или
--     SQL-редактор;
--   • шесть функций generate_questions_for_all_* проверку получают через
--     них: обработчиков исключений там нет, первый же вызов обрывает весь цикл;
--   • generate_category_brand_faq и generate_faq_for_all_category_brands —
--     SECURITY INVOKER, их запись в category_brand_questions и так режет RLS
--     «Enable write for admins»;
--   • у всех 14 — REVOKE EXECUTE FROM PUBLIC, anon. authenticated и
--     service_role остаются.
--
-- Тела шести генераторов сняты с прода: пять — из дампа 24 сентября, brand —
-- из миграции 20260926120000, применённой 26 сентября. В каждое добавлена одна
-- строка PERFORM и комментарий над ней, больше ничего. Проверка состояния
-- сверяет md5 тел с продом и падает, если их с тех пор меняли, — тогда тела
-- снимать заново. Те же md5 даёт и цепочка миграций репозитория на локальной
-- базе: проверено.
--
-- ЛОВУШКА НА БУДУЩЕЕ. Пересоздание генератора через DROP + CREATE (например,
-- смена подписи, п. 10 CLAUDE.md) вернёт EXECUTE для anon и PUBLIC — так
-- Supabase выдаёт права на новые функции по умолчанию. А CREATE OR REPLACE с
-- телом без строки PERFORM снимет проверку администратора. Как убедиться, что
-- ни того ни другого не случилось, — в проверке в конце этой миграции.

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
DECLARE
  r record;
  v_fn text;
BEGIN
  FOR r IN
    SELECT *
      FROM (VALUES
        ('public.generate_brand_questions(uuid,boolean)',        '673b42a1fc1828a1ca6e860b2a4e2368'),
        ('public.generate_category_questions(uuid,boolean)',     'e189fffcaa2db9fbd7c5fa870a23c338'),
        ('public.generate_country_questions(integer,boolean)',   '00f2cd4356b89dff14d207c61ab03fdb'),
        ('public.generate_material_questions(integer,boolean)',  'dacea7608316a80e3aa4ab180684436c'),
        ('public.generate_product_line_questions(uuid,boolean)', 'eeb8414cb318290d79517aab72d5d3c8'),
        ('public.generate_product_questions(uuid,boolean)',      '388ade4829f0987bf9782b69928ab98e')
      ) AS t(fn, hash)
  LOOP
    IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure(r.fn))) IS DISTINCT FROM r.hash THEN
      RAISE EXCEPTION '% на базе не та, что снята с прода 24–26.09.2026 — тело надо снять заново', r.fn;
    END IF;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.generate_category_brand_faq(uuid,uuid)',
    'public.generate_faq_for_all_category_brands()',
    'public.generate_questions_for_all_brands()',
    'public.generate_questions_for_all_categories()',
    'public.generate_questions_for_all_countries()',
    'public.generate_questions_for_all_materials()',
    'public.generate_questions_for_all_product_lines()',
    'public.generate_questions_for_all_products()',
    'auth.role()'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Нет функции % — база не та, под которую готовилась миграция', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = to_regprocedure('public.is_admin()')
       AND prosrc LIKE '%auth.uid()%' AND prosrc LIKE '%role = ''admin''%'
  ) THEN
    RAISE EXCEPTION 'public.is_admin() не та: проверка администратора опирается на profiles.role = ''admin'' по auth.uid()';
  END IF;
END
$check$;


-- ── Проверка вызывающего ──────────────────────────────────────────────────
-- Роль берётся из токена запроса (auth.role()). Через API у покупателя она
-- anon или authenticated — таким вызовам нужен администратор. service_role и
-- вызовы без токена (SQL-редактор, миграции) пропускаются.
--
-- Права на вызов ей не нужны никому, кроме владельца: генераторы — SECURITY
-- DEFINER, и проверка исполняется от их имени. В API ей делать нечего, поэтому
-- права сняты у всех, кроме service_role.
CREATE OR REPLACE FUNCTION public.assert_faq_generator_caller()
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path = ''
AS $function$
BEGIN
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Генерировать вопросы может только администратор'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assert_faq_generator_caller() FROM PUBLIC, anon, authenticated;


-- ── generate_brand_questions ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_brand_questions"("p_brand_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_brand_name TEXT;
  v_brand_description TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_categories_count INTEGER;
  v_product_lines_count INTEGER;
  v_categories TEXT;
  v_lead TEXT;
  v_first_category TEXT;
  v_rest TEXT;
  v_pos INTEGER;
BEGIN
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

  SELECT b.name, b.description
    INTO v_brand_name, v_brand_description
    FROM public.brands b
   WHERE b.id = p_brand_id;

  IF v_brand_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Brand not found');
  END IF;

  -- Все активные товары бренда разом. Цена — та, что платит покупатель.
  SELECT count(DISTINCT p.id),
         min(p.final_price),
         max(p.final_price),
         count(DISTINCT p.category_id),
         count(DISTINCT p.product_line_id),
         string_agg(DISTINCT COALESCE(NULLIF(btrim(cat.seo_h1), ''), cat.name), ', '
                    ORDER BY COALESCE(NULLIF(btrim(cat.seo_h1), ''), cat.name))
    INTO v_products_count, v_min_price, v_max_price, v_categories_count,
         v_product_lines_count, v_categories
    FROM public.products p
    LEFT JOIN public.categories cat ON cat.id = p.category_id
   WHERE p.brand_id = p_brand_id
     AND p.is_active = true;

  -- Первый абзац описания, который про сам бренд: абзацы про доставку и
  -- наличие («Купить … в Казахстане», «Какие модели сейчас в наличии…»)
  -- пропускаются, разметка внутри абзаца снимается. Ищется позициями, а не
  -- регуляркой `<p>(.*?)</p>`: в PostgreSQL жадность всего выражения задаёт
  -- первый квантификатор, и «ленивая» часть там может дотянуться до
  -- последнего </p>. Нет такого абзаца — ответ без него.
  v_rest := COALESCE(v_brand_description, '');
  LOOP
    v_pos := strpos(v_rest, '<p');
    EXIT WHEN v_pos = 0;
    v_rest := substr(v_rest, v_pos);
    v_pos := strpos(v_rest, '>');
    EXIT WHEN v_pos = 0;
    v_rest := substr(v_rest, v_pos + 1);
    v_pos := strpos(v_rest, '</p>');
    EXIT WHEN v_pos = 0;
    v_lead := btrim(regexp_replace(substr(v_rest, 1, v_pos - 1), '<[^>]+>', '', 'g'));
    v_rest := substr(v_rest, v_pos + 4);
    EXIT WHEN v_lead <> '' AND v_lead !~* '(доставк|самовывоз|в наличии)';
    v_lead := NULL;
  END LOOP;

  DELETE FROM public.brand_questions
   WHERE brand_id = p_brand_id AND is_auto_generated = true;

  -- Вопрос 1: о бренде
  INSERT INTO public.brand_questions (
    brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
  ) VALUES (
    p_brand_id, NULL,
    'Какие игрушки выпускает бренд ' || v_brand_name || '?',
    concat_ws(' ',
      v_lead,
      CASE
        WHEN v_products_count > 0 THEN
          'В каталоге Ухтышки — ' || v_products_count || ' '
          || public.plural_ru(v_products_count, 'модель', 'модели', 'моделей') || ' ' || v_brand_name || '.'
        ELSE
          'Сейчас товаров ' || v_brand_name || ' нет в наличии.'
      END),
    true, NOW(), 100
  );

  -- Вопрос 2: разделы и серии
  IF v_categories_count > 0 THEN
    v_first_category := split_part(v_categories, ', ', 1);
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_brand_id, NULL,
      'В каких категориях представлены игрушки ' || v_brand_name || '?',
      'Игрушки бренда ' || v_brand_name || ' — '
      || CASE
           WHEN v_categories_count = 1 THEN 'в разделе «' || v_first_category || '»'
           ELSE 'в разделах: ' || v_categories
         END || '.'
      || CASE
           WHEN v_product_lines_count > 0 THEN
             ' В каталоге ' || v_product_lines_count || ' '
             || public.plural_ru(v_product_lines_count, 'серия', 'серии', 'серий') || ' бренда.'
           ELSE ''
         END,
      true, NOW(), 200
    );
  END IF;

  -- Вопрос 3: цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_brand_id, NULL,
      'Сколько стоят игрушки ' || v_brand_name || '?',
      'Цены на игрушки ' || v_brand_name || ' в Ухтышке — '
      || CASE
           WHEN round(v_min_price) = round(v_max_price) THEN
             replace(to_char(round(v_min_price)::bigint, 'FM999,999,999'), ',', ' ') || ' ₸'
           ELSE
             'от ' || replace(to_char(round(v_min_price)::bigint, 'FM999,999,999'), ',', ' ')
             || ' до ' || replace(to_char(round(v_max_price)::bigint, 'FM999,999,999'), ',', ' ') || ' ₸'
         END
      || ', цена каждой модели — в её карточке.',
      true, NOW(), 300
    );
  END IF;

  RETURN json_build_object('needs_ai', false);
END;
$$;


-- ── generate_category_questions ───────────────────────────────────────────────
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
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

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


-- ── generate_country_questions ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_country_questions"("p_country_id" integer, "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_country_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_brands_count INTEGER;
  v_top_brands TEXT;
  v_result JSON;
BEGIN
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

  -- Получаем данные страны с брендами
  SELECT
    c.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id),
    string_agg(DISTINCT b.name, ', ' ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL)
  INTO
    v_country_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count,
    v_top_brands
  FROM public.countries c
  LEFT JOIN public.products p ON p.origin_country_id = c.id AND p.is_active = true
  LEFT JOIN public.brands b ON p.brand_id = b.id
  WHERE c.id = p_country_id
  GROUP BY c.id, c.name;

  IF v_country_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Country not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.country_questions
  WHERE country_id = p_country_id AND is_auto_generated = true;

  -- Вопрос 1: О стране
  INSERT INTO public.country_questions (
    country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_country_id, NULL,
    'Какие игрушки из страны "' || v_country_name || '" вы продаете?',
    'В нашем каталоге представлено ' || v_products_count || ' игрушек производства "' || v_country_name || '" от ' || v_brands_count || ' брендов.',
    true, NOW()
  );

  -- Вопрос 2: Бренды
  IF v_brands_count > 0 AND v_top_brands IS NOT NULL THEN
    INSERT INTO public.country_questions (
      country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_country_id, NULL,
      'Какие бренды игрушек из страны "' || v_country_name || '" представлены?',
      'Игрушки производства "' || v_country_name || '" представлены брендами: ' || v_top_brands || '.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Качество
  INSERT INTO public.country_questions (
    country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_country_id, NULL,
    'Какое качество у игрушек из страны "' || v_country_name || '"?',
    'Все игрушки производства "' || v_country_name || '" соответствуют международным стандартам качества и безопасности для детских товаров.',
    true, NOW()
  );

  -- Вопрос 4: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.country_questions (
      country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_country_id, NULL,
      'Сколько стоят игрушки из страны "' || v_country_name || '"?',
      'Цены на игрушки производства "' || v_country_name || '" от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- AI для популярных стран
  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'country',
      'country_id', p_country_id,
      'name', v_country_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price,
      'brands_count', v_brands_count,
      'top_brands', v_top_brands
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;


-- ── generate_material_questions ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_material_questions"("p_material_id" integer, "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_material_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_brands_count INTEGER;
  v_top_brands TEXT;
  v_result JSON;
BEGIN
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

  -- Получаем данные материала с брендами
  SELECT
    m.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id),
    string_agg(DISTINCT b.name, ', ' ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL)
  INTO
    v_material_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count,
    v_top_brands
  FROM public.materials m
  LEFT JOIN public.products p ON p.material_id = m.id AND p.is_active = true
  LEFT JOIN public.brands b ON p.brand_id = b.id
  WHERE m.id = p_material_id
  GROUP BY m.id, m.name;

  IF v_material_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Material not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.material_questions
  WHERE material_id = p_material_id AND is_auto_generated = true;

  -- Вопрос 1: О материале
  INSERT INTO public.material_questions (
    material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_material_id, NULL,
    'Какие игрушки из материала "' || v_material_name || '" вы продаете?',
    'В нашем ассортименте представлено ' || v_products_count || ' игрушек из материала "' || v_material_name || '" от ' || v_brands_count || ' ведущих брендов.',
    true, NOW()
  );

  -- Вопрос 2: Бренды
  IF v_brands_count > 0 AND v_top_brands IS NOT NULL THEN
    INSERT INTO public.material_questions (
      material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_material_id, NULL,
      'Какие бренды выпускают игрушки из материала "' || v_material_name || '"?',
      'Игрушки из материала "' || v_material_name || '" представлены брендами: ' || v_top_brands || '.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Безопасность
  INSERT INTO public.material_questions (
    material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_material_id, NULL,
    'Безопасны ли игрушки из материала "' || v_material_name || '"?',
    'Да, все игрушки из материала "' || v_material_name || '" в нашем магазине сертифицированы и абсолютно безопасны для детей.',
    true, NOW()
  );

  -- Вопрос 4: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.material_questions (
      material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_material_id, NULL,
      'Сколько стоят игрушки из материала "' || v_material_name || '"?',
      'Цены на игрушки из материала "' || v_material_name || '" от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- AI для популярных материалов
  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'material',
      'material_id', p_material_id,
      'name', v_material_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price,
      'brands_count', v_brands_count,
      'top_brands', v_top_brands
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;


-- ── generate_product_line_questions ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_product_line_questions"("p_product_line_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_line_name TEXT;
  v_line_description TEXT;
  v_brand_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_min_months INTEGER;
  v_max_months INTEGER;
  v_result JSON;
BEGIN
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

  -- Получаем данные линейки
  SELECT
    pl.name,
    pl.description,
    b.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    MIN(p.min_age_years),
    MAX(p.max_age_years),
    MIN(p.min_age_months),
    MAX(p.max_age_months)
  INTO
    v_line_name,
    v_line_description,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_min_age,
    v_max_age,
    v_min_months,
    v_max_months
  FROM public.product_lines pl
  LEFT JOIN public.brands b ON pl.brand_id = b.id
  LEFT JOIN public.products p ON p.product_line_id = pl.id AND p.is_active = true
  WHERE pl.id = p_product_line_id
  GROUP BY pl.id, pl.name, pl.description, b.name;

  IF v_line_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Product line not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.product_line_questions
  WHERE product_line_id = p_product_line_id AND is_auto_generated = true;

  -- Вопрос 1: О линейке
  INSERT INTO public.product_line_questions (
    product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_line_id, NULL,
    'Что такое линейка игрушек "' || v_line_name || '"?',
    CASE
      WHEN v_line_description IS NOT NULL THEN
        v_line_description || ' Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' включает ' || v_products_count || ' игрушек.'
      ELSE
        'Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' - популярная серия игрушек. В ассортименте ' || v_products_count || ' различных игрушек.'
    END,
    true, NOW()
  );

  -- Вопрос 2: Производитель
  IF v_brand_name IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Кто производит линейку "' || v_line_name || '"?',
      'Линейка "' || v_line_name || '" производится компанией ' || v_brand_name || ' - известным брендом качественных игрушек для детей.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Сколько стоят игрушки линейки "' || v_line_name || '"?',
      'Цены на игрушки линейки "' || v_line_name || '" варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Возраст
  IF v_min_months IS NOT NULL OR v_max_months IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Для какого возраста подходят игрушки "' || v_line_name || '"?',
      'Игрушки линейки "' || v_line_name || '" рекомендованы для детей ' ||
      -- Возраст словами, как на сайте (utils/productAge.ts). Было «от 1 лет».
      public.age_range_ru(v_min_months, v_max_months) || '.',
      true, NOW()
    );
  END IF;

  -- AI для популярных линеек
  IF v_products_count > 15 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'product_line',
      'product_line_id', p_product_line_id,
      'name', v_line_name,
      'description', v_line_description,
      'brand_name', v_brand_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;


-- ── generate_product_questions ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."generate_product_questions"("p_product_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_min_months INTEGER;
  v_max_months INTEGER;
  v_brand_name TEXT;
  v_material_name TEXT;
  v_country_name TEXT;
  v_price NUMERIC;
  v_name TEXT;
  v_description TEXT;
  v_category_name TEXT;
  v_result JSON;
BEGIN
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

  SELECT
    p.min_age_years,
    p.max_age_years,
    p.min_age_months,
    p.max_age_months,
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
    v_min_months,
    v_max_months,
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

  IF v_min_months IS NOT NULL OR v_max_months IS NOT NULL THEN
    INSERT INTO public.product_questions (
      product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_id,
      NULL,
      'С какого возраста можно играть с этой игрушкой?',
      -- Возраст словами, как на сайте (utils/productAge.ts): «от 6 месяцев»,
      -- «от 1 года», «от 6 месяцев до 3 лет». Было «от 1 лет».
      'Производитель рекомендует для детей ' || public.age_range_ru(v_min_months, v_max_months) || '.',
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


-- ── Права: никакого анонимного вызова ─────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.generate_brand_questions(uuid, boolean),
  public.generate_category_brand_faq(uuid, uuid),
  public.generate_category_questions(uuid, boolean),
  public.generate_country_questions(integer, boolean),
  public.generate_faq_for_all_category_brands(),
  public.generate_material_questions(integer, boolean),
  public.generate_product_line_questions(uuid, boolean),
  public.generate_product_questions(uuid, boolean),
  public.generate_questions_for_all_brands(),
  public.generate_questions_for_all_categories(),
  public.generate_questions_for_all_countries(),
  public.generate_questions_for_all_materials(),
  public.generate_questions_for_all_product_lines(),
  public.generate_questions_for_all_products()
FROM PUBLIC, anon;


-- ── Проверка результата ───────────────────────────────────────────────────
-- Её же можно запускать отдельно после любой будущей правки генераторов.
DO $verify$
DECLARE
  v_fn text;
  v_n integer;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.generate_brand_questions(uuid,boolean)',
    'public.generate_category_brand_faq(uuid,uuid)',
    'public.generate_category_questions(uuid,boolean)',
    'public.generate_country_questions(integer,boolean)',
    'public.generate_faq_for_all_category_brands()',
    'public.generate_material_questions(integer,boolean)',
    'public.generate_product_line_questions(uuid,boolean)',
    'public.generate_product_questions(uuid,boolean)',
    'public.generate_questions_for_all_brands()',
    'public.generate_questions_for_all_categories()',
    'public.generate_questions_for_all_countries()',
    'public.generate_questions_for_all_materials()',
    'public.generate_questions_for_all_product_lines()',
    'public.generate_questions_for_all_products()'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% всё ещё исполняется анонимно', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% потеряла права authenticated или service_role — админка перестанет собирать вопросы', v_fn;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_n
    FROM pg_proc
   WHERE oid IN (
           to_regprocedure('public.generate_brand_questions(uuid,boolean)'),
           to_regprocedure('public.generate_category_questions(uuid,boolean)'),
           to_regprocedure('public.generate_country_questions(integer,boolean)'),
           to_regprocedure('public.generate_material_questions(integer,boolean)'),
           to_regprocedure('public.generate_product_line_questions(uuid,boolean)'),
           to_regprocedure('public.generate_product_questions(uuid,boolean)'))
     AND prosecdef
     AND prosrc LIKE '%PERFORM public.assert_faq_generator_caller();%';
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Проверка администратора стоит в % генераторах из 6', v_n;
  END IF;

  -- По одной версии каждого генератора (п. 10 CLAUDE.md).
  SELECT count(*) INTO v_n
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND (proname LIKE 'generate\_%questions%' OR proname LIKE 'generate\_%category\_brand%');
  IF v_n <> 14 THEN
    RAISE EXCEPTION 'Генераторов вопросов % вместо 14 — появилась перегрузка', v_n;
  END IF;
END
$verify$;

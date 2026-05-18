-- ================================================================================
-- FIX: Использовать generated column final_price вместо ручного расчёта
-- ================================================================================

CREATE OR REPLACE FUNCTION public.generate_category_questions(
  p_category_id UUID,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
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
          'В нашем каталоге представлено <strong>' || v_products_count || ' товаров</strong> от проверенных производителей. ' ||
          CASE WHEN v_min_price IS NOT NULL THEN 
            'Цены начинаются от <strong>' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. '
          ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все товары →</a>'
        WHEN 2 THEN
          'Ищете <strong>' || v_category_name || '</strong>? В Ухтышке мы собрали <strong>' || v_products_count || ' лучших моделей</strong> для детей разного возраста. ' ||
          CASE WHEN v_brands_count > 0 THEN 'Представлено <strong>' || v_brands_count || ' брендов</strong>. ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
        ELSE
          'Развитие через игру с <strong>' || v_category_name || '</strong>! Выбирайте из <strong>' || v_products_count || ' товаров</strong> в наличии. ' ||
          CASE WHEN v_max_discount > 0 THEN '🔥 Скидки до <strong>' || v_max_discount || '%</strong>! ' ELSE '' END ||
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
          CASE WHEN v_max_discount > 0 THEN '🔥 <strong>Скидки до ' || v_max_discount || '%</strong> на популярные модели! ' ELSE '' END ||
          'Доставка по Алматы за 1-2 дня, бесплатно от 10 000 ₸. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть цены →</a>'
        WHEN 2 THEN
          'Стоимость <strong>' || v_category_name || '</strong> варьируется от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸ до ' || replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. У нас есть варианты для любого бюджета. ' ||
          CASE WHEN v_max_discount > 0 THEN 'Сейчас действуют <strong>скидки до ' || v_max_discount || '%</strong>! ' ELSE '' END ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать товар →</a>'
        ELSE
          'Купить <strong>' || v_category_name || '</strong> можно от ' || replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸. ' ||
          CASE WHEN v_max_discount > 0 THEN '🔥 <strong>Акция! Скидки до ' || v_max_discount || '%</strong> на избранные товары. ' ELSE 'Регулярные акции и специальные предложения. ' END ||
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
            'В категории <strong>' || v_category_name || '</strong> представлено <strong>' || v_brands_count || ' брендов</strong>. Популярные производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Все товары сертифицированы. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать бренд →</a>'
          WHEN 2 THEN
            'Мы работаем с <strong>' || v_brands_count || ' проверенными брендами</strong> ' || v_category_name || '. Топ производителей:<ul>' || COALESCE(v_top_brands, '') || '</ul><a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все бренды →</a>'
          ELSE
            '<strong>' || v_brands_count || ' брендов</strong> ' || v_category_name || ' в наличии. Лучшие производители:<ul>' || COALESCE(v_top_brands, '') || '</ul>Оригинальная продукция с гарантией. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог →</a>'
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
        WHEN 1 THEN '<strong>Доставка ' || v_category_name || ' за 1-2 дня</strong> по Алматы. Бесплатно от 10 000 ₸. Курьер привезёт в удобное время. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Заказать с доставкой →</a>'
        WHEN 2 THEN 'Привезём <strong>' || v_category_name || '</strong> за <strong>1-2 рабочих дня</strong>. Бесплатная доставка при заказе от 10 000 ₸. Самовывоз или курьер. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Оформить заказ →</a>'
        ELSE '<strong>Быстрая доставка ' || v_category_name || '</strong> по Алматы (1-2 дня). От 10 000 ₸ — бесплатно. Доставка по всему Казахстану. <a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить сейчас →</a>'
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

COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS
'Генерирует уникальные FAQ для категории. Использует final_price (generated column) для корректного расчёта цен со скидками.';

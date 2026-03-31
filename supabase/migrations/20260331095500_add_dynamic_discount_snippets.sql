-- ================================================================================
-- МИГРАЦИЯ: Dynamic Discount Snippets для Google PAA (2026-03-31)
-- ================================================================================
-- Проблема: generate_category_questions использует MIN(price), MAX(price)
-- и не учитывает discount_percentage. В результате:
-- 1. Цены показываются без учета скидок
-- 2. Статично пишем "Акции и скидки", даже если их нет
-- 3. Упускаем возможность показать реальные скидки в Google PAA
--
-- Решение: Обновляем функцию, чтобы она:
-- 1. Высчитывала реальную min_price с учетом discount_percentage
-- 2. Находила максимальную скидку (max_discount) в категории
-- 3. Динамически добавляла "🔥 Прямо сейчас действуют скидки до X%!" если есть
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
  v_result JSON;
BEGIN
  -- Получаем данные категории с учетом скидок
  SELECT
    c.name,
    c.slug,
    c.description,
    parent.name,
    COUNT(DISTINCT p.id),
    -- 🔥 Реальная минимальная цена с учетом скидки
    MIN(
      CASE 
        WHEN p.discount_percentage > 0 THEN 
          ROUND(p.price * (100 - p.discount_percentage) / 100)
        ELSE 
          p.price
      END
    ),
    -- 🔥 Реальная максимальная цена с учетом скидки
    MAX(
      CASE 
        WHEN p.discount_percentage > 0 THEN 
          ROUND(p.price * (100 - p.discount_percentage) / 100)
        ELSE 
          p.price
      END
    ),
    -- 🔥 Максимальная скидка в категории
    MAX(COALESCE(p.discount_percentage, 0)),
    COUNT(DISTINCT p.brand_id)
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
  LEFT JOIN public.products p ON p.category_id = c.id AND p.is_active = true
  WHERE c.id = p_category_id
  GROUP BY c.id, c.name, c.slug, c.description, parent.name;

  -- Если категория не найдена
  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы для этой категории
  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- ========================================
  -- ВОПРОС 1: Что входит в категорию (ОПТИМИЗИРОВАН ДЛЯ PAA)
  -- ========================================
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
  ) VALUES (
    p_category_id,
    NULL,
    'Что такое ' || v_category_name || '?',
    -- Первое предложение = четкое определение (до 160 символов)
    CASE
      WHEN v_category_description IS NOT NULL THEN
        v_category_description || ' В нашем каталоге представлено <strong>' || v_products_count || ' товаров</strong> в категории "' || v_category_name || '". ' ||
        '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все товары в категории ' || v_category_name || '</a>.'
      ELSE
        '<strong>' || v_category_name || '</strong> — это категория детских игрушек, представленная в нашем магазине. ' ||
        'В каталоге доступно <strong>' || v_products_count || ' товаров</strong> различных брендов. ' ||
        '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Перейти в каталог ' || v_category_name || '</a>.'
    END,
    true,
    NOW(),
    100  -- Высокий приоритет
  );

  -- ========================================
  -- ВОПРОС 2: Цены (DYNAMIC DISCOUNT SNIPPETS 🔥)
  -- ========================================
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_category_id,
      NULL,
      'Сколько стоят ' || v_category_name || ' в Алматы?',
      CASE
        WHEN v_min_price = v_max_price THEN
          '<strong>Цена на ' || v_category_name || ' составляет ' ||
          replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. ' ||
          -- 🔥 Динамическая вставка скидки
          CASE 
            WHEN v_max_discount > 0 THEN
              '🔥 <strong>Прямо сейчас действует скидка ' || v_max_discount || '%!</strong> '
            ELSE ''
          END ||
          'Мы предлагаем:<ul>' ||
          '<li>Доставку по Алматы за 1-2 дня</li>' ||
          '<li>Бесплатную доставку от 10 000 ₸</li>' ||
          '<li>Начисление бонусов за покупку</li>' ||
          '</ul>' ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Купить ' || v_category_name || ' с доставкой</a>.'
        ELSE
          '<strong>Цены на ' || v_category_name || ' в Алматы варьируются от ' ||
          replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸ до ' ||
          replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' ') || ' ₸</strong>. ' ||
          -- 🔥 Динамическая вставка скидки
          CASE 
            WHEN v_max_discount > 0 THEN
              '🔥 <strong>Прямо сейчас действуют скидки до ' || v_max_discount || '%!</strong> '
            ELSE ''
          END ||
          'У нас вы найдете:<ul>' ||
          '<li>Бюджетные варианты для экономных покупателей</li>' ||
          '<li>Премиум товары известных брендов</li>' ||
          -- 🔥 Динамический текст в зависимости от наличия скидок
          CASE 
            WHEN v_max_discount > 0 THEN
              '<li>Товары со скидками до ' || v_max_discount || '% на популярные модели</li>'
            ELSE
              '<li>Акции и скидки на популярные модели</li>'
          END ||
          '</ul>' ||
          '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Смотреть все цены на ' || v_category_name || '</a>.'
      END,
      true,
      NOW(),
      200  -- Высокий приоритет
    );
  END IF;

  -- ========================================
  -- ВОПРОС 3: Бренды (ОПТИМИЗИРОВАН: список брендов)
  -- ========================================
  IF v_brands_count > 0 THEN
    DECLARE
      v_top_brands TEXT;
    BEGIN
      -- Получаем топ-5 брендов по количеству товаров
      SELECT string_agg('<li>' || b.name || '</li>', '')
      INTO v_top_brands
      FROM (
        SELECT b.name, COUNT(p.id) as cnt
        FROM public.brands b
        INNER JOIN public.products p ON p.brand_id = b.id AND p.is_active = true
        WHERE p.category_id = p_category_id
        GROUP BY b.id, b.name
        ORDER BY cnt DESC
        LIMIT 5
      ) b;

      INSERT INTO public.category_questions (
        category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
      ) VALUES (
        p_category_id,
        NULL,
        'Какие бренды ' || v_category_name || ' можно купить?',
        '<strong>В категории "' || v_category_name || '" представлено ' || v_brands_count || ' брендов</strong>. ' ||
        'Популярные производители:<ul>' || COALESCE(v_top_brands, '<li>Различные бренды</li>') || '</ul>' ||
        'Все товары сертифицированы и безопасны для детей. ' ||
        '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Выбрать бренд в каталоге</a>.',
        true,
        NOW(),
        300  -- Средний приоритет
      );
    END;
  END IF;

  -- ========================================
  -- ВОПРОС 4: Доставка (ОПТИМИЗИРОВАН: четкий ответ + список)
  -- ========================================
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
  ) VALUES (
    p_category_id,
    NULL,
    'Как быстро доставите ' || v_category_name || ' в Алматы?',
    '<strong>Доставка ' || v_category_name || ' по Алматы занимает 1-2 рабочих дня</strong>. Условия доставки:<ul>' ||
    '<li>Бесплатная доставка при заказе от 10 000 ₸</li>' ||
    '<li>Курьерская доставка по указанному адресу</li>' ||
    '<li>Самовывоз из пункта выдачи</li>' ||
    '<li>Доставка по всему Казахстану</li>' ||
    '</ul>' ||
    '<a href="https://uhti.kz/catalog/' || v_category_slug || '">Заказать ' || v_category_name || ' с доставкой</a>.',
    true,
    NOW(),
    400  -- Средний приоритет
  );

  -- ========================================
  -- ПРЕМИУМ КАТЕГОРИИ: Возвращаем данные для AI-генерации
  -- ========================================

  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'category',
      'category_id', p_category_id,
      'name', v_category_name,
      'slug', v_category_slug,
      'description', v_category_description,
      'parent_category', v_parent_category_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price,
      'max_discount', v_max_discount,
      'brands_count', v_brands_count
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS
'Генерирует FAQ для категории с Dynamic Discount Snippets. Учитывает реальные цены со скидками и динамически показывает актуальные акции в Google PAA.';

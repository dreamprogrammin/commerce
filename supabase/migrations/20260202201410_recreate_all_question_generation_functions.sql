-- Функция для генерации FAQ для категории
CREATE OR REPLACE FUNCTION public.generate_category_questions(
  p_category_id UUID,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_category_name TEXT;
  v_category_description TEXT;
  v_parent_category_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_brands_count INTEGER;
  v_result JSON;
BEGIN
  -- Получаем данные категории
  SELECT
    c.name,
    c.description,
    parent.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id)
  INTO
    v_category_name,
    v_category_description,
    v_parent_category_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count
  FROM public.categories c
  LEFT JOIN public.categories parent ON c.parent_id = parent.id
  LEFT JOIN public.products p ON p.category_id = c.id AND p.is_active = true
  WHERE c.id = p_category_id
  GROUP BY c.id, c.name, c.description, parent.name;

  -- Если категория не найдена
  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы для этой категории
  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- ========================================
  -- БАЗОВЫЕ ВОПРОСЫ (SQL-генерация)
  -- ========================================

  -- Вопрос 1: Что входит в категорию
  INSERT INTO public.category_questions (
    category_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_category_id,
    NULL,
    'Что входит в категорию "' || v_category_name || '"?',
    CASE
      WHEN v_category_description IS NOT NULL THEN
        v_category_description || ' В категории представлено ' || v_products_count || ' товаров.'
      ELSE
        'В категории "' || v_category_name || '" представлено ' || v_products_count || ' товаров различных брендов.'
    END,
    true,
    NOW()
  );

  -- Вопрос 2: Диапазон цен
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.category_questions (
      category_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_category_id,
      NULL,
      'В каком ценовом диапазоне товары в категории "' || v_category_name || '"?',
      'Цены на товары в категории "' || v_category_name || '" варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸. Вы можете найти как бюджетные варианты, так и премиум товары.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос 3: Бренды
  IF v_brands_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_category_id,
      NULL,
      'Какие бренды представлены в категории "' || v_category_name || '"?',
      'В категории "' || v_category_name || '" представлено ' || v_brands_count ||
      ' брендов. Вы можете выбрать товары известных производителей с гарантией качества.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос 4: Доставка (всегда)
  INSERT INTO public.category_questions (
    category_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_category_id,
    NULL,
    'Как быстро доставите товары из категории "' || v_category_name || '"?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Доставка бесплатна при заказе от 10 000 ₸. Доставляем по всему Казахстану!',
    true,
    NOW()
  );

  -- ========================================
  -- ПРЕМИУМ КАТЕГОРИИ: Возвращаем данные для AI-генерации
  -- ========================================

  -- Если категория популярная (много товаров) И не пропускаем AI
  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'category',
      'category_id', p_category_id,
      'name', v_category_name,
      'description', v_category_description,
      'parent_category', v_parent_category_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price,
      'brands_count', v_brands_count
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- Функция для массовой генерации вопросов для всех категорий
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_categories()
RETURNS TABLE(category_id UUID, questions_count INTEGER, is_premium BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_category_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_category_id IN
    SELECT id FROM public.categories WHERE is_active = true
  LOOP
    -- Получаем количество товаров
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.category_id = v_category_id AND is_active = true;

    -- Генерируем только базовые вопросы (skip_ai = true)
    PERFORM generate_category_questions(v_category_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.category_questions
    WHERE category_questions.category_id = v_category_id AND is_auto_generated = true;

    category_id := v_category_id;
    questions_count := v_count;
    is_premium := v_products_count > 20;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Комментарии для документации
COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS
'Генерирует FAQ для категории. Параметры: category_id, skip_ai (true = только SQL, false = SQL + AI для популярных категорий)';

COMMENT ON FUNCTION public.generate_questions_for_all_categories() IS
'Массово генерирует БАЗОВЫЕ вопросы (SQL) для всех активных категорий. AI-генерация не используется.';


-- ==========================================
-- BRANDS
-- ==========================================


-- Функция для генерации FAQ для бренда
CREATE OR REPLACE FUNCTION public.generate_brand_questions(
  p_brand_id UUID,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_brand_name TEXT;
  v_brand_description TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_categories_count INTEGER;
  v_country_name TEXT;
  v_result JSON;
BEGIN
  -- Получаем данные бренда
  SELECT
    b.name,
    b.description,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.category_id),
    c.name
  INTO
    v_brand_name,
    v_brand_description,
    v_products_count,
    v_min_price,
    v_max_price,
    v_categories_count,
    v_country_name
  FROM public.brands b
  LEFT JOIN public.products p ON p.brand_id = b.id AND p.is_active = true
  LEFT JOIN public.countries c ON p.origin_country_id = c.id
  WHERE b.id = p_brand_id
  GROUP BY b.id, b.name, b.description, c.name;

  -- Если бренд не найден
  IF v_brand_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Brand not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы для этого бренда
  DELETE FROM public.brand_questions
  WHERE brand_id = p_brand_id AND is_auto_generated = true;

  -- ========================================
  -- БАЗОВЫЕ ВОПРОСЫ (SQL-генерация)
  -- ========================================

  -- Вопрос 1: О бренде
  INSERT INTO public.brand_questions (
    brand_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_brand_id,
    NULL,
    'Что за бренд ' || v_brand_name || '?',
    CASE
      WHEN v_brand_description IS NOT NULL THEN
        v_brand_description
      ELSE
        v_brand_name || ' - известный производитель качественных товаров для детей. В нашем магазине представлено ' ||
        v_products_count || ' товаров этого бренда.'
    END,
    true,
    NOW()
  );

  -- Вопрос 2: Категории товаров
  IF v_categories_count > 0 THEN
    INSERT INTO public.brand_questions (
      brand_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_brand_id,
      NULL,
      'Какие товары ' || v_brand_name || ' есть в магазине?',
      'У нас представлены товары бренда ' || v_brand_name || ' в ' || v_categories_count ||
      ' категориях. Всего доступно ' || v_products_count || ' товаров на любой вкус и бюджет.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос 3: Страна производства
  IF v_country_name IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_brand_id,
      NULL,
      'Где производят товары ' || v_brand_name || '?',
      'Товары бренда ' || v_brand_name || ' производятся в стране: ' || v_country_name ||
      '. Это гарантирует высокое качество и соответствие международным стандартам.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос 4: Диапазон цен
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_brand_id,
      NULL,
      'Сколько стоят товары ' || v_brand_name || '?',
      'Цены на товары бренда ' || v_brand_name || ' варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸. У нас есть варианты на любой бюджет!',
      true,
      NOW()
    );
  END IF;

  -- Вопрос 5: Доставка (всегда)
  INSERT INTO public.brand_questions (
    brand_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_brand_id,
    NULL,
    'Как быстро доставите товары ' || v_brand_name || '?',
    'Доставка товаров бренда ' || v_brand_name || ' по Алматы занимает 1-2 рабочих дня. ' ||
    'Доставка бесплатна при заказе от 10 000 ₸. Доставляем по всему Казахстану!',
    true,
    NOW()
  );

  -- ========================================
  -- ПРЕМИУМ БРЕНДЫ: Возвращаем данные для AI-генерации
  -- ========================================

  -- Если бренд популярный (много товаров) И не пропускаем AI
  IF v_products_count > 15 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'brand',
      'brand_id', p_brand_id,
      'name', v_brand_name,
      'description', v_brand_description,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price,
      'categories_count', v_categories_count,
      'country', v_country_name
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- Функция для массовой генерации вопросов для всех брендов
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_brands()
RETURNS TABLE(brand_id UUID, questions_count INTEGER, is_premium BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_brand_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_brand_id IN
    SELECT id FROM public.brands
  LOOP
    -- Получаем количество товаров
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.brand_id = v_brand_id AND is_active = true;

    -- Генерируем только базовые вопросы (skip_ai = true)
    PERFORM generate_brand_questions(v_brand_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.brand_questions
    WHERE brand_questions.brand_id = v_brand_id AND is_auto_generated = true;

    brand_id := v_brand_id;
    questions_count := v_count;
    is_premium := v_products_count > 15;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Комментарии для документации
COMMENT ON FUNCTION public.generate_brand_questions(UUID, BOOLEAN) IS
'Генерирует FAQ для бренда. Параметры: brand_id, skip_ai (true = только SQL, false = SQL + AI для популярных брендов)';

COMMENT ON FUNCTION public.generate_questions_for_all_brands() IS
'Массово генерирует БАЗОВЫЕ вопросы (SQL) для всех брендов. AI-генерация не используется.';

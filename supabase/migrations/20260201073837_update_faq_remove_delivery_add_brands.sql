-- ====================================
-- ОБНОВЛЕНИЕ FAQ: УБИРАЕМ ДОСТАВКУ, ДОБАВЛЯЕМ БРЕНДЫ И ЛИНЕЙКИ
-- ====================================

-- ========================================
-- 1. КАТЕГОРИИ - обновляем генерацию вопросов
-- ========================================
DROP FUNCTION IF EXISTS public.generate_category_questions(UUID, BOOLEAN);

CREATE FUNCTION public.generate_category_questions(
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
  v_product_lines_count INTEGER;
  v_top_brands TEXT;
  v_result JSON;
BEGIN
  -- Получаем данные категории с топ-брендами
  SELECT
    c.name,
    c.description,
    parent.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id),
    COUNT(DISTINCT p.product_line_id),
    string_agg(DISTINCT b.name, ', ' ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL)
  INTO
    v_category_name,
    v_category_description,
    v_parent_category_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count,
    v_product_lines_count,
    v_top_brands
  FROM public.categories c
  LEFT JOIN public.categories parent ON c.parent_id = parent.id
  LEFT JOIN public.products p ON p.category_id = c.id AND p.is_active = true
  LEFT JOIN public.brands b ON p.brand_id = b.id
  WHERE c.id = p_category_id
  GROUP BY c.id, c.name, c.description, parent.name
  LIMIT 1;

  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- Вопрос 1: Что входит в категорию
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_category_id, NULL,
    'Какие игрушки представлены в категории "' || v_category_name || '"?',
    CASE
      WHEN v_category_description IS NOT NULL THEN
        v_category_description || ' В категории представлено ' || v_products_count || ' игрушек от ' || v_brands_count || ' брендов.'
      ELSE
        'В категории "' || v_category_name || '" представлено ' || v_products_count || ' игрушек от ведущих производителей.'
    END,
    true, NOW()
  );

  -- Вопрос 2: Бренды и линейки
  IF v_brands_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_category_id, NULL,
      'Какие бренды игрушек есть в категории "' || v_category_name || '"?',
      'В категории "' || v_category_name || '" представлены игрушки от ' || v_brands_count || ' брендов' ||
      CASE WHEN v_top_brands IS NOT NULL THEN ', включая: ' || v_top_brands ELSE '' END || '. ' ||
      CASE WHEN v_product_lines_count > 0
        THEN 'Также доступно ' || v_product_lines_count || ' популярных линеек продуктов.'
        ELSE ''
      END,
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Диапазон цен
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_category_id, NULL,
      'Сколько стоят игрушки в категории "' || v_category_name || '"?',
      'Цены на игрушки в категории "' || v_category_name || '" варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸. У нас есть как бюджетные варианты, так и премиум игрушки.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Возрастные группы
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_category_id, NULL,
    'Для какого возраста подходят игрушки из категории "' || v_category_name || '"?',
    'В категории "' || v_category_name || '" представлены игрушки для разных возрастов. Вы можете использовать фильтр по возрасту, чтобы найти подходящие игрушки для вашего ребенка.',
    true, NOW()
  );

  -- AI для популярных категорий
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
      'brands_count', v_brands_count,
      'product_lines_count', v_product_lines_count,
      'top_brands', v_top_brands
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- ========================================
-- 2. БРЕНДЫ - обновляем генерацию вопросов
-- ========================================
DROP FUNCTION IF EXISTS public.generate_brand_questions(UUID, BOOLEAN);

CREATE FUNCTION public.generate_brand_questions(
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
  v_product_lines_count INTEGER;
  v_country_name TEXT;
  v_top_categories TEXT;
  v_top_product_lines TEXT;
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
    COUNT(DISTINCT p.product_line_id),
    c.name,
    string_agg(DISTINCT cat.name, ', ' ORDER BY cat.name) FILTER (WHERE cat.name IS NOT NULL),
    string_agg(DISTINCT pl.name, ', ' ORDER BY pl.name) FILTER (WHERE pl.name IS NOT NULL)
  INTO
    v_brand_name,
    v_brand_description,
    v_products_count,
    v_min_price,
    v_max_price,
    v_categories_count,
    v_product_lines_count,
    v_country_name,
    v_top_categories,
    v_top_product_lines
  FROM public.brands b
  LEFT JOIN public.products p ON p.brand_id = b.id AND p.is_active = true
  LEFT JOIN public.countries c ON p.origin_country_id = c.id
  LEFT JOIN public.categories cat ON p.category_id = cat.id
  LEFT JOIN public.product_lines pl ON p.product_line_id = pl.id
  WHERE b.id = p_brand_id
  GROUP BY b.id, b.name, b.description, c.name
  LIMIT 1;

  IF v_brand_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Brand not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.brand_questions
  WHERE brand_id = p_brand_id AND is_auto_generated = true;

  -- Вопрос 1: О бренде
  INSERT INTO public.brand_questions (
    brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_brand_id, NULL,
    'Какие игрушки выпускает бренд ' || v_brand_name || '?',
    CASE
      WHEN v_brand_description IS NOT NULL THEN
        v_brand_description || ' Бренд ' || v_brand_name || ' представлен ' || v_products_count || ' игрушками в нашем каталоге.'
      ELSE
        'Бренд ' || v_brand_name || ' - известный производитель качественных игрушек. В нашем каталоге представлено ' || v_products_count || ' игрушек этого бренда.'
    END,
    true, NOW()
  );

  -- Вопрос 2: Линейки продуктов
  IF v_product_lines_count > 0 THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_brand_id, NULL,
      'Какие линейки игрушек есть у бренда ' || v_brand_name || '?',
      'У бренда ' || v_brand_name || ' представлено ' || v_product_lines_count || ' популярных линеек игрушек' ||
      CASE WHEN v_top_product_lines IS NOT NULL THEN ', включая: ' || v_top_product_lines ELSE '' END || '.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Категории
  IF v_categories_count > 0 THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_brand_id, NULL,
      'В каких категориях представлены игрушки ' || v_brand_name || '?',
      'Игрушки бренда ' || v_brand_name || ' доступны в ' || v_categories_count || ' категориях' ||
      CASE WHEN v_top_categories IS NOT NULL THEN ': ' || v_top_categories ELSE '' END || '.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_brand_id, NULL,
      'Сколько стоят игрушки бренда ' || v_brand_name || '?',
      'Цены на игрушки ' || v_brand_name || ' варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- AI для популярных брендов
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
      'product_lines_count', v_product_lines_count,
      'country', v_country_name,
      'top_product_lines', v_top_product_lines
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- ========================================
-- 3. ЛИНЕЙКИ ПРОДУКТОВ - обновляем генерацию
-- ========================================
DROP FUNCTION IF EXISTS public.generate_product_line_questions(UUID, BOOLEAN);

CREATE FUNCTION public.generate_product_line_questions(
  p_product_line_id UUID,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line_name TEXT;
  v_line_description TEXT;
  v_brand_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_result JSON;
BEGIN
  -- Получаем данные линейки
  SELECT
    pl.name,
    pl.description,
    b.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    MIN(p.min_age_years),
    MAX(p.max_age_years)
  INTO
    v_line_name,
    v_line_description,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_min_age,
    v_max_age
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
  IF v_min_age IS NOT NULL OR v_max_age IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Для какого возраста подходят игрушки "' || v_line_name || '"?',
      'Игрушки линейки "' || v_line_name || '" рекомендованы для детей ' ||
      CASE
        WHEN v_min_age IS NOT NULL AND v_max_age IS NOT NULL THEN 'от ' || v_min_age || ' до ' || v_max_age || ' лет'
        WHEN v_min_age IS NOT NULL THEN 'от ' || v_min_age || ' лет'
        WHEN v_max_age IS NOT NULL THEN 'до ' || v_max_age || ' лет'
      END || '.',
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

-- ========================================
-- 4. МАТЕРИАЛЫ - обновляем генерацию
-- ========================================
DROP FUNCTION IF EXISTS public.generate_material_questions(INTEGER, BOOLEAN);

CREATE FUNCTION public.generate_material_questions(
  p_material_id INTEGER,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_brands_count INTEGER;
  v_top_brands TEXT;
  v_result JSON;
BEGIN
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

-- ========================================
-- 5. СТРАНЫ - обновляем генерацию
-- ========================================
DROP FUNCTION IF EXISTS public.generate_country_questions(INTEGER, BOOLEAN);

CREATE FUNCTION public.generate_country_questions(
  p_country_id INTEGER,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_country_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_brands_count INTEGER;
  v_top_brands TEXT;
  v_result JSON;
BEGIN
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

-- Комментарии
COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS 'Генерирует FAQ для категории с упоминанием брендов и линеек, без вопросов о доставке';
COMMENT ON FUNCTION public.generate_brand_questions(UUID, BOOLEAN) IS 'Генерирует FAQ для бренда с упоминанием линеек продуктов, без вопросов о доставке';
COMMENT ON FUNCTION public.generate_product_line_questions(UUID, BOOLEAN) IS 'Генерирует FAQ для линейки продуктов с упоминанием бренда, без вопросов о доставке';
COMMENT ON FUNCTION public.generate_material_questions(INTEGER, BOOLEAN) IS 'Генерирует FAQ для материала с упоминанием брендов, без вопросов о доставке';
COMMENT ON FUNCTION public.generate_country_questions(INTEGER, BOOLEAN) IS 'Генерирует FAQ для страны с упоминанием брендов, без вопросов о доставке';

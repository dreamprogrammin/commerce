-- ====================================
-- RPC ФУНКЦИИ ДЛЯ ГЕНЕРАЦИИ FAQ
-- ====================================

-- ========================================
-- 1. ЛИНЕЙКИ ПРОДУКТОВ (Product Lines)
-- ========================================

CREATE OR REPLACE FUNCTION public.generate_product_line_questions(
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
  v_result JSON;
BEGIN
  -- Получаем данные линейки
  SELECT
    pl.name,
    pl.description,
    b.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price)
  INTO
    v_line_name,
    v_line_description,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price
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
    'Что такое линейка "' || v_line_name || '"?',
    CASE
      WHEN v_line_description IS NOT NULL THEN
        v_line_description || ' Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' включает ' || v_products_count || ' товаров.'
      ELSE
        'Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' - популярная серия игрушек. В ассортименте ' || v_products_count || ' различных товаров.'
    END,
    true, NOW()
  );

  -- Вопрос 2: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Сколько стоят игрушки линейки "' || v_line_name || '"?',
      'Цены на товары линейки "' || v_line_name || '" варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Бренд
  IF v_brand_name IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Кто производит линейку "' || v_line_name || '"?',
      'Линейка "' || v_line_name || '" производится компанией ' || v_brand_name || ' - известным производителем качественных игрушек.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Доставка
  INSERT INTO public.product_line_questions (
    product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_line_id, NULL,
    'Как быстро доставите игрушки из линейки "' || v_line_name || '"?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Бесплатная доставка при заказе от 10 000 ₸.',
    true, NOW()
  );

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

-- Массовая генерация для всех линеек
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_product_lines()
RETURNS TABLE(product_line_id UUID, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_line_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_line_id IN SELECT id FROM public.product_lines LOOP
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.product_line_id = v_line_id AND is_active = true;

    PERFORM generate_product_line_questions(v_line_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.product_line_questions
    WHERE product_line_questions.product_line_id = v_line_id AND is_auto_generated = true;

    product_line_id := v_line_id;
    questions_count := v_count;
    is_premium := v_products_count > 15;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ========================================
-- 2. МАТЕРИАЛЫ (Materials)
-- ========================================

CREATE OR REPLACE FUNCTION public.generate_material_questions(
  p_material_id INTEGER,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_result JSON;
BEGIN
  -- Получаем данные материала
  SELECT
    m.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price)
  INTO
    v_material_name,
    v_products_count,
    v_min_price,
    v_max_price
  FROM public.materials m
  LEFT JOIN public.products p ON p.material_id = m.id AND p.is_active = true
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
    'В нашем ассортименте представлено ' || v_products_count || ' игрушек из материала "' || v_material_name || '" от ведущих производителей.',
    true, NOW()
  );

  -- Вопрос 2: Безопасность
  INSERT INTO public.material_questions (
    material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_material_id, NULL,
    'Безопасны ли игрушки из материала "' || v_material_name || '"?',
    'Да, все игрушки из материала "' || v_material_name || '" в нашем магазине сертифицированы и абсолютно безопасны для детей.',
    true, NOW()
  );

  -- Вопрос 3: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.material_questions (
      material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_material_id, NULL,
      'В каком ценовом диапазоне игрушки из материала "' || v_material_name || '"?',
      'Цены на игрушки из материала "' || v_material_name || '" от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Доставка
  INSERT INTO public.material_questions (
    material_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_material_id, NULL,
    'Как быстро доставите игрушки из материала "' || v_material_name || '"?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Бесплатная доставка при заказе от 10 000 ₸.',
    true, NOW()
  );

  -- AI для популярных материалов
  IF v_products_count > 20 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'material',
      'material_id', p_material_id,
      'name', v_material_name,
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

-- Массовая генерация для всех материалов
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_materials()
RETURNS TABLE(material_id INTEGER, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_id INTEGER;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_material_id IN SELECT id FROM public.materials LOOP
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.material_id = v_material_id AND is_active = true;

    PERFORM generate_material_questions(v_material_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.material_questions
    WHERE material_questions.material_id = v_material_id AND is_auto_generated = true;

    material_id := v_material_id;
    questions_count := v_count;
    is_premium := v_products_count > 20;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ========================================
-- 3. СТРАНЫ (Countries)
-- ========================================

CREATE OR REPLACE FUNCTION public.generate_country_questions(
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
  v_result JSON;
BEGIN
  -- Получаем данные страны
  SELECT
    c.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id)
  INTO
    v_country_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count
  FROM public.countries c
  LEFT JOIN public.products p ON p.origin_country_id = c.id AND p.is_active = true
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

  -- Вопрос 2: Качество
  INSERT INTO public.country_questions (
    country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_country_id, NULL,
    'Какое качество у игрушек из страны "' || v_country_name || '"?',
    'Все игрушки производства "' || v_country_name || '" соответствуют международным стандартам качества и безопасности.',
    true, NOW()
  );

  -- Вопрос 3: Цены
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

  -- Вопрос 4: Доставка
  INSERT INTO public.country_questions (
    country_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_country_id, NULL,
    'Как быстро доставите игрушки из страны "' || v_country_name || '"?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Бесплатная доставка при заказе от 10 000 ₸.',
    true, NOW()
  );

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
      'brands_count', v_brands_count
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

-- Массовая генерация для всех стран
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_countries()
RETURNS TABLE(country_id INTEGER, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_country_id INTEGER;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_country_id IN SELECT id FROM public.countries LOOP
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.origin_country_id = v_country_id AND is_active = true;

    PERFORM generate_country_questions(v_country_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.country_questions
    WHERE country_questions.country_id = v_country_id AND is_auto_generated = true;

    country_id := v_country_id;
    questions_count := v_count;
    is_premium := v_products_count > 20;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Комментарии
COMMENT ON FUNCTION public.generate_product_line_questions(UUID, BOOLEAN) IS 'Генерирует FAQ для линейки продуктов';
COMMENT ON FUNCTION public.generate_questions_for_all_product_lines() IS 'Массово генерирует базовые вопросы для всех линеек продуктов';
COMMENT ON FUNCTION public.generate_material_questions(INTEGER, BOOLEAN) IS 'Генерирует FAQ для материала';
COMMENT ON FUNCTION public.generate_questions_for_all_materials() IS 'Массово генерирует базовые вопросы для всех материалов';
COMMENT ON FUNCTION public.generate_country_questions(INTEGER, BOOLEAN) IS 'Генерирует FAQ для страны производства';
COMMENT ON FUNCTION public.generate_questions_for_all_countries() IS 'Массово генерирует базовые вопросы для всех стран';

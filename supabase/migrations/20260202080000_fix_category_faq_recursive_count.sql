-- ====================================
-- ИСПРАВЛЕНИЕ: Рекурсивный подсчет товаров и брендов в FAQ категорий
-- ====================================
-- Проблема: FAQ показывает "Всего 0 игрушек от 0 брендов" для родительских категорий,
-- потому что не учитываются товары из дочерних категорий

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
  v_subcategories TEXT;
  v_result JSON;
  v_category_ids UUID[]; -- Массив ID категорий (текущая + все дочерние)
BEGIN
  -- Получаем основную информацию о категории
  SELECT c.name, c.description, parent.name
  INTO v_category_name, v_category_description, v_parent_category_name
  FROM public.categories c
  LEFT JOIN public.categories parent ON c.parent_id = parent.id
  WHERE c.id = p_category_id;

  IF v_category_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Category not found');
  END IF;

  -- 🔥 НОВОЕ: Рекурсивно получаем все дочерние категории (включая текущую)
  WITH RECURSIVE category_tree AS (
    -- Начинаем с текущей категории
    SELECT id FROM public.categories WHERE id = p_category_id
    UNION ALL
    -- Рекурсивно добавляем всех потомков
    SELECT c.id FROM public.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT ARRAY_AGG(id) INTO v_category_ids FROM category_tree;

  -- 🔥 НОВОЕ: Считаем товары и бренды из текущей категории И всех дочерних
  SELECT
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.brand_id),
    COUNT(DISTINCT p.product_line_id),
    string_agg(DISTINCT b.name, ', ' ORDER BY b.name) FILTER (WHERE b.name IS NOT NULL)
  INTO
    v_products_count,
    v_min_price,
    v_max_price,
    v_brands_count,
    v_product_lines_count,
    v_top_brands
  FROM public.products p
  LEFT JOIN public.brands b ON p.brand_id = b.id
  WHERE p.category_id = ANY(v_category_ids) AND p.is_active = true;

  -- Получаем подкатегории 2 и 3 уровня для отображения в ответе
  SELECT string_agg(DISTINCT sub.name, ', ' ORDER BY sub.name)
  INTO v_subcategories
  FROM public.categories sub
  WHERE sub.parent_id = p_category_id
     OR sub.parent_id IN (SELECT id FROM public.categories WHERE parent_id = p_category_id)
  LIMIT 10;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.category_questions
  WHERE category_id = p_category_id AND is_auto_generated = true;

  -- Вопрос 1: Что входит в категорию (с подкатегориями)
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_category_id, NULL,
    'Какие игрушки представлены в категории "' || v_category_name || '"?',
    CASE
      -- Если есть описание и подкатегории
      WHEN v_category_description IS NOT NULL AND v_subcategories IS NOT NULL THEN
        v_category_description || '. В категории вы найдете: ' || v_subcategories || '. Всего представлено ' || v_products_count || ' игрушек от ' || v_brands_count || ' брендов.'
      -- Если есть только подкатегории
      WHEN v_subcategories IS NOT NULL THEN
        'В категории "' || v_category_name || '" представлены: ' || v_subcategories || '. Всего ' || v_products_count || ' игрушек от ' || v_brands_count || ' брендов.'
      -- Если есть только описание
      WHEN v_category_description IS NOT NULL THEN
        v_category_description || ' В категории представлено ' || v_products_count || ' игрушек от ' || v_brands_count || ' брендов.'
      -- Если нет ни того, ни другого
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
      'top_brands', v_top_brands,
      'subcategories', v_subcategories
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS
'Генерирует FAQ для категории с рекурсивным подсчетом товаров из дочерних категорий';

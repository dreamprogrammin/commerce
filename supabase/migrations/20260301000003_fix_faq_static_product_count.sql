-- =====================================================================================
-- FIX: FAQ — убираем динамический счётчик товаров из автогенерированных ответов
-- Проблема: generate_category_questions() бакала в answer_text живой v_products_count.
--           Если функция вызывалась до загрузки товаров, в БД писалось "0 игрушек".
--           Текст жёстко закодирован в строке — обновить без регенерации FAQ невозможно.
-- Решение:
--   1. Пересоздаём generate_category_questions() со статичным SEO-текстом для вопроса 1.
--   2. UPDATE всех существующих автогенерированных ответов с "представлено N игрушек".
-- =====================================================================================


-- =====================================================================================
-- ШАГ 1: Пересоздаём функцию generate_category_questions()
-- =====================================================================================

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

  -- Вопрос 1: Что входит в категорию — СТАТИЧНЫЙ текст без счётчика товаров
  INSERT INTO public.category_questions (
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_category_id, NULL,
    'Какие игрушки представлены в категории "' || v_category_name || '"?',
    CASE
      WHEN v_category_description IS NOT NULL THEN
        v_category_description || ' В данной категории представлен широкий ассортимент товаров. Воспользуйтесь удобными фильтрами по цене и характеристикам, чтобы подобрать идеальный вариант.'
      ELSE
        'В категории "' || v_category_name || '" представлен широкий ассортимент товаров. Воспользуйтесь удобными фильтрами по цене и характеристикам, чтобы подобрать идеальный вариант.'
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


-- =====================================================================================
-- ШАГ 2: Исправляем существующие строки в БД
-- Находим все автогенерированные ответы, содержащие динамические счётчики ("N игрушек от")
-- и заменяем их статичным текстом.
-- Затрагиваются только строки с паттерном " игрушек от " или "представлено N игрушек"
-- =====================================================================================

UPDATE public.category_questions cq
SET answer_text = CASE
  WHEN c.description IS NOT NULL THEN
    c.description || ' В данной категории представлен широкий ассортимент товаров. Воспользуйтесь удобными фильтрами по цене и характеристикам, чтобы подобрать идеальный вариант.'
  ELSE
    'В категории "' || c.name || '" представлен широкий ассортимент товаров. Воспользуйтесь удобными фильтрами по цене и характеристикам, чтобы подобрать идеальный вариант.'
  END
FROM public.categories c
WHERE cq.category_id = c.id
  AND cq.is_auto_generated = true
  AND (
    -- Паттерны старого текста с динамическим счётчиком
    cq.answer_text ~ '\d+ игрушек от'
    OR cq.answer_text ~ 'представлено \d+ игрушек'
    OR cq.answer_text ~ 'представлено 0 игрушек'
  );

-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Ambiguous column "category_id" в generate_brand_questions
-- =====================================================================================
-- ПРОБЛЕМА:
-- При подтверждении заказа возникает ошибка:
-- "column reference "category_id" is ambiguous"
--
-- ПРИЧИНА:
-- В функции generate_brand_questions используется COUNT(DISTINCT p.category_id),
-- но также есть JOIN с таблицей categories (алиас cat), которая тоже имеет поле category_id
-- PostgreSQL не знает какую колонку использовать
--
-- РЕШЕНИЕ:
-- Явно указать таблицу для category_id: p.category_id
-- =====================================================================================

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
  -- Получаем данные бренда с топ-категориями и линейками
  SELECT
    b.name,
    b.description,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    COUNT(DISTINCT p.category_id),  -- ✅ ИСПРАВЛЕНИЕ: явно указываем p.category_id
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
  GROUP BY b.id, b.name, b.description, c.id, c.name  -- ✅ ИСПРАВЛЕНИЕ: добавлен c.id в GROUP BY
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

  -- Вопрос 2: Категории и линейки
  IF v_categories_count > 0 THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_brand_id, NULL,
      'В каких категориях представлены игрушки ' || v_brand_name || '?',
      'Игрушки бренда ' || v_brand_name || ' представлены в ' || v_categories_count || ' категориях нашего каталога' ||
      CASE WHEN v_top_categories IS NOT NULL THEN ', включая: ' || v_top_categories ELSE '' END || '. ' ||
      CASE WHEN v_product_lines_count > 0
        THEN 'Также доступно ' || v_product_lines_count || ' популярных линеек продуктов.'
        ELSE ''
      END,
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Диапазон цен
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_brand_id, NULL,
      'Сколько стоят игрушки ' || v_brand_name || '?',
      'Цены на игрушки бренда ' || v_brand_name || ' варьируются от ' ||
      ROUND(v_min_price::numeric, 0) || ' до ' || ROUND(v_max_price::numeric, 0) || ' тенге. ' ||
      'Это позволяет выбрать игрушку на любой бюджет.',
      true, NOW()
    );
  END IF;

  -- Возвращаем результат
  RETURN json_build_object('needs_ai', false);
END;
$$;

COMMENT ON FUNCTION public.generate_brand_questions(UUID, BOOLEAN) IS
'Генерирует автоматические вопросы-ответы для страницы бренда.
ИСПРАВЛЕНИЕ (2026-02-05): Явно указан p.category_id для устранения ambiguous column error';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

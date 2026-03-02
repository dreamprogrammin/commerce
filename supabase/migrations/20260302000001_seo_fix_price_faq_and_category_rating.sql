-- ================================================================================
-- МИГРАЦИЯ: SEO-исправления (2026-03-02)
-- 1. Исправление FAQ: если min_price = max_price, вместо диапазона — одна цена
-- 2. Бэкфилл: перегенерация вопросов с дублирующимися ценами
-- 3. Новый RPC get_category_aggregate_rating для Schema.org aggregateRating
-- ================================================================================

-- ================================================================================
-- ЧАСТЬ 1: Обновление generate_category_questions
-- ================================================================================

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
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
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

  -- Вопрос 2: Цены (ИСПРАВЛЕНО: если min = max — одна цена, иначе диапазон)
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_category_id,
      NULL,
      'В каком ценовом диапазоне товары в категории "' || v_category_name || '"?',
      CASE
        WHEN v_min_price = v_max_price THEN
          'На данный момент товары в категории "' || v_category_name || '" доступны по цене ' ||
          replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') ||
          ' ₸. Выбирайте качественные игрушки с доставкой.'
        ELSE
          'Цены на товары в категории "' || v_category_name || '" варьируются от ' ||
          replace(to_char(v_min_price::bigint, 'FM999,999,999'), ',', ' ') ||
          ' ₸ до ' ||
          replace(to_char(v_max_price::bigint, 'FM999,999,999'), ',', ' ') ||
          ' ₸. Вы можете найти как бюджетные варианты, так и премиум товары.'
      END,
      true,
      NOW()
    );
  END IF;

  -- Вопрос 3: Бренды
  IF v_brands_count > 0 THEN
    INSERT INTO public.category_questions (
      category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
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
    category_id, user_id, question_text, answer_text, is_auto_generated, answered_at
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

COMMENT ON FUNCTION public.generate_category_questions(UUID, BOOLEAN) IS
'Генерирует FAQ для категории. Параметры: category_id, skip_ai (true = только SQL, false = SQL + AI для популярных категорий). Исправлено: если min_price = max_price — выводится одна цена вместо диапазона.';

-- ================================================================================
-- ЧАСТЬ 2: Бэкфилл — перегенерация вопросов с дублирующимися ценами
-- Находит категории, где все активные товары стоят одинаково,
-- и у которых есть автогенерированный вопрос с текстом "варьируются от"
-- ================================================================================

DO $$
DECLARE
  v_cat_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_cat_id IN
    SELECT cq.category_id
    FROM public.category_questions cq
    INNER JOIN (
      SELECT p.category_id
      FROM public.products p
      WHERE p.is_active = true
      GROUP BY p.category_id
      HAVING MIN(p.price) = MAX(p.price) AND COUNT(*) > 0
    ) same_price ON same_price.category_id = cq.category_id
    WHERE cq.is_auto_generated = true
      AND cq.question_text LIKE '%ценовом диапазоне%'
      AND cq.answer_text LIKE '%варьируются от%'
    GROUP BY cq.category_id
  LOOP
    PERFORM public.generate_category_questions(v_cat_id, true);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Бэкфилл завершён: перегенерировано % категорий', v_count;
END;
$$;

-- ================================================================================
-- ЧАСТЬ 3: RPC get_category_aggregate_rating
-- Возвращает агрегированный рейтинг (средний + сумма отзывов) для категории
-- на основе avg_rating и review_count в таблице products
-- ================================================================================

CREATE OR REPLACE FUNCTION public.get_category_aggregate_rating(p_category_id UUID)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT json_build_object(
    'avg_rating',
    ROUND(
      COALESCE(
        SUM(p.avg_rating * p.review_count)::numeric / NULLIF(SUM(p.review_count), 0),
        0
      ),
      1
    ),
    'total_reviews', COALESCE(SUM(p.review_count), 0)
  )
  FROM public.products p
  WHERE p.category_id = p_category_id
    AND p.is_active = true
    AND p.review_count > 0;
$$;

COMMENT ON FUNCTION public.get_category_aggregate_rating(UUID) IS
'Возвращает агрегированный рейтинг категории: взвешенное среднее avg_rating и сумма review_count всех активных товаров категории. Используется для Schema.org aggregateRating.';

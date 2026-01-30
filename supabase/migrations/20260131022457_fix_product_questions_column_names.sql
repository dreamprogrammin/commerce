-- Исправление ошибки в функции generate_product_questions
-- Проблема: использовались несуществующие колонки m.name_ru и c.name_ru
-- Решение: заменить на m.name и c.name

-- Пересоздаем функцию с правильными именами колонок
CREATE OR REPLACE FUNCTION public.generate_product_questions(
  p_product_id UUID,
  p_skip_ai BOOLEAN DEFAULT false
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_brand_name TEXT;
  v_material_name TEXT;
  v_country_name TEXT;
  v_price NUMERIC;
  v_name TEXT;
  v_description TEXT;
  v_category_name TEXT;
  v_result JSON;
BEGIN
  -- Получаем данные товара (ИСПРАВЛЕНО: m.name вместо m.name_ru, c.name вместо c.name_ru)
  SELECT
    p.min_age_years,
    p.max_age_years,
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

  -- Удаляем старые автогенерированные вопросы для этого товара
  DELETE FROM public.product_questions
  WHERE product_id = p_product_id AND is_auto_generated = true;

  -- ========================================
  -- БАЗОВЫЕ ВОПРОСЫ (SQL-генерация для всех товаров)
  -- ========================================

  -- Вопрос про возраст (если есть данные)
  IF v_min_age IS NOT NULL OR v_max_age IS NOT NULL THEN
    INSERT INTO public.product_questions (
      product_id,
      user_id,
      question_text,
      answer_text,
      is_auto_generated,
      answered_at
    ) VALUES (
      p_product_id,
      NULL,
      'С какого возраста можно играть с этой игрушкой?',
      CASE
        WHEN v_min_age IS NOT NULL AND v_max_age IS NOT NULL THEN
          'Производитель рекомендует для детей от ' || v_min_age || ' до ' || v_max_age || ' лет.'
        WHEN v_min_age IS NOT NULL THEN
          'Производитель рекомендует от ' || v_min_age || ' лет.'
        ELSE
          'Подходит для детей до ' || v_max_age || ' лет.'
      END,
      true,
      NOW()
    );
  END IF;

  -- Вопрос про доставку (всегда)
  INSERT INTO public.product_questions (
    product_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Как быстро доставите в Алматы?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Доставка бесплатна при заказе от 10 000 ₸.',
    true,
    NOW()
  );

  -- Вопрос про возврат (всегда)
  INSERT INTO public.product_questions (
    product_id,
    user_id,
    question_text,
    answer_text,
    is_auto_generated,
    answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Можно ли вернуть товар?',
    'Да, вы можете вернуть товар в течение 14 дней с момента получения, если он не был в использовании и сохранена упаковка.',
    true,
    NOW()
  );

  -- ========================================
  -- ПРЕМИУМ ТОВАРЫ: Возвращаем данные для AI-генерации
  -- ========================================

  -- Если товар дорогой (> 50000) И не пропускаем AI
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

COMMENT ON FUNCTION public.generate_product_questions(UUID, BOOLEAN) IS
'Генерирует умные вопросы для товара. Параметры: product_id, skip_ai (true = только SQL, false = SQL + AI для премиум). ИСПРАВЛЕНО: использует правильные имена колонок m.name и c.name';

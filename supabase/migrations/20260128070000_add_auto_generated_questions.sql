-- Добавляем поле для маркировки автогенерированных вопросов
ALTER TABLE public.product_questions
ADD COLUMN is_auto_generated BOOLEAN DEFAULT false;

-- Функция для генерации БАЗОВЫХ вопросов (SQL-генерация)
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
  -- Получаем данные товара
  SELECT
    p.min_age_years,
    p.max_age_years,
    b.name,
    m.name_ru,
    c.name_ru,
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

-- Функция для массовой генерации вопросов (ТОЛЬКО базовые SQL-вопросы)
-- AI-генерация не используется, чтобы не расходовать токены
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_products()
RETURNS TABLE(product_id UUID, questions_count INTEGER, is_premium BOOLEAN) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_price NUMERIC;
BEGIN
  FOR v_product_id, v_price IN
    SELECT id, price FROM public.products WHERE is_active = true
  LOOP
    -- Генерируем только базовые вопросы (skip_ai = true)
    PERFORM generate_product_questions(v_product_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.product_questions
    WHERE product_questions.product_id = v_product_id AND is_auto_generated = true;

    product_id := v_product_id;
    questions_count := v_count;
    is_premium := v_price > 50000;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Комментарии для документации
COMMENT ON FUNCTION public.generate_product_questions(UUID) IS
'Генерирует умные вопросы для товара на основе его характеристик (возраст, бренд, материал, страна)';

COMMENT ON FUNCTION public.generate_questions_for_all_products() IS
'Массово генерирует вопросы для всех активных товаров. Используйте с осторожностью!';

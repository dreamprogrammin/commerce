-- Добавляем поле для маркировки автогенерированных вопросов
ALTER TABLE public.product_questions
ADD COLUMN is_auto_generated BOOLEAN DEFAULT false;

-- Функция для генерации умных вопросов
CREATE OR REPLACE FUNCTION public.generate_product_questions(p_product_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_brand_name TEXT;
  v_material_name TEXT;
  v_country_name TEXT;
  v_price NUMERIC;
BEGIN
  -- Получаем данные товара
  SELECT
    p.min_age_years,
    p.max_age_years,
    b.name,
    m.name_ru,
    c.name_ru,
    p.price
  INTO
    v_min_age,
    v_max_age,
    v_brand_name,
    v_material_name,
    v_country_name,
    v_price
  FROM public.products p
  LEFT JOIN public.brands b ON p.brand_id = b.id
  LEFT JOIN public.materials m ON p.material_id = m.id
  LEFT JOIN public.countries c ON p.origin_country_id = c.id
  WHERE p.id = p_product_id;

  -- Удаляем старые автогенерированные вопросы для этого товара
  DELETE FROM public.product_questions
  WHERE product_id = p_product_id AND is_auto_generated = true;

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

  -- Вопрос про бренд/оригинальность (если есть бренд)
  IF v_brand_name IS NOT NULL THEN
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
      'Это оригинальный товар?',
      'Да, это 100% оригинальная продукция бренда ' || v_brand_name || '. Мы работаем только с официальными поставщиками.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос про материал (если есть)
  IF v_material_name IS NOT NULL THEN
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
      'Из какого материала изготовлена игрушка?',
      'Игрушка изготовлена из ' || LOWER(v_material_name) || '. Материал безопасен для детей и соответствует стандартам качества.',
      true,
      NOW()
    );
  END IF;

  -- Вопрос про страну производства (если есть)
  IF v_country_name IS NOT NULL THEN
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
      'Где произведена игрушка?',
      'Страна производства: ' || v_country_name || '.',
      true,
      NOW()
    );
  END IF;

  -- Универсальный вопрос про доставку
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

  -- Вопрос про гарантию/возврат
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

  -- Вопрос про наличие (если товар дорогой)
  IF v_price > 20000 THEN
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
      'Товар точно есть в наличии?',
      'Да, товар в наличии на нашем складе в Алматы. Информация о наличии обновляется в режиме реального времени.',
      true,
      NOW()
    );
  END IF;

END;
$$;

-- Функция для массовой генерации вопросов для всех товаров
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_products()
RETURNS TABLE(product_id UUID, questions_count INTEGER) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_id UUID;
  v_count INTEGER;
BEGIN
  FOR v_product_id IN SELECT id FROM public.products WHERE is_active = true LOOP
    PERFORM generate_product_questions(v_product_id);

    SELECT COUNT(*) INTO v_count
    FROM public.product_questions
    WHERE product_questions.product_id = v_product_id AND is_auto_generated = true;

    product_id := v_product_id;
    questions_count := v_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Комментарии для документации
COMMENT ON FUNCTION public.generate_product_questions(UUID) IS
'Генерирует умные вопросы для товара на основе его характеристик (возраст, бренд, материал, страна)';

COMMENT ON FUNCTION public.generate_questions_for_all_products() IS
'Массово генерирует вопросы для всех активных товаров. Используйте с осторожностью!';

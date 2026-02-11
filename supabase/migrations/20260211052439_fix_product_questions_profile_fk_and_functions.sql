-- =============================================================
-- Исправление: пересоздание FK между product_questions и profiles
-- + обновление всех функций product_questions
-- =============================================================

-- 1. Пересоздаём FK constraint (drop если есть, потом create)
ALTER TABLE public.product_questions
  DROP CONSTRAINT IF EXISTS product_questions_profile_fk;

ALTER TABLE public.product_questions
  ADD CONSTRAINT product_questions_profile_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Пересоздаём функцию генерации вопросов
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

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.product_questions
  WHERE product_id = p_product_id AND is_auto_generated = true;

  -- Вопрос про возраст
  IF v_min_age IS NOT NULL OR v_max_age IS NOT NULL THEN
    INSERT INTO public.product_questions (
      product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
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

  -- Вопрос про доставку
  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Как быстро доставите в Алматы?',
    'Доставка по Алматы занимает 1-2 рабочих дня. Доставка бесплатна при заказе от 10 000 ₸.',
    true,
    NOW()
  );

  -- Вопрос про возврат
  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Можно ли вернуть товар?',
    'Да, вы можете вернуть товар в течение 14 дней с момента получения, если он не был в использовании и сохранена упаковка.',
    true,
    NOW()
  );

  -- Премиум товары: данные для AI-генерации
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

-- 3. Пересоздаём функцию массовой генерации
CREATE OR REPLACE FUNCTION public.generate_questions_for_all_products()
RETURNS TABLE(product_id UUID, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_id UUID;
  v_count INTEGER;
  v_price NUMERIC;
BEGIN
  FOR v_product_id, v_price IN
    SELECT id, price FROM public.products WHERE is_active = true
  LOOP
    PERFORM generate_product_questions(v_product_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.product_questions pq
    WHERE pq.product_id = v_product_id AND pq.is_auto_generated = true;

    product_id := v_product_id;
    questions_count := v_count;
    is_premium := v_price > 50000;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 4. Пересоздаём триггер уведомлений
CREATE OR REPLACE FUNCTION public.notify_question_answered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_name TEXT;
  v_product_slug TEXT;
BEGIN
  IF OLD.answer_text IS NOT NULL OR NEW.answer_text IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, slug INTO v_product_name, v_product_slug
  FROM public.products WHERE id = NEW.product_id;

  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-question-answered',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'question_id', NEW.id,
      'question_text', NEW.question_text,
      'answer_text', NEW.answer_text,
      'product_name', v_product_name,
      'product_slug', v_product_slug,
      'trigger_secret', 'uhti-internal-trigger-2026'
    )
  );

  RETURN NEW;
END;
$$;

-- Триггер пересоздаём только если не существует
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_question_answered'
  ) THEN
    CREATE TRIGGER on_question_answered
    AFTER UPDATE ON public.product_questions
    FOR EACH ROW EXECUTE FUNCTION public.notify_question_answered();
  END IF;
END;
$$;

-- 5. Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';

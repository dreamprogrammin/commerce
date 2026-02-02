-- Пересоздание RPC функций для принудительного обновления кэша PostgREST
-- Эта миграция DROP и пересоздает функции, которые PostgREST не видит

-- ========================================
-- CATEGORIES: generate_questions_for_all_categories
-- ========================================

DROP FUNCTION IF EXISTS public.generate_questions_for_all_categories();

CREATE FUNCTION public.generate_questions_for_all_categories()
RETURNS TABLE(category_id UUID, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_category_id IN
    SELECT id FROM public.categories
  LOOP
    -- Получаем количество активных товаров
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.category_id = v_category_id AND products.is_active = true;

    -- Генерируем только базовые вопросы (skip_ai = true)
    PERFORM generate_category_questions(v_category_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.category_questions
    WHERE category_questions.category_id = v_category_id AND is_auto_generated = true;

    category_id := v_category_id;
    questions_count := v_count;
    is_premium := v_products_count > 20;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_questions_for_all_categories() IS
'Массово генерирует БАЗОВЫЕ вопросы (SQL) для всех категорий. AI-генерация не используется.';

-- ========================================
-- BRANDS: generate_questions_for_all_brands
-- ========================================

DROP FUNCTION IF EXISTS public.generate_questions_for_all_brands();

CREATE FUNCTION public.generate_questions_for_all_brands()
RETURNS TABLE(brand_id UUID, questions_count INTEGER, is_premium BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_brand_id UUID;
  v_count INTEGER;
  v_is_premium BOOLEAN;
  v_products_count INTEGER;
BEGIN
  FOR v_brand_id IN
    SELECT id FROM public.brands
  LOOP
    -- Получаем количество товаров
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE products.brand_id = v_brand_id AND is_active = true;

    -- Генерируем только базовые вопросы (skip_ai = true)
    PERFORM generate_brand_questions(v_brand_id, true);

    SELECT COUNT(*) INTO v_count
    FROM public.brand_questions
    WHERE brand_questions.brand_id = v_brand_id AND is_auto_generated = true;

    brand_id := v_brand_id;
    questions_count := v_count;
    is_premium := v_products_count > 15;
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_questions_for_all_brands() IS
'Массово генерирует БАЗОВЫЕ вопросы (SQL) для всех брендов. AI-генерация не используется.';

-- Принудительно обновляем кэш схемы PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Up Migration: Исправление конфликтов "ambiguous id" в RPC-функциях

-- 1. Удаляем все версии get_brands_by_category_slug принудительно
DROP FUNCTION IF EXISTS public.get_brands_by_category_slug CASCADE;

-- 2. Создаем исправленную версию get_brands_by_category_slug (Исправлен 'ambiguous id')
CREATE OR REPLACE FUNCTION public.get_brands_by_category_slug(
    p_category_slug TEXT
)
RETURNS TABLE (
    id UUID, -- Brand ID
    name TEXT,
    slug TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    target_category_ids UUID[];
BEGIN
    -- Получаем ID целевой категории и ее потомков
    SELECT array_agg(cat.id) -- <-- ИСПРАВЛЕНИЕ: Используем алиас "cat"
    INTO target_category_ids
    FROM public.get_category_and_children_ids(p_category_slug) cat; -- <-- ИСПРАВЛЕНИЕ: Алиас для функции

    -- Возвращаем бренды, которые присутствуют в этих категориях
    RETURN QUERY
    SELECT DISTINCT
        b.id AS id,     -- <-- ИСПРАВЛЕНИЕ: Явный алиас
        b.name AS name, -- <-- ИСПРАВЛЕНИЕ: Явный алиас
        b.slug AS slug  -- <-- ИСПРАВЛЕНИЕ: Явный алиас
    FROM
        public.brands b
    JOIN
        public.products p ON p.brand_id = b.id
    WHERE
        p.category_id = ANY(target_category_ids)
        AND p.is_active = TRUE;
END;
$$;

-- 3. Удаляем get_category_price_range (для чистоты)
DROP FUNCTION IF EXISTS public.get_category_price_range CASCADE;

-- 4. Создаем исправленную версию get_category_price_range (Устраняет потенциальный конфликт TEXT/UUID)
CREATE OR REPLACE FUNCTION public.get_category_price_range(
    p_category_slug TEXT
)
RETURNS TABLE (
    min_price NUMERIC,
    max_price NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    category_ids UUID[]; -- Правильный тип для ID категорий
BEGIN
    -- Получаем ID указанной категории и всех ее потомков
    SELECT array_agg(cat.id) -- <-- Используем алиас "cat"
    INTO category_ids
    FROM public.get_category_and_children_ids(p_category_slug) cat;

    -- Возвращаем минимальную и максимальную цену из всех активных товаров
    RETURN QUERY
    SELECT
        COALESCE(MIN(p.price), 0),
        COALESCE(MAX(p.price), 50000) 
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        AND p.category_id = ANY(category_ids); 
END;
$$;

-- 5. Установка прав доступа
GRANT EXECUTE ON FUNCTION public.get_brands_by_category_slug(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_category_price_range(TEXT) TO anon, authenticated;
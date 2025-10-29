-- supabase/migrations/20231022XXXXXX_fix_ambiguous_brand_rpc.sql

-- 1. Удаляем старые версии функции принудительно
DROP FUNCTION IF EXISTS public.get_brands_by_category_slug CASCADE;

-- 2. Создаем исправленную версию с явными алиасами
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
    -- 1. Получаем ID целевой категории и ее потомков
    SELECT array_agg(id) 
    INTO target_category_ids
    FROM public.get_category_and_children_ids(p_category_slug);

    -- 2. Возвращаем бренды, которые присутствуют в этих категориях
    RETURN QUERY
    SELECT DISTINCT
        b.id,
        b.name,
        b.slug
    FROM
        public.brands b
    JOIN
        public.products p ON p.brand_id = b.id
    WHERE
        p.category_id = ANY(target_category_ids)
        AND p.is_active = TRUE;
END;
$$;
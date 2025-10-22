-- supabase/migrations/20231022XXXXXX_fix_price_range_rpc.sql

-- 1. Удаляем все версии функции динамически
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure as func_signature
        FROM pg_proc
        WHERE proname = 'get_category_price_range'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION %s CASCADE', r.func_signature);
    END LOOP;
END $$;

-- 2. Создаем единственную, чистую, финальную версию
CREATE FUNCTION public.get_category_price_range(
    p_category_slug TEXT
)
RETURNS TABLE (
    min_price NUMERIC,
    max_price NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    category_ids UUID[];
BEGIN
    -- Получаем ID указанной категории и всех ее потомков
    SELECT array_agg(id)
    INTO category_ids
    FROM public.get_category_and_children_ids(p_category_slug);
    
    -- Возвращаем минимальную и максимальную цену из всех активных товаров
    RETURN QUERY
    SELECT
        COALESCE(MIN(p.price), 0) AS min_price,
        COALESCE(MAX(p.price), 50000) AS max_price
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        AND p.category_id = ANY(category_ids);
END;
$$;
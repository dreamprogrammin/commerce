-- 20231022080000_create_price_range_rpc.sql (или ваше имя файла)

-- Создание функции get_category_price_range
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
    category_ids TEXT[];
BEGIN
    -- Предполагаем, что функция get_category_and_children_ids уже существует.
    -- Получаем ID указанной категории и всех ее потомков
    SELECT array_agg(id)
    INTO category_ids
    FROM public.get_category_and_children_ids(p_category_slug);

    -- Возвращаем минимальную и максимальную цену из всех активных товаров
    RETURN QUERY
    SELECT
        COALESCE(MIN(p.price), 0),
        COALESCE(MAX(p.price), 50000) -- Fallback, чтобы избежать NULL при отсутствии товаров
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        AND p.category_id = ANY(category_ids);

END;
$$;

-- Установка прав доступа: позволяет всем пользователям (anon, authenticated) вызывать эту функцию.
GRANT EXECUTE ON FUNCTION public.get_category_price_range(TEXT) TO anon, authenticated;
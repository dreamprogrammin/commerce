-- Пересоздаем функцию с новыми параметрами для пагинации
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    -- === НОВЫЕ ПАРАМЕТРЫ ===
    p_page_size INT DEFAULT 12, -- Размер страницы по умолчанию
    p_page_number INT DEFAULT 1  -- Номер страницы по умолчанию
)
RETURNS TABLE (
    -- Возвращаемая структура не меняется
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC(10, 2),
    image_url TEXT, category_id UUID, bonus_points_award INTEGER,
    stock_quantity INTEGER, sales_count INTEGER, is_active BOOLEAN,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    query TEXT;
    order_by_clause TEXT;
    offset_val INT; -- Переменная для смещения (OFFSET)
BEGIN
    -- === ЛОГИКА ПАГИНАЦИИ ===
    -- Считаем смещение. Для страницы 1 - (1-1)*12=0. Для страницы 2 - (2-1)*12=12.
    offset_val := (p_page_number - 1) * p_page_size;
    
    -- --- Основная логика (фильтры, сортировка) остается почти без изменений ---
    WITH RECURSIVE category_tree AS (
        SELECT c.id FROM public.categories c WHERE c.slug = p_category_slug
        UNION ALL
        SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
    )
    -- Собираем запрос
    SELECT string_agg(
        format('SELECT * FROM public.products p WHERE %s ORDER BY %s LIMIT %s OFFSET %s',
            -- Условия WHERE
            string_agg(
                CASE
                    WHEN filter_key = 'category' THEN 'p.category_id = ANY(' || quote_literal(ARRAY(SELECT id FROM category_tree)) || ')'
                    WHEN filter_key = 'subcategory' AND p_subcategory_ids IS NOT NULL THEN 'p.category_id = ANY(' || quote_literal(p_subcategory_ids) || ')'
                    WHEN filter_key = 'price_min' AND p_price_min IS NOT NULL THEN 'p.price >= ' || p_price_min
                    WHEN filter_key = 'price_max' AND p_price_max IS NOT NULL THEN 'p.price <= ' || p_price_max
                    ELSE 'p.is_active = TRUE'
                END,
                ' AND '
            ),
            -- Условие ORDER BY
            CASE p_sort_by
                WHEN 'popularity' THEN 'p.sales_count DESC, p.created_at DESC'
                WHEN 'price_asc'  THEN 'p.price ASC, p.created_at DESC'
                WHEN 'price_desc' THEN 'p.price DESC, p.created_at DESC'
                ELSE 'p.created_at DESC'
            END,
            -- LIMIT и OFFSET
            p_page_size,
            offset_val
        ),
        ''
    ) INTO query
    FROM (VALUES ('base'), ('category'), ('subcategory'), ('price_min'), ('price_max')) AS f(filter_key);

    -- Выполняем собранный запрос
    RETURN QUERY EXECUTE query;
END;
$$;
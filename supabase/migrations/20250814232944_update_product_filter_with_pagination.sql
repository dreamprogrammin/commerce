-- Пересоздаем функцию `get_filtered_products`, добавляя два новых параметра для пагинации.
-- `p_page_size` - сколько товаров возвращать за один раз (LIMIT).
-- `p_page_number` - какую по счету "страницу" возвращать (для расчета OFFSET).
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_size INT DEFAULT 12, -- << НОВЫЙ ПАРАМЕТР
    p_page_number INT DEFAULT 1  -- << НОВЫЙ ПАРАМЕТР
)
RETURNS TABLE ( -- Структура возвращаемой таблицы остается без изменений
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC(10, 2),
    image_url TEXT, category_id UUID, bonus_points_award INTEGER,
    stock_quantity INTEGER, sales_count INTEGER, is_active BOOLEAN,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    query TEXT;
    category_ids_subtree UUID[];
    order_by_clause TEXT;
    offset_value INT; -- << НОВАЯ ПЕРЕМЕННАЯ для расчета смещения
BEGIN
    -- === Блок получения категорий и построения фильтров (БЕЗ ИЗМЕНЕНИЙ) ===
    WITH RECURSIVE category_tree AS (
        SELECT c.id FROM public.categories c WHERE c.slug = p_category_slug
        UNION ALL
        SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT array_agg(id) INTO category_ids_subtree FROM category_tree;
    
    query := 'SELECT * FROM public.products p WHERE p.is_active = TRUE AND p.category_id = ANY($1)';
    IF p_subcategory_ids IS NOT NULL AND array_length(p_subcategory_ids, 1) > 0 THEN
        query := query || ' AND p.category_id = ANY($2)';
    END IF;
    IF p_price_min IS NOT NULL THEN
        query := query || ' AND p.price >= $3';
    END IF;
    IF p_price_max IS NOT NULL THEN
        query := query || ' AND p.price <= $4';
    END IF;

    -- === Блок сортировки (БЕЗ ИЗМЕНЕНИЙ) ===
    order_by_clause := CASE p_sort_by
        WHEN 'popularity' THEN 'ORDER BY p.sales_count DESC, p.created_at DESC'
        WHEN 'price_asc'  THEN 'ORDER BY p.price ASC, p.created_at DESC'
        WHEN 'price_desc' THEN 'ORDER BY p.price DESC, p.created_at DESC'
        ELSE 'ORDER BY p.created_at DESC'
    END;

    -- ======================================================
    -- ===           КЛЮЧЕВОЕ ИЗМЕНЕНИЕ ЗДЕСЬ           ===
    -- ======================================================
    
    -- 1. Вычисляем смещение (OFFSET).
    -- Для 1-й страницы (p_page_number=1) смещение будет (1-1)*12 = 0 (пропустить 0 записей).
    -- Для 2-й страницы (p_page_number=2) смещение будет (2-1)*12 = 12 (пропустить первые 12 записей).
    offset_value := (p_page_number - 1) * p_page_size;

    -- 2. Добавляем к запросу сортировку и пагинацию (LIMIT и OFFSET).
    query := query || ' ' || order_by_clause;
    query := query || ' LIMIT $5 OFFSET $6'; -- `$5` и `$6` - это плейсхолдеры для новых параметров.
    
    -- 3. Выполняем запрос, передавая в него ВСЕ параметры в правильном порядке.
    RETURN QUERY EXECUTE query
    USING 
        category_ids_subtree, -- $1
        p_subcategory_ids,    -- $2
        p_price_min,          -- $3
        p_price_max,          -- $4
        p_page_size,          -- $5 (LIMIT)
        offset_value;         -- $6 (OFFSET)
END;
$$;
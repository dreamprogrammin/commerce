-- migration.sql
-- Название: update_get_filtered_products_with_recursive_category_search

-- Удаляем старую версию функции, если она существует, чтобы избежать конфликтов.
DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, INT, INT, NUMERIC, NUMERIC, TEXT, UUID[]);

-- Создаем новую, правильную версию функции.
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 12,
    p_price_max NUMERIC DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_subcategory_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
    -- Явно перечисляем все колонки из таблицы 'products', чтобы совпадало с 'ProductRow'
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    price NUMERIC,
    category_id UUID,
    bonus_points_award INT4,
    stock_quantity INT4,
    sales_count INT4,
    is_active BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    min_age INT4,
    max_age INT4,
    gender TEXT,
    accessory_ids UUID[],
    is_accessory BOOLEAN,
    -- Добавляем колонку для изображений в формате JSON
    product_images JSON[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_category_ids UUID[]; -- Массив для хранения ID основной категории и всех ее дочерних
BEGIN
    -- Шаг 1: Определяем, по каким категориям будем фильтровать
    IF p_category_slug IS NOT NULL AND p_category_slug <> 'all' THEN
        -- Если передан конкретный слаг, рекурсивно находим ID этой категории и всех ее подкатегорий
        WITH RECURSIVE category_tree AS (
            SELECT c.id
            FROM public.categories c
            WHERE c.slug = p_category_slug
            UNION ALL
            SELECT c.id
            FROM public.categories c
            JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT array_agg(id) INTO v_category_ids FROM category_tree;
    END IF;

    -- Шаг 2: Основной запрос с правильной фильтрацией
    RETURN QUERY
    SELECT
        p.*,
        -- Агрегируем все изображения товара в один JSON-массив для эффективности
        (
            SELECT array_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order))
            FROM public.product_images pi
            WHERE pi.product_id = p.id
        ) AS product_images
    FROM
        public.products p
    WHERE
        p.is_active = true
        -- КЛЮЧЕВОЙ ФИЛЬТР по ОСНОВНОЙ КАТЕГОРИИ (и ее детям)
        AND (v_category_ids IS NULL OR p.category_id = ANY(v_category_ids))
        -- Фильтр по ПОДКАТЕГОРИЯМ (чекбоксы)
        AND (p_subcategory_ids IS NULL OR array_length(p_subcategory_ids, 1) IS NULL OR p.category_id = ANY(p_subcategory_ids))
        -- Фильтры по цене
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
    ORDER BY
        -- Сортировка
        CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'price_asc' THEN p.price END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC NULLS LAST
    -- Пагинация
    LIMIT p_page_size
    OFFSET (p_page_number - 1) * p_page_size;

END;
$$;
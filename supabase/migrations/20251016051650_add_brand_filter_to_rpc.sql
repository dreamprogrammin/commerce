-- Up Migration: Добавляем фильтр по бренду

-- Сначала удаляем старую версию функции, чтобы избежать конфликтов
DROP FUNCTION IF EXISTS public.get_filtered_products;

-- Создаем новую, расширенную версию функции
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_brand_slug TEXT DEFAULT NULL, -- <-- НОВЫЙ ПАРАМЕТР
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 10
)
RETURNS TABLE (
    -- ... (все колонки, которые возвращает ваша функция, остаются без изменений)
    -- Убедитесь, что они соответствуют вашей текущей версии.
    -- Вот примерный набор:
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    price NUMERIC,
    -- ... и так далее
    product_images JSONB[]
) AS $$
DECLARE
    v_category_ids UUID[];
    v_brand_id UUID;
BEGIN
    -- Получаем ID всех категорий (родительской и дочерних)
    IF p_category_slug IS NOT NULL AND p_category_slug <> 'all' THEN
        SELECT ARRAY(
            SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) cat
        ) INTO v_category_ids;
    END IF;

    -- <-- НОВЫЙ БЛОК: Получаем ID бренда по его слагу -->
    IF p_brand_slug IS NOT NULL THEN
        SELECT b.id INTO v_brand_id FROM public.brands b WHERE b.slug = p_brand_slug;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.slug,
        p.description,
        p.price,
        -- ... (все остальные колонки продукта)
        -- Агрегируем изображения в JSON массив
        ARRAY(
            SELECT jsonb_build_object('id', pi.id, 'image_url', pi.image_url)
            FROM public.product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.display_order
        ) AS product_images
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        -- Фильтр по категории
        AND (v_category_ids IS NULL OR p.category_id = ANY(v_category_ids))
        -- Фильтр по подкатегориям
        AND (p_subcategory_ids IS NULL OR p.category_id = ANY(p_subcategory_ids))
        -- <-- НОВЫЙ ФИЛЬТР: по бренду -->
        AND (v_brand_id IS NULL OR p.brand_id = v_brand_id)
        -- Фильтр по цене
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
    ORDER BY
        -- Логика сортировки
        CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
        CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC,
        CASE WHEN p_sort_by = 'price_asc' THEN p.price END ASC,
        CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC
    -- Пагинация
    LIMIT p_page_size
    OFFSET (p_page_number - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql;


/*
-- Down Migration (Откат)
-- Закомментировано, как вы просили.
-- Этот код вернет старую версию функции без фильтра по бренду.

DROP FUNCTION IF EXISTS public.get_filtered_products;

-- Здесь нужно вставить код вашей СТАРОЙ версии функции get_filtered_products
-- ...

*/
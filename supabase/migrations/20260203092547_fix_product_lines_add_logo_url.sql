-- ============================================================================
-- ИСПРАВЛЕНИЕ: Добавление logo_url в get_product_lines_by_category_slug
-- ============================================================================
-- Функция возвращала только id, name, slug, brand_id, brand_name, product_count
-- но НЕ возвращала logo_url линейки продукта
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_product_lines_by_category_slug(TEXT);

CREATE OR REPLACE FUNCTION public.get_product_lines_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    brand_id UUID,
    brand_name TEXT,
    logo_url TEXT,
    blur_placeholder TEXT,
    product_count BIGINT
) AS $$
DECLARE
    v_category_id UUID;
    v_category_ids UUID[];
BEGIN
    -- Получаем ID категории по slug
    SELECT c.id INTO v_category_id
    FROM public.categories c
    WHERE c.slug = p_category_slug;

    IF v_category_id IS NULL THEN
        RETURN;
    END IF;

    -- Получаем все дочерние категории (включая текущую)
    WITH RECURSIVE category_tree AS (
        SELECT cat.id FROM public.categories cat WHERE cat.id = v_category_id
        UNION ALL
        SELECT child.id FROM public.categories child
        INNER JOIN category_tree ct ON child.parent_id = ct.id
    )
    SELECT ARRAY_AGG(ct.id) INTO v_category_ids FROM category_tree ct;

    -- Возвращаем product_lines с явным указанием таблиц и ВСЕМИ полями
    RETURN QUERY
    SELECT
        pl.id AS id,
        pl.name AS name,
        pl.slug AS slug,
        pl.brand_id AS brand_id,
        b.name AS brand_name,
        pl.logo_url AS logo_url,
        pl.blur_placeholder AS blur_placeholder,
        COUNT(DISTINCT p.id)::BIGINT AS product_count
    FROM public.product_lines pl
    INNER JOIN public.brands b ON b.id = pl.brand_id
    INNER JOIN public.products p ON p.product_line_id = pl.id
    WHERE p.category_id = ANY(v_category_ids)
      AND p.is_active = true
    GROUP BY pl.id, pl.name, pl.slug, pl.brand_id, b.name, pl.logo_url, pl.blur_placeholder
    ORDER BY b.name ASC, pl.name ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.get_product_lines_by_category_slug(TEXT) IS
'Возвращает список product_lines для заданной категории (включая дочерние) с логотипами и количеством товаров';

-- Миграция: Добавление logo_url и description в get_product_lines_by_category_slug
-- Проблема: RPC функция не возвращает logo_url и description для линеек продуктов,
-- поэтому на странице категорий не отображаются логотипы линеек

-- Удаляем старую функцию, т.к. PostgreSQL не позволяет менять RETURNS TABLE через CREATE OR REPLACE
DROP FUNCTION IF EXISTS public.get_product_lines_by_category_slug(TEXT);

-- Создаем функцию заново с новыми полями
CREATE FUNCTION public.get_product_lines_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    brand_id UUID,
    brand_name TEXT,
    logo_url TEXT,
    description TEXT,
    product_count BIGINT
) AS $$
DECLARE
    v_category_id UUID;
    v_category_ids UUID[];
BEGIN
    -- Получаем ID категории по slug (используем алиас c)
    SELECT c.id INTO v_category_id
    FROM public.categories c
    WHERE c.slug = p_category_slug;

    IF v_category_id IS NULL THEN
        RETURN;
    END IF;

    -- Получаем все дочерние категории (включая текущую)
    -- Квалифицируем все ссылки на id через алиасы
    WITH RECURSIVE category_tree AS (
        SELECT cat.id FROM public.categories cat WHERE cat.id = v_category_id
        UNION ALL
        SELECT c.id FROM public.categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT ARRAY_AGG(ct.id) INTO v_category_ids FROM category_tree ct;

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.slug,
        pl.brand_id,
        b.name AS brand_name,
        pl.logo_url,
        pl.description,
        COUNT(p.id) AS product_count
    FROM public.product_lines pl
    INNER JOIN public.brands b ON b.id = pl.brand_id
    INNER JOIN public.products p ON p.product_line_id = pl.id
    WHERE p.category_id = ANY(v_category_ids)
      AND p.is_active = true
    GROUP BY pl.id, pl.name, pl.slug, pl.brand_id, b.name, pl.logo_url, pl.description
    ORDER BY b.name ASC, pl.name ASC;
END;
$$ LANGUAGE plpgsql STABLE;

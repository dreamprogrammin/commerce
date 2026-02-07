-- Add piece count filter support

-- Function to get min/max piece_count for a category
CREATE OR REPLACE FUNCTION get_category_piece_count_range(p_category_slug TEXT)
RETURNS TABLE (min_count INTEGER, max_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_category_id UUID;
BEGIN
    -- Get category ID from slug
    SELECT id INTO v_category_id
    FROM categories
    WHERE slug = p_category_slug;

    IF v_category_id IS NULL THEN
        RETURN QUERY SELECT NULL::INTEGER, NULL::INTEGER;
        RETURN;
    END IF;

    -- Get min/max piece_count for products in this category (including subcategories)
    RETURN QUERY
    WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE id = v_category_id
        UNION ALL
        SELECT c.id FROM categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT
        MIN(p.piece_count)::INTEGER as min_count,
        MAX(p.piece_count)::INTEGER as max_count
    FROM products p
    WHERE p.category_id IN (SELECT id FROM category_tree)
      AND p.piece_count IS NOT NULL
      AND p.is_active = true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_category_piece_count_range(TEXT) TO anon, authenticated;

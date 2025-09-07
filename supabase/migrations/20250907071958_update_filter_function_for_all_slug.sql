-- Обновляем функцию get_filtered_products, чтобы она могла
-- обрабатывать специальный slug 'all' для отображения товаров
-- из ВСЕХ категорий.

CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_size INT DEFAULT 12,
    p_page_number INT DEFAULT 1
)
RETURNS SETOF products AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE category_tree AS (
    SELECT id FROM public.categories WHERE slug = p_category_slug
    UNION ALL
    SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT p.*
  FROM public.products p
  WHERE
    p.is_active = TRUE
    
    -- ИЗМЕНЕНИЕ: Добавляем проверку на 'all'
    AND (
      -- Если slug - 'all', этот фильтр по категориям пропускается
      p_category_slug = 'all' 
      OR
      -- Иначе, работает старая логика фильтрации
      (
        (p_subcategory_ids IS NULL OR array_length(p_subcategory_ids, 1) IS NULL OR array_length(p_subcategory_ids, 1) = 0)
        AND p.category_id IN (SELECT id FROM category_tree)
      )
      OR
      (
        (p_subcategory_ids IS NOT NULL AND array_length(p_subcategory_ids, 1) > 0)
        AND p.category_id = ANY(p_subcategory_ids)
      )
    )

    AND (p_price_min IS NULL OR p.price >= p_price_min)
    AND (p_price_max IS NULL OR p.price <= p_price_max)
    
  ORDER BY
    CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
    CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC,
    CASE WHEN p_sort_by = 'price_asc'  THEN p.price END ASC,
    CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC,
    p.created_at DESC
    
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql STABLE;
-- Функция для получения всех комбинаций категория + бренд с товарами
CREATE OR REPLACE FUNCTION get_category_brand_combinations()
RETURNS TABLE (
  category_id uuid,
  category_name text,
  category_slug text,
  brand_id uuid,
  brand_name text,
  brand_slug text,
  products_count bigint,
  min_price numeric,
  max_price numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as category_id,
    c.name as category_name,
    c.slug as category_slug,
    b.id as brand_id,
    b.name as brand_name,
    b.slug as brand_slug,
    COUNT(p.id) as products_count,
    MIN(p.price) as min_price,
    MAX(p.price) as max_price
  FROM categories c
  CROSS JOIN brands b
  INNER JOIN products p ON p.category_id = c.id AND p.brand_id = b.id
  WHERE p.is_active = true
  GROUP BY c.id, c.name, c.slug, b.id, b.name, b.slug
  HAVING COUNT(p.id) >= 3  -- Минимум 3 товара для создания SEO-страницы
  ORDER BY products_count DESC;
END;
$$ LANGUAGE plpgsql;

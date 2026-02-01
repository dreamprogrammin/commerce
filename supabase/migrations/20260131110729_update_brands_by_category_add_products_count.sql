-- Сначала удаляем старую функцию
DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);

-- Создаём новую функцию с обновлённой сигнатурой
CREATE FUNCTION public.get_brands_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  products_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH category_ids AS (
    SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) AS cat
  )
  SELECT
    b.id,
    b.name,
    b.slug,
    b.logo_url,
    COUNT(DISTINCT p.id) AS products_count
  FROM public.brands AS b
  JOIN public.products AS p ON p.brand_id = b.id
  WHERE p.category_id IN (SELECT cat_ids.id FROM category_ids AS cat_ids)
    AND p.brand_id IS NOT NULL
    AND p.is_active = true
  GROUP BY b.id, b.name, b.slug, b.logo_url
  ORDER BY products_count DESC, b.name;
END;
$$;

COMMENT ON FUNCTION public.get_brands_by_category_slug(TEXT) IS
'Возвращает бренды для категории с количеством активных товаров и логотипом';

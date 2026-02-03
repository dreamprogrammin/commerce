-- ============================================================================
-- ИСПРАВЛЕНИЕ: Добавление logo_url в get_brands_by_category_slug
-- ============================================================================
-- Функция возвращала только id, name, slug, но НЕ возвращала logo_url
-- Из-за этого логотипы брендов не отображались в каталоге
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);

CREATE OR REPLACE FUNCTION public.get_brands_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  logo_url TEXT,
  blur_placeholder TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    b.id AS id,
    b.name AS name,
    b.slug AS slug,
    b.logo_url AS logo_url,
    b.blur_placeholder AS blur_placeholder
  FROM public.products AS p
  JOIN public.brands AS b ON p.brand_id = b.id
  WHERE p.category_id IN (
    SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) AS cat(id)
  )
    AND p.brand_id IS NOT NULL
  ORDER BY b.name;
END;
$$;

COMMENT ON FUNCTION public.get_brands_by_category_slug(TEXT) IS
'Возвращает список уникальных брендов для заданной категории (включая дочерние категории) с логотипами';

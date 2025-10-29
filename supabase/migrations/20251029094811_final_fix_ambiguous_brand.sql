-- Up Migration: Исправляем ошибку "column reference id is ambiguous" в get_brands_by_category_slug

DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);

CREATE OR REPLACE FUNCTION public.get_brands_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    b.id,
    b.name,
    b.slug
  FROM public.products AS p
  JOIN public.brands AS b ON p.brand_id = b.id
  WHERE p.category_id IN (
    SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) AS cat(id)
  )
    AND p.brand_id IS NOT NULL
  ORDER BY b.name;
END;
$$;

/*
-- Down Migration
DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);
*/
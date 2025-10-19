-- Up Migration: Создаем ИСПРАВЛЕННУЮ функцию для получения брендов в категории

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
  WITH category_ids AS (
    -- Здесь все в порядке, так как у get_category_and_children_ids только одна колонка 'id'
    SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) AS cat
  )
  SELECT DISTINCT
    b.id,
    b.name,
    b.slug
  FROM public.products AS p
  JOIN public.brands AS b ON p.brand_id = b.id
  -- ИСПРАВЛЕНИЕ ЗДЕСЬ: Мы явно указываем, что сравниваем p.category_id с cat_id.id
  WHERE p.category_id IN (SELECT cat_ids.id FROM category_ids AS cat_ids)
    AND p.brand_id IS NOT NULL
  ORDER BY b.name;
END;
$$;


/*
-- Down Migration (Откат)
-- ВАЖНО: Этот блок закомментирован.

DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);

*/
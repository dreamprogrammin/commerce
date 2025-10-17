-- Up Migration: Создаем функцию для получения брендов в категории

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
    -- Используем вашу существующую RPC-функцию get_category_and_children_ids
    -- для получения ID текущей категории и всех ее дочерних подкатегорий.
    SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) AS cat
  )
  -- Выбираем уникальные (DISTINCT) бренды
  SELECT DISTINCT
    b.id,
    b.name,
    b.slug
  FROM public.products AS p
  -- Присоединяем таблицу брендов, чтобы получить их данные
  JOIN public.brands AS b ON p.brand_id = b.id
  -- Фильтруем товары:
  -- 1. Они должны принадлежать к одной из найденных категорий.
  -- 2. У них должен быть указан бренд (brand_id IS NOT NULL).
  WHERE p.category_id IN (SELECT id FROM category_ids)
    AND p.brand_id IS NOT NULL
  -- Сортируем результат по имени бренда для удобства
  ORDER BY b.name;
END;
$$;


/*
-- Down Migration (Откат)
-- ВАЖНО: Этот блок закомментирован, как вы просили.
-- Он удаляет созданную функцию, если понадобится откат.

DROP FUNCTION IF EXISTS public.get_brands_by_category_slug(TEXT);

*/
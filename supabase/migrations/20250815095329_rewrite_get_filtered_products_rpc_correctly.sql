DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, UUID[], NUMERIC, NUMERIC, TEXT, INT, INT);

-- Пересоздаем функцию с нуля, чтобы гарантировать ее работоспособность.
-- Она будет простой, читаемой и эффективной.
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_size INT DEFAULT 12,
    p_page_number INT DEFAULT 1
)
RETURNS SETOF products -- Возвращаем строки, которые точно соответствуют типу `products`
LANGUAGE sql STABLE
AS $$
  -- 1. Сначала находим все ID категорий, включая дочерние
  WITH RECURSIVE category_tree AS (
    SELECT id FROM public.categories WHERE slug = p_category_slug
    UNION ALL
    SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
  )
  -- 2. Затем выполняем основной запрос
  SELECT p.*
  FROM public.products p
  WHERE
    p.is_active = TRUE
    -- Фильтр по основному дереву категорий
    AND p.category_id IN (SELECT id FROM category_tree)
    -- Фильтр по подкатегориям (срабатывает, только если p_subcategory_ids передан и не пустой)
    AND (
      p_subcategory_ids IS NULL OR
      array_length(p_subcategory_ids, 1) = 0 OR
      p.category_id = ANY(p_subcategory_ids)
    )
    -- Фильтр по цене (срабатывает, только если параметры переданы)
    AND (p_price_min IS NULL OR p.price >= p_price_min)
    AND (p_price_max IS NULL OR p.price <= p_price_max)
  -- 3. Сортируем результат
  ORDER BY
    CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
    CASE WHEN p_sort_by = 'price_asc'  THEN p.price END ASC,
    CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC,
    p.created_at DESC -- Всегда сортируем по новизне в качестве вторичного ключа
  -- 4. Применяем пагинацию
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
$$;
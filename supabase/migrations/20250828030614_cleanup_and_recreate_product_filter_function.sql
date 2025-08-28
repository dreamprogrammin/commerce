-- Финальная миграция: полная очистка и пересоздание функции get_filtered_products
--
-- Что делает эта миграция:
-- 1. Удаляет старую версию функции БЕЗ значений по умолчанию (если она существует).
-- 2. Удаляет старую версию функции С значениями по умолчанию (если она существует).
--    Это решает проблему "function is not unique".
-- 3. Создает единственную, правильную и оптимизированную версию функции.

-- ШАГ 1: Удаляем старую функцию (сигнатура без DEFAULT)
-- Эта версия могла остаться от первоначального создания
DROP FUNCTION IF EXISTS public.get_filtered_products(
  p_category_slug TEXT,
  p_subcategory_ids UUID[],
  p_price_min NUMERIC,
  p_price_max NUMERIC,
  p_sort_by TEXT,
  p_page_size INT,
  p_page_number INT
);

-- ШАГ 2: Удаляем старую функцию (сигнатура С DEFAULT)
-- Эта версия могла остаться от неудачных попыток миграции
DROP FUNCTION IF EXISTS public.get_filtered_products(
  p_category_slug TEXT,
  p_subcategory_ids UUID[],
  p_price_min NUMERIC,
  p_price_max NUMERIC,
  p_sort_by TEXT,
  p_page_size INT
);

-- ШАГ 3: Создаем единственную, правильную версию функции
CREATE OR REPLACE FUNCTION public.get_filtered_products(
  p_category_slug TEXT,
  p_subcategory_ids UUID[] DEFAULT NULL,
  p_price_min NUMERIC DEFAULT NULL,
  p_price_max NUMERIC DEFAULT NULL,
  p_sort_by TEXT DEFAULT 'popularity',
  p_page_size INT DEFAULT 12,
  p_page_number INT DEFAULT 1
)
RETURNS SETOF public.products AS $$
BEGIN
  RETURN QUERY
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
    
    -- ИСПРАВЛЕННАЯ ЛОГИКА ФИЛЬТРАЦИИ ПО КАТЕГОРИЯМ
    AND (
      -- СЛУЧАЙ 1: Если массив подкатегорий НЕ предоставлен (пустой или NULL),
      -- то мы ищем товары во всем дереве категорий.
      (
        (p_subcategory_ids IS NULL OR array_length(p_subcategory_ids, 1) IS NULL OR array_length(p_subcategory_ids, 1) = 0)
        AND p.category_id IN (SELECT id FROM category_tree)
      )
      OR
      -- СЛУЧАЙ 2: Если массив подкатегорий предоставлен,
      -- то мы ищем товары ТОЛЬКО в этом массиве.
      (
        (p_subcategory_ids IS NOT NULL AND array_length(p_subcategory_ids, 1) > 0)
        AND p.category_id = ANY(p_subcategory_ids)
      )
    )

    -- Фильтр по цене (без изменений)
    AND (p_price_min IS NULL OR p.price >= p_price_min)
    AND (p_price_max IS NULL OR p.price <= p_price_max)
    
  -- 3. Сортируем результат (без изменений)
  ORDER BY
    CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
    CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC,
    CASE WHEN p_sort_by = 'price_asc'  THEN p.price END ASC,
    CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC,
    p.created_at DESC -- Вторичная сортировка по новизне для стабильности
    
  -- 4. Применяем пагинацию (без изменений)
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql STABLE;
-- ================================================================================
-- МИГРАЦИЯ: Рекурсивный агрегированный рейтинг категории
-- Обновляет get_category_aggregate_rating — теперь считает рейтинг по всем
-- товарам в категории И во всех её подкатегориях (рекурсивно).
-- Учитываются только активные товары (is_active = true) с отзывами.
-- ================================================================================

CREATE OR REPLACE FUNCTION public.get_category_aggregate_rating(p_category_id UUID)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH RECURSIVE category_tree AS (
    -- Базовая категория
    SELECT id FROM public.categories WHERE id = p_category_id
    UNION ALL
    -- Все подкатегории рекурсивно
    SELECT c.id FROM public.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT json_build_object(
    'avg_rating',
    ROUND(
      COALESCE(
        SUM(p.avg_rating * p.review_count)::numeric / NULLIF(SUM(p.review_count), 0),
        0
      ),
      1
    ),
    'total_reviews', COALESCE(SUM(p.review_count), 0)
  )
  FROM public.products p
  INNER JOIN category_tree ct ON p.category_id = ct.id
  WHERE p.is_active = true
    AND p.review_count > 0;
$$;

COMMENT ON FUNCTION public.get_category_aggregate_rating(UUID) IS
'Возвращает агрегированный рейтинг категории с рекурсивным обходом подкатегорий: взвешенное среднее avg_rating и сумма review_count всех активных товаров. Используется для Schema.org aggregateRating и UI блока рейтинга.';

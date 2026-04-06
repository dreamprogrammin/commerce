-- Функция для получения распределения оценок по категории
-- Возвращает реальное количество отзывов для каждой оценки (1-5 звезд)
CREATE OR REPLACE FUNCTION get_category_rating_distribution(
  p_category_id UUID
)
RETURNS TABLE (
  stars INT,
  count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.rating AS stars,
    COUNT(*)::BIGINT AS count
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  WHERE p.category_id IN (
    SELECT id FROM get_category_and_children_ids(p_category_id)
  )
  GROUP BY r.rating
  ORDER BY r.rating DESC;
END;
$$;

-- Исправление функции get_latest_category_reviews
-- Убираем фильтр по непустому тексту, чтобы показывать все отзывы (даже без текста)
CREATE OR REPLACE FUNCTION get_latest_category_reviews(
  p_category_id UUID,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  review_id BIGINT,
  rating INT,
  text TEXT,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  product_name TEXT,
  product_slug TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id AS review_id,
    r.rating,
    r.text,
    r.created_at,
    COALESCE(prof.full_name, 'Покупатель') AS user_name,
    p.name AS product_name,
    p.slug AS product_slug
  FROM reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN profiles prof ON prof.id = r.user_id
  WHERE p.category_id IN (
    SELECT id FROM get_category_and_children_ids(p_category_id)
  )
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$$;

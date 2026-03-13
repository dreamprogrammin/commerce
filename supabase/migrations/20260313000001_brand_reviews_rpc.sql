-- ============================================================
-- RPC: get_reviews_by_brand — все отзывы на товары бренда
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_reviews_by_brand(
  p_brand_id UUID,
  p_limit INT DEFAULT 10,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  rating SMALLINT,
  comment TEXT,
  created_at TIMESTAMPTZ,
  product_id UUID,
  product_name TEXT,
  product_slug TEXT,
  user_name TEXT,
  user_avatar_url TEXT,
  images JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    r.id,
    r.rating,
    r.text AS comment,
    r.created_at,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
      'Покупатель'
    ) AS user_name,
    pr.avatar_url AS user_avatar_url,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ri.id,
            'image_url', ri.image_url,
            'blur_placeholder', ri.blur_placeholder,
            'display_order', ri.display_order
          )
          ORDER BY ri.display_order
        )
        FROM review_images ri
        WHERE ri.review_id = r.id
      ),
      '[]'::jsonb
    ) AS images
  FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN profiles pr ON pr.id = r.user_id
  WHERE p.brand_id = p_brand_id
    AND r.is_published = true
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- ============================================================
-- RPC: get_brand_stats — агрегированная статистика бренда
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_brand_stats(p_brand_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT json_build_object(
    'average_rating', COALESCE(
      ROUND(
        SUM(p.avg_rating * p.review_count)::numeric
        / NULLIF(SUM(p.review_count), 0),
        1
      ),
      0
    ),
    'total_reviews_count', COALESCE(SUM(p.review_count), 0)::int
  )
  FROM products p
  WHERE p.brand_id = p_brand_id
    AND p.is_active = true
    AND p.review_count > 0;
$$;

-- Гранты для anon и authenticated
GRANT EXECUTE ON FUNCTION public.get_reviews_by_brand(UUID, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_brand_stats(UUID) TO anon, authenticated;

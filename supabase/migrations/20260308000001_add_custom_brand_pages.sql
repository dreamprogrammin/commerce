-- Migration: Add custom landing page support for brands
-- Adds is_custom_page flag and page_layout JSONB column to brands table
-- Creates get_brand_aggregate_rating RPC for SEO schema.org

-- 1. Add new columns to brands table
ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS is_custom_page BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS page_layout JSONB DEFAULT NULL;

COMMENT ON COLUMN public.brands.is_custom_page IS
'Флаг: использовать кастомный landing page вместо стандартного шаблона';

COMMENT ON COLUMN public.brands.page_layout IS
'JSON конфигурация кастомной страницы: { heroBanner, heroBannerBlur, featuredLineIds }';

-- 2. Create aggregate rating function for brands (mirrors get_category_aggregate_rating)
CREATE OR REPLACE FUNCTION public.get_brand_aggregate_rating(p_brand_id UUID)
RETURNS JSON LANGUAGE sql STABLE SECURITY DEFINER AS $$
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
  WHERE p.brand_id = p_brand_id
    AND p.is_active = true
    AND p.review_count > 0;
$$;

COMMENT ON FUNCTION public.get_brand_aggregate_rating(UUID) IS
'Возвращает агрегированный рейтинг бренда: взвешенное среднее avg_rating и сумма review_count всех активных товаров бренда. Используется для Schema.org aggregateRating.';

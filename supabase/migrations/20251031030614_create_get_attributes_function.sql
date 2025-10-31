-- Удаляем старую функцию если существует
DROP FUNCTION IF EXISTS public.get_attributes_for_category_slug(text) CASCADE;

-- Создаём новую функцию
CREATE OR REPLACE FUNCTION public.get_attributes_for_category_slug(p_category_slug text)
RETURNS TABLE (
  id bigint,
  name text,
  slug text,
  display_type text,
  attribute_options json
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.slug,
    a.display_type,
    COALESCE(
      json_agg(
        json_build_object(
          'id', ao.id,
          'attribute_id', ao.attribute_id,
          'value', ao.value,
          'meta', ao.meta
        ) ORDER BY ao.id
      ) FILTER (WHERE ao.id IS NOT NULL),
      '[]'::json
    ) as attribute_options
  FROM public.attributes a
  INNER JOIN public.category_attributes ca ON a.id = ca.attribute_id
  INNER JOIN public.categories c ON ca.category_id = c.id
  LEFT JOIN public.attribute_options ao ON a.id = ao.attribute_id
  WHERE c.slug = p_category_slug
  GROUP BY a.id, a.name, a.slug, a.display_type
  ORDER BY a.id;
END;
$$ LANGUAGE plpgsql STABLE;
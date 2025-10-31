CREATE OR REPLACE FUNCTION get_attributes_for_category_slug(p_category_slug text)
RETURNS TABLE (
  id integer,
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
    json_agg(
      json_build_object(
        'id', ao.id,
        'attribute_id', ao.attribute_id,
        'value', ao.value,
        'meta', ao.meta
      )
    ) as attribute_options
  FROM attributes a
  JOIN category_attributes ca ON a.id = ca.attribute_id
  JOIN categories c ON ca.category_id = c.id
  LEFT JOIN attribute_options ao ON a.id = ao.attribute_id
  WHERE c.slug = p_category_slug
  GROUP BY a.id, a.name, a.slug, a.display_type;
END;
$$ 
LANGUAGE plpgsql;

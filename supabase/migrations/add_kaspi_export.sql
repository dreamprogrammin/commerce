-- ШАГ 1: Добавление колонки export_to_kaspi
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS export_to_kaspi boolean DEFAULT false;

-- Функция для админки: топ товары с расчетом цены Kaspi
CREATE OR REPLACE FUNCTION get_kaspi_admin_list()
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  final_price numeric,
  stock_quantity integer,
  export_to_kaspi boolean,
  views_count integer,
  kaspi_price numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.sku,
    p.name,
    p.final_price,
    p.stock_quantity,
    p.export_to_kaspi,
    COALESCE(p.views_count, 0) as views_count,
    CEIL((p.final_price / 0.87) / 10) * 10 as kaspi_price
  FROM products p
  ORDER BY COALESCE(p.views_count, 0) DESC;
END;
$$;

-- Функция для XML-фида: только активные товары с экспортом
CREATE OR REPLACE FUNCTION get_kaspi_feed_products()
RETURNS TABLE (
  sku text,
  name text,
  brand_name text,
  stock_quantity integer,
  kaspi_price numeric
) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.sku,
    p.name,
    b.name as brand_name,
    p.stock_quantity,
    CEIL((p.final_price / 0.87) / 10) * 10 as kaspi_price
  FROM products p
  LEFT JOIN brands b ON p.brand_id = b.id
  WHERE p.is_active = true 
    AND p.export_to_kaspi = true;
END;
$$;

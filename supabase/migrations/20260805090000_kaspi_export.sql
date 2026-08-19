-- ПОЛНАЯ МИГРАЦИЯ KASPI EXPORT
-- Выполни этот SQL в Supabase Dashboard → SQL Editor

-- 1. Добавление колонки export_to_kaspi
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS export_to_kaspi boolean DEFAULT false;

-- 2. Удаляем старые версии функций
DROP FUNCTION IF EXISTS get_kaspi_admin_list();
DROP FUNCTION IF EXISTS get_kaspi_feed_products();

-- 3. Функция для админки: все товары с расчетом цены Kaspi
CREATE OR REPLACE FUNCTION get_kaspi_admin_list()
RETURNS TABLE (
  id uuid,
  sku text,
  name text,
  final_price numeric,
  stock_quantity integer,
  export_to_kaspi boolean,
  kaspi_price numeric,
  category_id uuid,
  brand_id uuid
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
    CEIL((p.final_price / 0.87) / 10) * 10 as kaspi_price,
    p.category_id,
    p.brand_id
  FROM products p
  ORDER BY p.name;
END;
$$;

-- 4. Функция для XML-фида: только активные товары с экспортом
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

-- 5. Проверка: выводим количество товаров готовых к экспорту
SELECT COUNT(*) as ready_for_export FROM products WHERE export_to_kaspi = true;

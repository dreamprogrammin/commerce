-- ============================================================================
-- Добавление min_stock_level и restock_quantity в products
-- + RPC get_restock_list() для страницы закупок
-- ============================================================================

-- 1. Новые колонки
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'min_stock_level'
  ) THEN
    ALTER TABLE public.products ADD COLUMN min_stock_level INT NOT NULL DEFAULT 2;
    COMMENT ON COLUMN public.products.min_stock_level IS 'Минимальный остаток. Если stock_quantity <= min_stock_level — товар попадает в список закупок';
    RAISE NOTICE '✓ products.min_stock_level добавлен';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'restock_quantity'
  ) THEN
    ALTER TABLE public.products ADD COLUMN restock_quantity INT NOT NULL DEFAULT 5;
    COMMENT ON COLUMN public.products.restock_quantity IS 'Сколько штук нужно дозаказать при закупке';
    RAISE NOTICE '✓ products.restock_quantity добавлен';
  END IF;
END $$;

-- 2. RPC: список товаров к закупке, сгруппированных по поставщику
CREATE OR REPLACE FUNCTION public.get_restock_list()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(supplier_group) ORDER BY supplier_group.supplier_name), '[]'::json)
  INTO result
  FROM (
    SELECT
      s.id AS supplier_id,
      COALESCE(s.name, 'Без поставщика') AS supplier_name,
      s.contact_person AS supplier_contact,
      s.phone AS supplier_phone,
      s.address AS supplier_address,
      (
        SELECT json_agg(row_to_json(prod) ORDER BY prod.stock_quantity ASC)
        FROM (
          SELECT
            p.id,
            p.name,
            p.sku,
            p.price,
            p.stock_quantity,
            p.min_stock_level,
            p.restock_quantity,
            p.sales_count,
            (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image_url
          FROM products p
          WHERE p.is_active = true
            AND p.stock_quantity <= p.min_stock_level
            AND (
              (s.id IS NULL AND p.supplier_id IS NULL)
              OR p.supplier_id = s.id
            )
        ) prod
      ) AS products,
      (
        SELECT COUNT(*)
        FROM products p
        WHERE p.is_active = true
          AND p.stock_quantity <= p.min_stock_level
          AND (
            (s.id IS NULL AND p.supplier_id IS NULL)
            OR p.supplier_id = s.id
          )
      ) AS product_count
    FROM (
      -- Все поставщики, у которых есть товары к закупке
      SELECT DISTINCT s2.id, s2.name, s2.contact_person, s2.phone, s2.address
      FROM products p2
      LEFT JOIN suppliers s2 ON s2.id = p2.supplier_id
      WHERE p2.is_active = true AND p2.stock_quantity <= p2.min_stock_level
    ) s
  ) supplier_group
  WHERE supplier_group.product_count > 0;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_restock_list() TO authenticated;

NOTIFY pgrst, 'reload schema';

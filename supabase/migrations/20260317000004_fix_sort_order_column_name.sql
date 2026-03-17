-- ============================================================================
-- FIX: product_images.sort_order → display_order в RPC функциях
-- ============================================================================

-- 1. Исправление get_dashboard_stats()
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  month_start TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  SELECT json_build_object(
    'revenue_month', (
      SELECT COALESCE(SUM(amount), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
      ) sub
    ),
    'revenue_total', (
      SELECT COALESCE(SUM(amount), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered')
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered')
      ) sub
    ),
    'orders_month', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE created_at >= month_start AND status != 'cancelled'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE created_at >= month_start AND status != 'cancelled'
      ) sub
    ),
    'orders_total', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status != 'cancelled'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status != 'cancelled'
      ) sub
    ),
    'orders_pending', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status IN ('new', 'pending')
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status IN ('new', 'pending')
      ) sub
    ),
    'orders_delivered', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status = 'delivered'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status = 'delivered'
      ) sub
    ),
    'avg_order_month', (
      SELECT COALESCE(ROUND(AVG(amount)), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
      ) sub
    ),
    'top_products', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT
          p.id,
          p.name,
          p.price,
          p.sales_count,
          (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order LIMIT 1) AS image_url
        FROM products p
        WHERE p.sales_count > 0
        ORDER BY p.sales_count DESC
        LIMIT 5
      ) t
    ),
    'revenue_by_day', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.day), '[]'::json) FROM (
        SELECT
          d.day::date AS day,
          COALESCE(SUM(sub.amount), 0) AS revenue,
          COALESCE(COUNT(sub.id), 0) AS order_count
        FROM generate_series(
          (now() - interval '6 days')::date,
          now()::date,
          '1 day'::interval
        ) AS d(day)
        LEFT JOIN (
          SELECT id, final_amount AS amount, created_at::date AS day FROM orders
          WHERE status IN ('confirmed', 'delivered') AND created_at >= now() - interval '7 days'
          UNION ALL
          SELECT id, final_amount AS amount, created_at::date AS day FROM guest_checkouts
          WHERE status IN ('confirmed', 'delivered') AND created_at >= now() - interval '7 days'
        ) sub ON sub.day = d.day::date
        GROUP BY d.day
      ) t
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. Исправление get_restock_list()
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
            (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order LIMIT 1) AS image_url
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

NOTIFY pgrst, 'reload schema';

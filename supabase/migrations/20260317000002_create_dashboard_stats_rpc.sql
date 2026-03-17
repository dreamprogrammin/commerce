-- ============================================================================
-- RPC: get_dashboard_stats() — статистика для админ-дашборда
-- ============================================================================

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
    -- Выручка за текущий месяц (заказы + гостевые, только доставленные/подтвержденные)
    'revenue_month', (
      SELECT COALESCE(SUM(amount), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
      ) sub
    ),
    -- Выручка за всё время
    'revenue_total', (
      SELECT COALESCE(SUM(amount), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered')
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered')
      ) sub
    ),
    -- Заказы за текущий месяц
    'orders_month', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE created_at >= month_start AND status != 'cancelled'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE created_at >= month_start AND status != 'cancelled'
      ) sub
    ),
    -- Заказы за всё время
    'orders_total', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status != 'cancelled'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status != 'cancelled'
      ) sub
    ),
    -- Новые заказы (pending/new — ожидают обработки)
    'orders_pending', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status IN ('new', 'pending')
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status IN ('new', 'pending')
      ) sub
    ),
    -- Доставленные заказы (всего)
    'orders_delivered', (
      SELECT COUNT(*) FROM (
        SELECT id FROM orders WHERE status = 'delivered'
        UNION ALL
        SELECT id FROM guest_checkouts WHERE status = 'delivered'
      ) sub
    ),
    -- Средний чек за месяц
    'avg_order_month', (
      SELECT COALESCE(ROUND(AVG(amount)), 0) FROM (
        SELECT final_amount AS amount FROM orders
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
        UNION ALL
        SELECT final_amount AS amount FROM guest_checkouts
        WHERE status IN ('confirmed', 'delivered') AND created_at >= month_start
      ) sub
    ),
    -- ТОП-5 товаров по продажам
    'top_products', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (
        SELECT
          p.id,
          p.name,
          p.price,
          p.sales_count,
          (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order LIMIT 1) AS image_url
        FROM products p
        WHERE p.sales_count > 0
        ORDER BY p.sales_count DESC
        LIMIT 5
      ) t
    ),
    -- Выручка за последние 7 дней (по дням)
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

-- Доступ только для авторизованных (проверка админа на фронте)
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';

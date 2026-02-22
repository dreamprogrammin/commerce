-- ============================================================================
-- МИГРАЦИЯ: Список продаж + Детали чека
-- RPC: get_sales_list — пагинированный список всех продаж с фильтрами
-- RPC: get_sale_receipt — детальная информация о заказе для фискального чека
-- ============================================================================

-- ============================================================================
-- 1. get_sales_list — пагинированный список продаж (orders + guest_checkouts)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sales_list(
  p_page      INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 20,
  p_source    TEXT DEFAULT NULL,        -- 'online' | 'offline' | NULL (все)
  p_status    TEXT DEFAULT NULL,        -- 'confirmed' | 'cancelled' | etc | NULL (все)
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to   TIMESTAMPTZ DEFAULT NULL,
  p_search    TEXT DEFAULT NULL         -- поиск по имени/телефону/UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_offset      INTEGER;
  v_total       INTEGER;
  v_items       JSONB;
  v_search      TEXT;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  v_offset := (GREATEST(p_page, 1) - 1) * p_page_size;
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  -- Считаем общее количество
  SELECT COUNT(*)::INTEGER INTO v_total
  FROM (
    -- orders
    SELECT o.id, o.created_at, o.status, COALESCE(o.source, 'online') AS source,
           COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS customer_name,
           p.phone AS customer_phone
    FROM public.orders o
    LEFT JOIN public.profiles p ON p.id = o.user_id
    WHERE
      (p_source IS NULL OR COALESCE(o.source, 'online') = p_source)
      AND (p_status IS NULL OR o.status = p_status)
      AND (p_date_from IS NULL OR o.created_at >= p_date_from)
      AND (p_date_to IS NULL OR o.created_at < p_date_to)
      AND (
        v_search IS NULL
        OR o.id::TEXT ILIKE '%' || v_search || '%'
        OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || v_search || '%'
        OR COALESCE(p.phone, '') ILIKE '%' || v_search || '%'
      )

    UNION ALL

    -- guest_checkouts
    SELECT gc.id, gc.created_at, gc.status, COALESCE(gc.source, 'online') AS source,
           COALESCE(gc.guest_name, '') AS customer_name,
           gc.guest_phone AS customer_phone
    FROM public.guest_checkouts gc
    WHERE
      (p_source IS NULL OR COALESCE(gc.source, 'online') = p_source)
      AND (p_status IS NULL OR gc.status = p_status)
      AND (p_date_from IS NULL OR gc.created_at >= p_date_from)
      AND (p_date_to IS NULL OR gc.created_at < p_date_to)
      AND (
        v_search IS NULL
        OR gc.id::TEXT ILIKE '%' || v_search || '%'
        OR COALESCE(gc.guest_name, '') ILIKE '%' || v_search || '%'
        OR COALESCE(gc.guest_phone, '') ILIKE '%' || v_search || '%'
      )
  ) AS combined;

  -- Получаем страницу данных
  SELECT jsonb_agg(row_data)
  INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', sub.id,
      'source_table', sub.source_table,
      'source', sub.source,
      'status', sub.status,
      'customer_name', sub.customer_name,
      'customer_phone', sub.customer_phone,
      'total_amount', sub.total_amount,
      'final_amount', sub.final_amount,
      'bonuses_spent', sub.bonuses_spent,
      'bonuses_awarded', sub.bonuses_awarded,
      'payment_method', sub.payment_method,
      'created_at', sub.created_at
    ) AS row_data
    FROM (
      -- orders
      SELECT
        o.id,
        'orders'::TEXT AS source_table,
        COALESCE(o.source, 'online') AS source,
        o.status,
        COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '') AS customer_name,
        p.phone AS customer_phone,
        o.total_amount,
        o.final_amount,
        COALESCE(o.bonuses_spent, 0) AS bonuses_spent,
        COALESCE(o.bonuses_awarded, 0) AS bonuses_awarded,
        o.payment_method,
        o.created_at
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.user_id
      WHERE
        (p_source IS NULL OR COALESCE(o.source, 'online') = p_source)
        AND (p_status IS NULL OR o.status = p_status)
        AND (p_date_from IS NULL OR o.created_at >= p_date_from)
        AND (p_date_to IS NULL OR o.created_at < p_date_to)
        AND (
          v_search IS NULL
          OR o.id::TEXT ILIKE '%' || v_search || '%'
          OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || v_search || '%'
          OR COALESCE(p.phone, '') ILIKE '%' || v_search || '%'
        )

      UNION ALL

      -- guest_checkouts
      SELECT
        gc.id,
        'guest_checkouts'::TEXT AS source_table,
        COALESCE(gc.source, 'online') AS source,
        gc.status,
        COALESCE(gc.guest_name, '') AS customer_name,
        gc.guest_phone AS customer_phone,
        gc.total_amount,
        gc.final_amount,
        0 AS bonuses_spent,
        0 AS bonuses_awarded,
        gc.payment_method,
        gc.created_at
      FROM public.guest_checkouts gc
      WHERE
        (p_source IS NULL OR COALESCE(gc.source, 'online') = p_source)
        AND (p_status IS NULL OR gc.status = p_status)
        AND (p_date_from IS NULL OR gc.created_at >= p_date_from)
        AND (p_date_to IS NULL OR gc.created_at < p_date_to)
        AND (
          v_search IS NULL
          OR gc.id::TEXT ILIKE '%' || v_search || '%'
          OR COALESCE(gc.guest_name, '') ILIKE '%' || v_search || '%'
          OR COALESCE(gc.guest_phone, '') ILIKE '%' || v_search || '%'
        )

      ORDER BY created_at DESC
      LIMIT p_page_size
      OFFSET v_offset
    ) sub
  ) agg;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::JSONB),
    'total_count', v_total,
    'page', p_page,
    'page_size', p_page_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_list(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;


-- ============================================================================
-- 2. get_sale_receipt — детальная информация о заказе для чека
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_sale_receipt(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_result      JSONB;
  v_items       JSONB;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- Пробуем найти в orders
  SELECT jsonb_build_object(
    'id', o.id,
    'source_table', 'orders',
    'source', COALESCE(o.source, 'online'),
    'status', o.status,
    'customer_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
    'customer_phone', p.phone,
    'payment_method', o.payment_method,
    'total_amount', o.total_amount,
    'final_amount', o.final_amount,
    'bonuses_spent', COALESCE(o.bonuses_spent, 0),
    'bonuses_awarded', COALESCE(o.bonuses_awarded, 0),
    'created_at', o.created_at
  )
  INTO v_result
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.id = p_order_id;

  IF v_result IS NOT NULL THEN
    -- Получаем позиции из order_items
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_name', pr.name,
        'quantity', oi.quantity,
        'price_per_item', oi.price_per_item,
        'line_total', oi.quantity * oi.price_per_item
      )
      ORDER BY pr.name
    )
    INTO v_items
    FROM public.order_items oi
    JOIN public.products pr ON pr.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    RETURN v_result || jsonb_build_object('items', COALESCE(v_items, '[]'::JSONB));
  END IF;

  -- Пробуем найти в guest_checkouts
  SELECT jsonb_build_object(
    'id', gc.id,
    'source_table', 'guest_checkouts',
    'source', COALESCE(gc.source, 'online'),
    'status', gc.status,
    'customer_name', COALESCE(gc.guest_name, ''),
    'customer_phone', gc.guest_phone,
    'payment_method', gc.payment_method,
    'total_amount', gc.total_amount,
    'final_amount', gc.final_amount,
    'bonuses_spent', 0,
    'bonuses_awarded', 0,
    'created_at', gc.created_at
  )
  INTO v_result
  FROM public.guest_checkouts gc
  WHERE gc.id = p_order_id;

  IF v_result IS NOT NULL THEN
    -- Получаем позиции из guest_checkout_items
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_name', pr.name,
        'quantity', gci.quantity,
        'price_per_item', gci.price_per_item,
        'line_total', gci.quantity * gci.price_per_item
      )
      ORDER BY pr.name
    )
    INTO v_items
    FROM public.guest_checkout_items gci
    JOIN public.products pr ON pr.id = gci.product_id
    WHERE gci.checkout_id = p_order_id;

    RETURN v_result || jsonb_build_object('items', COALESCE(v_items, '[]'::JSONB));
  END IF;

  RAISE EXCEPTION 'Заказ не найден: %', p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sale_receipt(UUID) TO authenticated;

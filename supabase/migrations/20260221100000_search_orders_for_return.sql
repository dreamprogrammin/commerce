-- Поиск заказов для возврата по телефону, имени или UUID
-- Индекс на guest_phone для ускорения поиска

CREATE INDEX IF NOT EXISTS idx_guest_checkouts_guest_phone
  ON public.guest_checkouts(guest_phone);

-- RPC: search_orders_for_return
-- Ищет заказы по телефону, имени или UUID в обеих таблицах (orders + guest_checkouts)

CREATE OR REPLACE FUNCTION public.search_orders_for_return(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;
  v_results JSONB;
  v_search TEXT;
BEGIN
  -- 1. Проверка роли — только админ
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы';
  END IF;

  -- 2. Нормализуем поисковый запрос
  v_search := TRIM(p_query);

  IF v_search = '' THEN
    RETURN '[]'::JSONB;
  END IF;

  -- 3. Если запрос похож на UUID — ищем точное совпадение по id
  IF v_search ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$' THEN
    SELECT jsonb_agg(row_data)
    INTO v_results
    FROM (
      -- orders
      SELECT jsonb_build_object(
        'id', o.id,
        'customer_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
        'customer_phone', p.phone,
        'source_table', 'orders',
        'source', COALESCE(o.source, 'online'),
        'status', o.status,
        'final_amount', o.final_amount,
        'created_at', o.created_at
      ) AS row_data
      FROM public.orders o
      LEFT JOIN public.profiles p ON p.id = o.user_id
      WHERE o.id = v_search::UUID

      UNION ALL

      -- guest_checkouts
      SELECT jsonb_build_object(
        'id', gc.id,
        'customer_name', COALESCE(gc.guest_name, ''),
        'customer_phone', gc.guest_phone,
        'source_table', 'guest_checkouts',
        'source', COALESCE(gc.source, 'online'),
        'status', gc.status,
        'final_amount', gc.final_amount,
        'created_at', gc.created_at
      ) AS row_data
      FROM public.guest_checkouts gc
      WHERE gc.id = v_search::UUID
    ) sub;

    RETURN COALESCE(v_results, '[]'::JSONB);
  END IF;

  -- 4. Поиск по телефону или имени (ILIKE)
  SELECT jsonb_agg(row_data ORDER BY created_at DESC)
  INTO v_results
  FROM (
    (
      -- orders: join profiles для поиска по телефону/имени
      SELECT
        jsonb_build_object(
          'id', o.id,
          'customer_name', COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, ''),
          'customer_phone', p.phone,
          'source_table', 'orders',
          'source', COALESCE(o.source, 'online'),
          'status', o.status,
          'final_amount', o.final_amount,
          'created_at', o.created_at
        ) AS row_data,
        o.created_at
      FROM public.orders o
      JOIN public.profiles p ON p.id = o.user_id
      WHERE
        p.phone ILIKE '%' || v_search || '%'
        OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || v_search || '%'
    )

    UNION ALL

    (
      -- guest_checkouts: прямой поиск по guest_phone/guest_name
      SELECT
        jsonb_build_object(
          'id', gc.id,
          'customer_name', COALESCE(gc.guest_name, ''),
          'customer_phone', gc.guest_phone,
          'source_table', 'guest_checkouts',
          'source', COALESCE(gc.source, 'online'),
          'status', gc.status,
          'final_amount', gc.final_amount,
          'created_at', gc.created_at
        ) AS row_data,
        gc.created_at
      FROM public.guest_checkouts gc
      WHERE
        gc.guest_phone ILIKE '%' || v_search || '%'
        OR gc.guest_name ILIKE '%' || v_search || '%'
    )

    ORDER BY created_at DESC
    LIMIT p_limit
  ) sub;

  RETURN COALESCE(v_results, '[]'::JSONB);
END;
$$;

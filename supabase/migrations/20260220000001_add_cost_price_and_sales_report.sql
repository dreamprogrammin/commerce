-- ============================================================================
-- МИГРАЦИЯ: Себестоимость товаров + Отчёт по продажам
-- ============================================================================

-- 1. Добавляем закупочную цену (себестоимость) к товарам
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0
  CHECK (cost_price >= 0);

-- 2. Функция отчёта по продажам
-- Возвращает агрегированные данные по заказам за период
-- Налог: 4% от оборота (ИПН, СНР упрощённая декларация, 2026)
-- Комиссия эквайринга: p_acquiring_rate % от суммы онлайн-оплат картой

CREATE OR REPLACE FUNCTION public.get_sales_report(
  p_from    TIMESTAMPTZ,
  p_to      TIMESTAMPTZ,
  p_acquiring_rate NUMERIC DEFAULT 1.5  -- % комиссии эквайринга (по умолчанию 1.5%)
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_role TEXT;

  -- Заказы авторизованных пользователей
  v_user_count          INTEGER := 0;
  v_user_turnover       NUMERIC := 0;
  v_user_cost           NUMERIC := 0;
  v_user_bonuses_spent  NUMERIC := 0;
  v_user_card_sum       NUMERIC := 0;
  v_user_online_count   INTEGER := 0;
  v_user_offline_count  INTEGER := 0;

  -- Гостевые заказы
  v_guest_count         INTEGER := 0;
  v_guest_turnover      NUMERIC := 0;
  v_guest_cost          NUMERIC := 0;
  v_guest_card_sum      NUMERIC := 0;
  v_guest_online_count  INTEGER := 0;
  v_guest_offline_count INTEGER := 0;

  -- Итоги
  v_total_count     INTEGER;
  v_turnover        NUMERIC;
  v_cost            NUMERIC;
  v_gross_profit    NUMERIC;
  v_tax             NUMERIC;
  v_commission      NUMERIC;
  v_net_profit      NUMERIC;
  v_card_sum        NUMERIC;
BEGIN
  -- Проверяем права
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён';
  END IF;

  -- Пользовательские заказы (не отменённые)
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(o.final_amount), 0),
    COALESCE(SUM(o.bonuses_spent), 0),
    COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.final_amount ELSE 0 END), 0),
    COUNT(CASE WHEN o.source = 'online' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN o.source = 'offline' THEN 1 END)::INTEGER
  INTO
    v_user_count, v_user_turnover, v_user_bonuses_spent,
    v_user_card_sum, v_user_online_count, v_user_offline_count
  FROM public.orders o
  WHERE
    o.created_at >= p_from
    AND o.created_at < p_to
    AND o.status NOT IN ('cancelled');

  -- Себестоимость товаров из пользовательских заказов
  SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0)
  INTO v_user_cost
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  WHERE
    o.created_at >= p_from
    AND o.created_at < p_to
    AND o.status NOT IN ('cancelled');

  -- Гостевые заказы (не отменённые)
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(gc.final_amount), 0),
    COALESCE(SUM(CASE WHEN gc.payment_method = 'card' THEN gc.final_amount ELSE 0 END), 0),
    COUNT(CASE WHEN gc.source = 'online' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN gc.source = 'offline' THEN 1 END)::INTEGER
  INTO
    v_guest_count, v_guest_turnover, v_guest_card_sum,
    v_guest_online_count, v_guest_offline_count
  FROM public.guest_checkouts gc
  WHERE
    gc.created_at >= p_from
    AND gc.created_at < p_to
    AND gc.status NOT IN ('cancelled');

  -- Себестоимость из гостевых заказов
  SELECT COALESCE(SUM(gci.quantity * p.cost_price), 0)
  INTO v_guest_cost
  FROM public.guest_checkout_items gci
  JOIN public.guest_checkouts gc ON gc.id = gci.checkout_id
  JOIN public.products p ON p.id = gci.product_id
  WHERE
    gc.created_at >= p_from
    AND gc.created_at < p_to
    AND gc.status NOT IN ('cancelled');

  -- Сводные расчёты
  v_total_count  := v_user_count + v_guest_count;
  v_turnover     := v_user_turnover + v_guest_turnover;
  v_cost         := v_user_cost + v_guest_cost;
  v_card_sum     := v_user_card_sum + v_guest_card_sum;
  v_gross_profit := v_turnover - v_cost;
  v_tax          := ROUND(v_turnover * 0.04, 2);              -- ИПН 4% (упрощённая декларация 2026)
  v_commission   := ROUND(v_card_sum * p_acquiring_rate / 100, 2);
  v_net_profit   := v_gross_profit - v_tax - v_commission;

  RETURN jsonb_build_object(
    -- Общие метрики
    'total_orders',       v_total_count,
    'turnover',           v_turnover,
    'cost_of_goods',      v_cost,
    'gross_profit',       v_gross_profit,
    'tax_amount',         v_tax,
    'tax_rate',           0.04,
    'card_sum',           v_card_sum,
    'commission_amount',  v_commission,
    'acquiring_rate',     p_acquiring_rate,
    'net_profit',         v_net_profit,
    'bonuses_spent',      v_user_bonuses_spent,

    -- Разбивка: онлайн / офлайн
    'online_count',       v_user_online_count + v_guest_online_count,
    'offline_count',      v_user_offline_count + v_guest_offline_count,
    'user_orders_count',  v_user_count,
    'guest_orders_count', v_guest_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_sales_report(TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC) TO authenticated;

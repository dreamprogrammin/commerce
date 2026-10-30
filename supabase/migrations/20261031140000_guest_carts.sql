-- ============================================================================
-- Гостевые корзины — на сервере, без имени.
--
-- Владелец 31.10.2026: видеть, что кладут в корзину и гости, а не только
-- вошедшие (за 120 дней 18 заказов из аккаунтов и 16 гостевых оформлений —
-- половина спроса в «К закупке» была не видна).
--
-- Браузер гостя держит случайный номер корзины (uuid, в своём хранилище) и
-- присылает сюда только номера товаров и количество. Цены и сумму считает
-- база по каталогу — присланному не верим. Имени, телефона, адреса здесь нет.
-- Читает таблицу только service_role (маршруты админки); гость может лишь
-- записать свою корзину по её номеру. Вошёл — запись удаляется, корзина
-- переезжает в server_carts с именем (stores/publicStore/cartStore.ts).
-- Старше 60 дней — удаляются кроном.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.guest_carts') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'save_guest_cart')
     OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Guest Carts Cleanup') THEN
    RAISE EXCEPTION 'гостевые корзины уже заведены — миграция не для этой базы';
  END IF;
END $$;

CREATE TABLE public.guest_carts (
  id uuid PRIMARY KEY,
  items jsonb NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  item_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guest_carts_updated_at_idx ON public.guest_carts (updated_at DESC);
ALTER TABLE public.guest_carts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_carts FROM anon, authenticated;
GRANT ALL ON public.guest_carts TO service_role;

CREATE FUNCTION public.save_guest_cart(p_cart_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_items jsonb;
  v_total numeric;
  v_count integer;
BEGIN
  IF p_cart_id IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Неверная корзина';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Слишком много позиций';
  END IF;

  -- Не чаще раза в секунду на корзину: сайт шлёт с задержкой 1,5 с. Пустая
  -- (оформил, очистил, вошёл) проходит всегда — иначе запись повисла бы
  IF jsonb_array_length(p_items) > 0
     AND EXISTS (SELECT 1 FROM public.guest_carts WHERE id = p_cart_id AND updated_at > now() - interval '1 second') THEN
    RETURN;
  END IF;

  -- Только действующие товары; количество 1..99; повторы складываются
  SELECT jsonb_agg(jsonb_build_object('product_id', r.pid, 'quantity', r.qty) ORDER BY r.pid),
         sum(r.qty * coalesce(p.final_price, p.price)),
         sum(r.qty)
  INTO v_items, v_total, v_count
  FROM (
    SELECT (e ->> 'product_id')::uuid AS pid, least(sum((e ->> 'quantity')::integer), 99)::integer AS qty
    FROM jsonb_array_elements(p_items) e
    WHERE jsonb_typeof(e) = 'object'
      AND (e ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND (e ->> 'quantity') ~ '^[0-9]{1,4}$'
      AND (e ->> 'quantity')::integer > 0
    GROUP BY 1
  ) r
  JOIN public.products p ON p.id = r.pid AND p.is_active;

  IF v_items IS NULL THEN
    DELETE FROM public.guest_carts WHERE id = p_cart_id;
    RETURN;
  END IF;

  INSERT INTO public.guest_carts (id, items, total_amount, item_count)
  VALUES (p_cart_id, v_items, v_total, v_count)
  ON CONFLICT (id) DO UPDATE
    SET items = EXCLUDED.items, total_amount = EXCLUDED.total_amount,
        item_count = EXCLUDED.item_count, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_guest_cart(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_guest_cart(uuid, jsonb) TO anon, authenticated, service_role;

SELECT cron.schedule(
  'Guest Carts Cleanup',
  '20 3 * * *',
  $cron$DELETE FROM public.guest_carts WHERE updated_at < now() - interval '60 days'$cron$
);

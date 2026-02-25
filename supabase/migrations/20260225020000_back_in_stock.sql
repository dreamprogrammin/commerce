-- ============================================================================
-- Back in Stock: подписка на поступление + авто-уведомление
-- ============================================================================

-- 1. Таблица подписок на поступление
CREATE TABLE public.stock_alerts (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX idx_stock_alerts_product_id ON public.stock_alerts (product_id);

-- 2. RLS
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own stock alerts"
  ON public.stock_alerts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own stock alerts"
  ON public.stock_alerts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own stock alerts"
  ON public.stock_alerts FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 3. Toggle функция
CREATE OR REPLACE FUNCTION public.toggle_stock_alert(p_product_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_exists BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Необходима авторизация');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.stock_alerts
    WHERE user_id = v_user_id AND product_id = p_product_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.stock_alerts
    WHERE user_id = v_user_id AND product_id = p_product_id;
    RETURN jsonb_build_object('subscribed', false);
  ELSE
    INSERT INTO public.stock_alerts (user_id, product_id)
    VALUES (v_user_id, p_product_id)
    ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('subscribed', true);
  END IF;
END;
$$;

-- 4. Триггер: уведомление при поступлении товара
CREATE OR REPLACE FUNCTION public.notify_back_in_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_alert RECORD;
BEGIN
  -- Товар вернулся в наличие (было 0, стало > 0)
  IF OLD.stock_quantity = 0 AND NEW.stock_quantity > 0 THEN
    FOR v_alert IN
      SELECT sa.user_id
      FROM public.stock_alerts sa
      WHERE sa.product_id = NEW.id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
      VALUES (
        v_alert.user_id,
        'back_in_stock',
        '🎉 Товар снова в наличии!',
        format('%s снова доступен для заказа!', NEW.name),
        '/catalog/products/' || NEW.slug,
        false
      );
    END LOOP;

    -- Очищаем выполненные подписки
    DELETE FROM public.stock_alerts WHERE product_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_back_in_stock
  AFTER UPDATE OF stock_quantity
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_back_in_stock();

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

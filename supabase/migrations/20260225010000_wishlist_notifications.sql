-- ============================================================================
-- Wishlist-уведомления: снижение цены + мало на складе
-- ============================================================================
-- Триггер на products: при изменении цены или stock_quantity
-- уведомляем пользователей, у которых этот товар в wishlist
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_wishlist_on_product_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wishlist_user RECORD;
  v_old_price NUMERIC;
  v_new_price NUMERIC;
BEGIN
  -- Вычисляем final_price (с учётом скидки)
  v_old_price := CASE
    WHEN COALESCE(OLD.discount_percentage, 0) > 0
    THEN ROUND(OLD.price * (100 - OLD.discount_percentage) / 100)
    ELSE OLD.price
  END;

  v_new_price := CASE
    WHEN COALESCE(NEW.discount_percentage, 0) > 0
    THEN ROUND(NEW.price * (100 - NEW.discount_percentage) / 100)
    ELSE NEW.price
  END;

  -- Снижение цены
  IF v_new_price < v_old_price THEN
    FOR v_wishlist_user IN
      SELECT w.user_id
      FROM public.wishlist w
      WHERE w.product_id = NEW.id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
      VALUES (
        v_wishlist_user.user_id,
        'price_drop',
        '📉 Цена снижена!',
        format('%s теперь %s ₸ (было %s ₸)', NEW.name, v_new_price::INTEGER, v_old_price::INTEGER),
        '/catalog/products/' || NEW.slug,
        false
      );
    END LOOP;
  END IF;

  -- Мало на складе (стало <= 3, было > 3, ещё > 0)
  IF OLD.stock_quantity > 3 AND NEW.stock_quantity <= 3 AND NEW.stock_quantity > 0 THEN
    FOR v_wishlist_user IN
      SELECT w.user_id
      FROM public.wishlist w
      WHERE w.product_id = NEW.id
    LOOP
      INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
      VALUES (
        v_wishlist_user.user_id,
        'low_stock',
        '⚠️ Товар заканчивается!',
        format('%s — осталось %s шт. Успейте купить!', NEW.name, NEW.stock_quantity),
        '/catalog/products/' || NEW.slug,
        false
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_wishlist_product_change
  AFTER UPDATE OF price, discount_percentage, stock_quantity
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_wishlist_on_product_change();

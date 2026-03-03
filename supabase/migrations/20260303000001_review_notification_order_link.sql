-- =====================================================================================
-- Fix: review_request уведомление ведёт на страницу заказа, а не на страницу товара
--
-- Проблема: ссылка /catalog/products/{slug}#reviews требовала от пользователя
-- самостоятельно найти кнопку отзыва. Конверсия ~ 0%.
--
-- Решение: ссылка /profile/order/{order_id} ведёт прямо на страницу заказа,
-- где кнопка "Оставить отзыв" видна напротив каждого товара.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.request_review_on_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Только при смене статуса на 'delivered'
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  -- Только для авторизованных заказов (не гостевые)
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Уведомление ведёт прямо на страницу заказа, где есть кнопка "Оставить отзыв"
  INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
  VALUES (
    NEW.user_id,
    'review_request',
    '⭐ Оставьте отзыв и получите 500 бонусов!',
    'Поделитесь впечатлениями о покупке — это поможет другим покупателям.',
    '/profile/order/' || NEW.id,
    false
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_review_on_delivery error: %', SQLERRM;
  RETURN NEW;
END;
$$;

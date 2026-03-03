-- =====================================================================================
-- МИГРАЦИЯ: Фикс триггера award_bonus_for_review
-- Проблема: balance_after, pending_balance_after не заполнялись, status оставался 'completed'
-- Решение: Заполняем актуальные балансы и ставим status = 'pending'
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.award_bonus_for_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_profile RECORD;
  v_new_pending INTEGER;
BEGIN
  -- Только при публикации (is_published: false → true)
  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.is_published IS NULL) THEN
    -- Проверяем, не давали ли уже бонус за этот отзыв
    IF EXISTS (
      SELECT 1 FROM public.bonus_transactions
      WHERE user_id = NEW.user_id
        AND transaction_type = 'review'
        AND description LIKE '%' || NEW.id::text || '%'
    ) THEN
      RETURN NEW;
    END IF;

    -- Получаем текущие балансы пользователя
    SELECT active_bonus_balance, pending_bonus_balance
    INTO v_user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;

    v_new_pending := COALESCE(v_user_profile.pending_bonus_balance, 0) + 500;

    -- Начисляем 500 pending бонусов
    INSERT INTO public.bonus_transactions (
      user_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status, created_at
    ) VALUES (
      NEW.user_id, 'review', 500,
      COALESCE(v_user_profile.active_bonus_balance, 0),
      v_new_pending,
      'Бонусы за отзыв (review: ' || NEW.id || ')',
      'pending',
      now()
    );

    -- Увеличиваем pending_bonus_balance
    UPDATE public.profiles
    SET pending_bonus_balance = v_new_pending
    WHERE id = NEW.user_id;

    -- Уведомление о начислении
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      NEW.user_id,
      'bonus_earned',
      'Вам начислено 500 бонусов!',
      'Спасибо за отзыв! Бонусы станут доступны через 14 дней.',
      '/profile/bonuses',
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'award_bonus_for_review error: %', SQLERRM;
  RETURN NEW;
END;
$$;

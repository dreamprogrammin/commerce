-- Review бонусы начисляются сразу в active при публикации (без ожидания 14 дней)

CREATE OR REPLACE FUNCTION public.award_bonus_for_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_profile RECORD;
  v_new_active INTEGER;
BEGIN
  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.is_published IS NULL) THEN
    IF EXISTS (
      SELECT 1 FROM public.bonus_transactions
      WHERE user_id = NEW.user_id
        AND transaction_type = 'review'
        AND description LIKE '%' || NEW.id::text || '%'
    ) THEN
      RETURN NEW;
    END IF;

    SELECT active_bonus_balance, pending_bonus_balance
    INTO v_user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;

    v_new_active := COALESCE(v_user_profile.active_bonus_balance, 0) + 500;

    INSERT INTO public.bonus_transactions (
      user_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status, activation_date, created_at
    ) VALUES (
      NEW.user_id, 'review', 500,
      v_new_active,
      COALESCE(v_user_profile.pending_bonus_balance, 0),
      'Бонусы за отзыв (review: ' || NEW.id || ')',
      'completed',
      now(),
      now()
    );

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active
    WHERE id = NEW.user_id;

    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      NEW.user_id, 'bonus_earned',
      'Вам начислено 500 бонусов!',
      'Спасибо за отзыв! Бонусы уже доступны для использования.',
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

NOTIFY pgrst, 'reload schema';

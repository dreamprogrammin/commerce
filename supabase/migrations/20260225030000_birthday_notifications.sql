-- ============================================================================
-- День рождения ребёнка: 1000 бонусов + уведомление за 7 дней
-- ============================================================================

-- 1. Добавляем 'birthday' в допустимые типы bonus_transactions
ALTER TABLE public.bonus_transactions
  DROP CONSTRAINT IF EXISTS bonus_transactions_transaction_type_check;

ALTER TABLE public.bonus_transactions
  ADD CONSTRAINT bonus_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earned', 'spent', 'welcome', 'refund_spent', 'refund_earned', 'activation', 'review', 'birthday'
  ));

-- 2. Функция проверки дней рождения
CREATE OR REPLACE FUNCTION public.check_birthday_notifications()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child RECORD;
  v_age_years INTEGER;
  v_product_names TEXT[];
  v_product_rec RECORD;
  v_product_link TEXT;
  v_body TEXT;
  v_new_active_balance INTEGER;
  v_processed INTEGER := 0;
BEGIN
  FOR v_child IN
    SELECT
      c.id AS child_id,
      c.user_id,
      c.name AS child_name,
      c.gender AS child_gender,
      c.birth_date,
      EXTRACT(YEAR FROM (current_date + interval '7 days')) - EXTRACT(YEAR FROM c.birth_date) AS upcoming_age
    FROM public.children c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE TO_CHAR(c.birth_date, 'MM-DD') = TO_CHAR(current_date + interval '7 days', 'MM-DD')
      -- Дедупликация: нет ли birthday_reminder для этого user_id в текущем году
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = c.user_id
          AND n.type = 'birthday_reminder'
          AND EXTRACT(YEAR FROM n.created_at) = EXTRACT(YEAR FROM current_date)
          AND n.body LIKE '%' || c.name || '%'
      )
  LOOP
    v_age_years := v_child.upcoming_age::INTEGER;

    -- Подбираем 3 товара по возрасту/полу
    v_product_names := ARRAY[]::TEXT[];
    v_product_link := NULL;

    FOR v_product_rec IN
      SELECT p.name, p.slug
      FROM public.products p
      WHERE p.is_active = true
        AND p.stock_quantity > 0
        AND (p.min_age_years IS NULL OR p.min_age_years <= v_age_years)
        AND (p.max_age_years IS NULL OR p.max_age_years >= v_age_years)
        AND (p.gender IS NULL OR p.gender = 'unisex' OR p.gender = v_child.child_gender)
      ORDER BY p.sales_count DESC NULLS LAST
      LIMIT 3
    LOOP
      v_product_names := array_append(v_product_names, v_product_rec.name);
      IF v_product_link IS NULL THEN
        v_product_link := '/catalog/products/' || v_product_rec.slug;
      END IF;
    END LOOP;

    -- Начисляем 1000 бонусов
    UPDATE public.profiles
    SET active_bonus_balance = active_bonus_balance + 1000
    WHERE id = v_child.user_id
    RETURNING active_bonus_balance INTO v_new_active_balance;

    INSERT INTO public.bonus_transactions (
      user_id, amount, transaction_type, status, balance_after, description
    ) VALUES (
      v_child.user_id,
      1000,
      'birthday',
      'completed',
      v_new_active_balance,
      format('Бонусы ко дню рождения %s (%s лет)', v_child.child_name, v_age_years)
    );

    -- Формируем уведомление
    v_body := format('Через 7 дней %s исполнится %s', v_child.child_name, v_age_years)
      || CASE
           WHEN v_age_years % 10 = 1 AND v_age_years <> 11 THEN ' год!'
           WHEN v_age_years % 10 BETWEEN 2 AND 4 AND NOT (v_age_years BETWEEN 12 AND 14) THEN ' года!'
           ELSE ' лет!'
         END;

    IF array_length(v_product_names, 1) > 0 THEN
      v_body := v_body || E'\nИдеи подарков: ' || array_to_string(v_product_names, ', ') || '.';
    END IF;

    v_body := v_body || E'\n🎁 Вам начислено 1000 бонусов!';

    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      v_child.user_id,
      'birthday_reminder',
      '🎂 Скоро день рождения!',
      v_body,
      COALESCE(v_product_link, '/catalog'),
      false
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN format('Обработано: %s уведомлений о днях рождения', v_processed);
END;
$$;

-- 3. Cron: ежедневно в 09:00 UTC
SELECT cron.schedule(
  'birthday-notifications',
  '0 9 * * *',
  $$SELECT public.check_birthday_notifications()$$
);

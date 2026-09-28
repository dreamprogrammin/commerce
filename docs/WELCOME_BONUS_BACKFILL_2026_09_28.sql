-- Приветственный бонус задним числом — покупателям, которым его не дали.
--
-- ЗАЧЕМ. До миграции 20260928120000 приветственный бонус не получал никто:
-- подтверждение заказа выходило на «уже обработан» раньше, чем доходило до
-- него (разбор — в самой миграции и в docs/HANDOFF.md, 28 сентября). На бою
-- 28 сентября таких покупателей шесть: у каждого есть неотменённый заказ, а
-- has_received_welcome_bonus = false.
--
-- ЧТО ДЕЛАЕТ. Каждому покупателю с хотя бы одним неотменённым заказом и без
-- приветственного бонуса: +1000 к активному балансу (как в новой
-- process_confirmed_order и как обещает сайт), отметка
-- has_received_welcome_bonus и запись 'welcome' в истории бонусов — к его
-- первому неотменённому заказу, с пометкой «задним числом». Больше ничего:
-- заказы, даты активации и sales_count не трогаются.
--
-- ЗАЩИТА. Покупателей должно быть от 1 до 20 — на 28 сентября их 6; иначе
-- ошибка, и не меняется ничего: массового начисления по ошибке быть не должно.
-- Повторный запуск — «Уже сделано»: у всех уже стоит отметка.
--
-- ЗАПУСКАТЬ — ТОЛЬКО ЕСЛИ РЕШЕНО ДАВАТЬ ЗАДНИМ ЧИСЛОМ. От миграции не зависит:
-- можно до неё, после или не запускать вовсе.
--
-- КАК ЗАПУСТИТЬ. SQL-редактор Supabase: вставить файл целиком, Run.

DO $$
DECLARE
  v_bonus constant integer := 1000;
  v_count integer;
  v_row record;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.profiles p
   WHERE NOT p.has_received_welcome_bonus
     AND EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status <> 'cancelled');

  IF v_count = 0 THEN
    RAISE NOTICE 'Уже сделано: всем покупателям с заказами приветственный бонус начислен';
    RETURN;
  END IF;
  IF v_count > 20 THEN
    RAISE EXCEPTION 'Покупателей без приветственного бонуса % — больше, чем ожидалось (6 на 28 сентября); сначала разобраться', v_count;
  END IF;

  FOR v_row IN
    SELECT p.id AS profile_id, p.active_bonus_balance, p.pending_bonus_balance,
           (SELECT o.id FROM public.orders o
             WHERE o.user_id = p.id AND o.status <> 'cancelled'
             ORDER BY o.created_at LIMIT 1) AS first_order_id
      FROM public.profiles p
     WHERE NOT p.has_received_welcome_bonus
       AND EXISTS (SELECT 1 FROM public.orders o WHERE o.user_id = p.id AND o.status <> 'cancelled')
     FOR UPDATE OF p
  LOOP
    UPDATE public.profiles
       SET active_bonus_balance = active_bonus_balance + v_bonus,
           has_received_welcome_bonus = TRUE
     WHERE id = v_row.profile_id;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after, description, status
    ) VALUES (
      v_row.profile_id, v_row.first_order_id, 'welcome', v_bonus,
      v_row.active_bonus_balance + v_bonus,
      v_row.pending_bonus_balance,
      'Приветственный бонус за первый заказ (начислен задним числом)',
      'completed'
    );
  END LOOP;

  RAISE NOTICE 'Готово: приветственный бонус % начислен покупателям: %', v_bonus, v_count;
END $$;

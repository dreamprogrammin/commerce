-- Функции заказов, бонусов и промокодов — не для вызова без входа.
--
-- ЧТО БЫЛО (боевая база, дамп 24 сентября 2026; миграций на эти функции с тех
-- пор нет). 13 функций SECURITY DEFINER исполнялись ролями anon и PUBLIC —
-- любым, у кого есть публичный ключ из разметки сайта, — и писали в базу, не
-- проверяя, кто зовёт. Проверено запуском на стенде со схемой прода: без входа
-- можно подтвердить чужой заказ (confirm_and_process_order) и отменить его с
-- пометкой «отменил админ» (cancel_order). Нужен только id заказа, а он виден в
-- адресе /order/success/<id>.
--
-- КТО ЗОВЁТ ИХ ЗАКОННО (репозиторий и дамп прода):
--   • cancel_order — сайт (useUserOrders.ts: вошедший покупатель отменяет
--     свой заказ, p_cancelled_by = 'client') и эдж-функция cancel-order
--     (service_role);
--   • process_confirmed_order, process_confirmed_guest_checkout — триггеры
--     trigger_auto_confirm_order и trigger_auto_confirm_guest_checkout, их
--     функции SECURITY DEFINER и исполняются от владельца;
--   • redeem_promo_code — create_guest_checkout и create_user_order, тоже
--     SECURITY DEFINER;
--   • activate_pending_bonuses, check_abandoned_carts,
--     check_birthday_notifications, check_expiring_bonuses, expire_bonuses —
--     задания pg_cron от имени postgres, владельца функций;
--   • confirm_and_process_order, activate_pending_order_bonuses,
--     recalculate_pending_balances, cleanup_expired_guest_checkouts — в
--     репозитории их не зовёт никто.
-- Ни одному из этих путей роли anon и authenticated не нужны.
--
-- ЧТО МЕНЯЕТСЯ:
--   • у двенадцати — REVOKE EXECUTE FROM PUBLIC, anon, authenticated;
--     service_role и владелец остаются;
--   • cancel_order: REVOKE FROM PUBLIC, anon (authenticated нужна сайту) и
--     проверка в начале: через API без прав администратора — только
--     p_cancelled_by = 'client', только таблица orders, только свой заказ и
--     только в статусах new и confirmed — там же, где сайт показывает кнопку
--     «Отменить» (canCancelOrder в composables/orders/useUserOrders.ts,
--     менять вместе). Администратор, service_role и вызовы без токена
--     (SQL-редактор, миграции) — как прежде;
--   • create_guest_checkout не трогается: это оформление гостевого заказа.
--
-- Тело cancel_order снято с прода (дамп 24 сентября) и совпадает с последней
-- миграцией на неё в репозитории (20260515165440): md5 сверяется ниже.
-- Добавлен только блок проверки с комментарием, больше ничего.
--
-- ЛОВУШКА НА БУДУЩЕЕ. Пересоздание любой из этих функций через DROP + CREATE
-- вернёт EXECUTE для anon, authenticated и PUBLIC — так Supabase выдаёт права
-- на новые функции (так уже было: 20260515165440 пересоздала cancel_order).
-- Проверка в конце этой миграции — готовый способ убедиться, что права не
-- вернулись.

-- ── Проверка состояния ─────────────────────────────────────────────────────
DO $check$
DECLARE
  v_fn text;
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
           WHERE oid = to_regprocedure('public.cancel_order(uuid,text,text)')))
     IS DISTINCT FROM '2fe79f362def3ca2a08aa002c931b0b2' THEN
    RAISE EXCEPTION 'public.cancel_order(uuid,text,text) на базе не та, что снята с прода 24.09.2026 — тело надо снять заново';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.activate_pending_bonuses()',
    'public.activate_pending_order_bonuses()',
    'public.check_abandoned_carts()',
    'public.check_birthday_notifications()',
    'public.check_expiring_bonuses()',
    'public.cleanup_expired_guest_checkouts()',
    'public.confirm_and_process_order(uuid)',
    'public.expire_bonuses()',
    'public.process_confirmed_guest_checkout(uuid)',
    'public.process_confirmed_order(uuid)',
    'public.recalculate_pending_balances()',
    'public.redeem_promo_code(text,numeric,uuid)',
    'public.create_guest_checkout(jsonb,jsonb,text,jsonb,text,text,numeric,text,date,text,uuid)',
    'auth.role()',
    'auth.uid()'
  ] LOOP
    IF to_regprocedure(v_fn) IS NULL THEN
      RAISE EXCEPTION 'Нет функции % — база не та, под которую готовилась миграция', v_fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE oid = to_regprocedure('public.is_admin()')
       AND prosrc LIKE '%auth.uid()%' AND prosrc LIKE '%role = ''admin''%'
  ) THEN
    RAISE EXCEPTION 'public.is_admin() не та: проверка администратора опирается на profiles.role = ''admin'' по auth.uid()';
  END IF;
END
$check$;


-- ── Права: только сервер ──────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.activate_pending_bonuses(),
  public.activate_pending_order_bonuses(),
  public.check_abandoned_carts(),
  public.check_birthday_notifications(),
  public.check_expiring_bonuses(),
  public.cleanup_expired_guest_checkouts(),
  public.confirm_and_process_order(uuid),
  public.expire_bonuses(),
  public.process_confirmed_guest_checkout(uuid),
  public.process_confirmed_order(uuid),
  public.recalculate_pending_balances(),
  public.redeem_promo_code(text, numeric, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_order(uuid, text, text) FROM PUBLIC, anon;


-- ── cancel_order ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION "public"."cancel_order"("p_order_id" "uuid", "p_table_name" "text" DEFAULT 'orders'::"text", "p_cancelled_by" "text" DEFAULT 'admin'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_status           TEXT;
  v_user_id          UUID    := NULL;
  v_bonuses_spent    NUMERIC := 0;
  v_bonuses_awarded  INTEGER := 0;
  v_item_record      RECORD;
  v_result           TEXT;
  v_new_active_bal   INTEGER;
  v_new_pending_bal  INTEGER;
BEGIN
  -- Через API без прав администратора — только покупатель, свой заказ и те
  -- статусы, где сайт показывает «Отменить»: миграция 20260927120000.
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') AND NOT public.is_admin() THEN
    IF p_table_name IS DISTINCT FROM 'orders'
       OR p_cancelled_by IS DISTINCT FROM 'client'
       OR NOT EXISTS (
            SELECT 1
              FROM public.orders o
             WHERE o.id = p_order_id
               AND o.user_id = auth.uid()
               AND o.status IN ('new', 'confirmed')) THEN
      RAISE EXCEPTION 'Отменить на сайте можно только свой заказ, пока он новый или подтверждён'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_cancelled_by NOT IN ('client', 'admin', 'system') THEN
    RAISE EXCEPTION 'Неверное значение cancelled_by: %', p_cancelled_by;
  END IF;

  IF p_table_name NOT IN ('orders', 'guest_checkouts') THEN
    RAISE EXCEPTION 'Неверная таблица: %', p_table_name;
  END IF;

  IF p_table_name = 'orders' THEN
    SELECT status, user_id, COALESCE(bonuses_spent, 0), COALESCE(bonuses_awarded, 0)
    INTO v_status, v_user_id, v_bonuses_spent, v_bonuses_awarded
    FROM public.orders WHERE id = p_order_id;
  ELSE
    SELECT status INTO v_status
    FROM public.guest_checkouts WHERE id = p_order_id;
  END IF;

  IF v_status IS NULL THEN
    RETURN 'Ошибка: Заказ не найден в таблице ' || p_table_name;
  END IF;
  IF v_status = 'cancelled' THEN
    RETURN 'Ошибка: Заказ уже отменён';
  END IF;
  -- ✅ ИЗМЕНЕНО: добавлен shipped в список разрешённых статусов
  IF v_status NOT IN ('new', 'pending', 'confirmed', 'processing', 'shipped') THEN
    RETURN 'Ошибка: Заказ в статусе "' || v_status || '" нельзя отменить';
  END IF;

  -- Возвращаем товары на склад
  IF p_table_name = 'orders' THEN
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;
    END LOOP;
  ELSE
    FOR v_item_record IN
      SELECT product_id, quantity FROM public.guest_checkout_items WHERE checkout_id = p_order_id
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item_record.quantity,
          sales_count    = GREATEST(sales_count - v_item_record.quantity, 0)
      WHERE id = v_item_record.product_id;
    END LOOP;
  END IF;

  IF p_table_name = 'orders' AND v_user_id IS NOT NULL THEN

    -- A) Возвращаем ПОТРАЧЕННЫЕ активные бонусы
    IF v_bonuses_spent > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + v_bonuses_spent
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_bal, v_new_pending_bal;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id, p_order_id, v_bonuses_spent, 'refund_spent', 'completed',
        v_new_active_bal, v_new_pending_bal,
        'Возврат потраченных бонусов при отмене заказа'
      );
    END IF;

    -- B) Вычитаем НАЧИСЛЕННЫЕ бонусы из pending
    IF v_bonuses_awarded > 0 THEN
      UPDATE public.profiles
      SET pending_bonus_balance = GREATEST(pending_bonus_balance - v_bonuses_awarded, 0)
      WHERE id = v_user_id
      RETURNING active_bonus_balance, pending_bonus_balance
      INTO v_new_active_bal, v_new_pending_bal;

      INSERT INTO public.bonus_transactions (
        user_id, order_id, amount, transaction_type, status,
        balance_after, pending_balance_after, description
      ) VALUES (
        v_user_id, p_order_id, -v_bonuses_awarded, 'rollback_earned', 'completed',
        v_new_active_bal, v_new_pending_bal,
        'Откат начисленных бонусов при отмене заказа'
      );
    END IF;
  END IF;

  -- Обновляем статус заказа
  IF p_table_name = 'orders' THEN
    UPDATE public.orders
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  ELSE
    UPDATE public.guest_checkouts
    SET status = 'cancelled', cancelled_by = p_cancelled_by
    WHERE id = p_order_id;
  END IF;

  v_result := 'Заказ ' || p_order_id || ' успешно отменён';
  IF v_bonuses_spent > 0 THEN
    v_result := v_result || '. Возвращено бонусов: ' || v_bonuses_spent;
  END IF;

  RETURN v_result;
END;
$$;


-- ── Проверка результата ───────────────────────────────────────────────────
-- Её же можно запускать отдельно после любой будущей правки этих функций.
DO $verify$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.activate_pending_bonuses()',
    'public.activate_pending_order_bonuses()',
    'public.check_abandoned_carts()',
    'public.check_birthday_notifications()',
    'public.check_expiring_bonuses()',
    'public.cleanup_expired_guest_checkouts()',
    'public.confirm_and_process_order(uuid)',
    'public.expire_bonuses()',
    'public.process_confirmed_guest_checkout(uuid)',
    'public.process_confirmed_order(uuid)',
    'public.recalculate_pending_balances()',
    'public.redeem_promo_code(text,numeric,uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% всё ещё исполняется ролью anon или authenticated', v_fn;
    END IF;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% потеряла права service_role', v_fn;
    END IF;
  END LOOP;

  IF has_function_privilege('anon', 'public.cancel_order(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cancel_order всё ещё исполняется анонимно';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.cancel_order(uuid,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.cancel_order(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'cancel_order потеряла права authenticated или service_role — сайт или эдж-функция не смогут отменять заказы';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.cancel_order(uuid,text,text)'))
     NOT LIKE '%o.user_id = auth.uid()%' THEN
    RAISE EXCEPTION 'В cancel_order не встала проверка владельца заказа';
  END IF;
  IF (SELECT count(*) FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname = 'cancel_order') <> 1 THEN
    RAISE EXCEPTION 'cancel_order больше одной версии — появилась перегрузка';
  END IF;

  -- Гостевое оформление обязано остаться открытым.
  IF NOT has_function_privilege('anon',
       'public.create_guest_checkout(jsonb,jsonb,text,jsonb,text,text,numeric,text,date,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'create_guest_checkout закрылась для гостей — оформление без входа сломано';
  END IF;
END
$verify$;

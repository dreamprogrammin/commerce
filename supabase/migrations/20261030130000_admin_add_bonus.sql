-- ============================================================================
-- Ручное начисление бонусов из админки.
--
-- Зачем (30 октября 2026). Владелец: «чтобы я мог отправить бонусы, если вдруг
-- они не были зачислены». Решение владельца: начисленное вручную доступно
-- СРАЗУ, без 14 дней ожидания.
--
-- Как устроено:
--   * зовёт только серверный маршрут админки (`/api/admin/users/<id>/bonus`)
--     ключом сервиса после `requireAdmin` — EXECUTE только у service_role;
--     кто начислил, передаётся параметром и сверяется с `profiles.role`;
--   * баланс и строка истории меняются в одной транзакции, профиль под
--     блокировкой — два одновременных начисления не потеряют друг друга;
--   * тип операции `manual` — уже разрешён ограничением
--     `bonus_transactions_transaction_type_check`; в `metadata` — кто начислил.
--     Сгорание (`expire_bonuses`) берёт только activation / welcome / review /
--     birthday — ручные бонусы не сгорают;
--   * покупателю — уведомление на сайте, тем же типом `bonus_earned`, что и
--     начисление за заказ.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'admin_add_bonus') THEN
    RAISE EXCEPTION 'admin_add_bonus уже существует — миграция применялась?';
  END IF;
  IF position('''manual''' IN (
       SELECT pg_get_constraintdef(oid) FROM pg_constraint
       WHERE conname = 'bonus_transactions_transaction_type_check')) = 0 THEN
    RAISE EXCEPTION 'тип manual не разрешён в bonus_transactions';
  END IF;
END $$;

-- ── 1. Функция ──────────────────────────────────────────────────────────────
CREATE FUNCTION public.admin_add_bonus(
  p_profile_id uuid,
  p_amount integer,
  p_reason text,
  p_admin_id uuid,
  p_order_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin RECORD;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_active integer;
  v_pending integer;
  v_tx_id uuid;
BEGIN
  SELECT id, role, first_name, last_name INTO v_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_admin.role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Начислять бонусы может только администратор';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Сумма бонусов — от 1 до 100 000';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Укажите причину начисления';
  END IF;

  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id AND user_id = p_profile_id
  ) THEN
    RAISE EXCEPTION 'Заказ не принадлежит этому покупателю';
  END IF;

  UPDATE public.profiles
  SET active_bonus_balance = active_bonus_balance + p_amount,
      updated_at = now()
  WHERE id = p_profile_id
  RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Покупатель не найден';
  END IF;

  INSERT INTO public.bonus_transactions (
    user_id, profile_id, order_id, transaction_type, amount,
    balance_after, pending_balance_after, description, status, metadata
  ) VALUES (
    p_profile_id, p_profile_id, p_order_id, 'manual', p_amount,
    v_active, v_pending, v_reason, 'completed',
    jsonb_build_object(
      'admin_id', v_admin.id,
      'admin_name', NULLIF(btrim(concat_ws(' ', v_admin.first_name, v_admin.last_name)), '')
    )
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    p_profile_id,
    'bonus_earned',
    'Бонусы начислены',
    format('+%s бонусов уже доступны: %s', p_amount, v_reason),
    '/profile/bonuses'
  );

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'amount', p_amount,
    'active_balance', v_active
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_add_bonus(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_bonus(uuid, integer, text, uuid, uuid) TO service_role;

-- ── 2. Ровно одна версия ────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'admin_add_bonus') <> 1 THEN
    RAISE EXCEPTION 'admin_add_bonus — не одна версия';
  END IF;
END $$;

-- ============================================================================
-- Исправление: добавляем rollback_earned в constraint
-- ============================================================================
-- Проблема: при отмене заказа со статусом delivered возникает ошибка
-- "violates check constraint bonus_transactions_transaction_type_check"
-- потому что constraint не знает о типе 'rollback_earned'
-- ============================================================================

-- Шаг 1: Проверяем какие типы есть в базе
DO $$
DECLARE
  v_types TEXT;
BEGIN
  SELECT string_agg(DISTINCT transaction_type, ', ' ORDER BY transaction_type)
  INTO v_types
  FROM bonus_transactions;
  
  RAISE NOTICE 'Существующие типы транзакций: %', v_types;
END $$;

-- Шаг 2: Удаляем старый constraint
ALTER TABLE public.bonus_transactions
  DROP CONSTRAINT IF EXISTS bonus_transactions_transaction_type_check;

-- Шаг 3: Добавляем новый constraint со ВСЕМИ возможными типами
ALTER TABLE public.bonus_transactions
  ADD CONSTRAINT bonus_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earned',
    'spent',
    'welcome',
    'refund_spent',
    'refund_earned',
    'rollback_earned',  -- ✅ Добавлено для отмены заказов
    'activation',
    'pending',          -- ✅ Для ожидающих бонусов
    'review',
    'birthday',
    'expiration',
    'promo',            -- ✅ На случай промо-бонусов
    'manual'            -- ✅ На случай ручного начисления
  ));

-- Проверка
DO $$
BEGIN
  RAISE NOTICE 'Constraint обновлён: добавлены rollback_earned, promo, manual';
END $$;

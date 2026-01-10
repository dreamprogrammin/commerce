-- =====================================================================================
-- МИГРАЦИЯ: Создание таблицы bonus_transactions для истории бонусов
-- =====================================================================================
-- Назначение:
-- - Хранит историю всех операций с бонусами
-- - Отображение в профиле пользователя
-- - Аудит бонусной системы
-- =====================================================================================

-- Создаем таблицу для истории транзакций с бонусами
CREATE TABLE IF NOT EXISTS public.bonus_transactions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,

  -- Тип транзакции
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'earned',          -- Начислено за покупку
    'spent',           -- Потрачено на покупку
    'welcome',         -- Приветственный бонус
    'refund_spent',    -- Возврат потраченных (при отмене заказа)
    'refund_earned',   -- Откат начисленных (при отмене заказа)
    'activation'       -- Активация pending бонусов
  )),

  -- Сумма транзакции (положительная или отрицательная)
  amount INTEGER NOT NULL,

  -- Балансы после транзакции
  balance_after INTEGER NOT NULL DEFAULT 0,
  pending_balance_after INTEGER NOT NULL DEFAULT 0,

  -- Описание
  description TEXT,

  -- Статус (для pending бонусов)
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),

  -- Дата активации (для pending бонусов)
  activation_date TIMESTAMPTZ,

  -- Метаданные
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_user_id ON public.bonus_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_order_id ON public.bonus_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_type ON public.bonus_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_created_at ON public.bonus_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bonus_transactions_status ON public.bonus_transactions(status);

-- Комментарии
COMMENT ON TABLE public.bonus_transactions IS 'История всех операций с бонусами пользователей';
COMMENT ON COLUMN public.bonus_transactions.transaction_type IS 'Тип транзакции: earned, spent, welcome, refund_spent, refund_earned, activation';
COMMENT ON COLUMN public.bonus_transactions.amount IS 'Сумма бонусов (может быть отрицательной для списаний)';
COMMENT ON COLUMN public.bonus_transactions.balance_after IS 'Активный баланс после транзакции';
COMMENT ON COLUMN public.bonus_transactions.pending_balance_after IS 'Pending баланс после транзакции';
COMMENT ON COLUMN public.bonus_transactions.activation_date IS 'Дата когда pending бонусы станут активными (для earned)';

-- RLS политики
ALTER TABLE public.bonus_transactions ENABLE ROW LEVEL SECURITY;

-- Пользователь может видеть только свои транзакции
CREATE POLICY "Users can view own bonus transactions"
  ON public.bonus_transactions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Только система может создавать транзакции (через функции)
CREATE POLICY "Only system can insert bonus transactions"
  ON public.bonus_transactions
  FOR INSERT
  WITH CHECK (false);

-- =====================================================================================
-- RPC ФУНКЦИЯ: Получение истории бонусов пользователя
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_bonus_history(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  transaction_type TEXT,
  amount INTEGER,
  balance_after INTEGER,
  pending_balance_after INTEGER,
  description TEXT,
  status TEXT,
  activation_date TIMESTAMPTZ,
  order_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Проверка авторизации
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;

  RETURN QUERY
  SELECT
    bt.id,
    bt.transaction_type,
    bt.amount,
    bt.balance_after,
    bt.pending_balance_after,
    bt.description,
    bt.status,
    bt.activation_date,
    bt.order_id,
    bt.created_at
  FROM public.bonus_transactions bt
  WHERE bt.user_id = v_user_id
  ORDER BY bt.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_bonus_history(INTEGER, INTEGER) IS
'Получает историю бонусных транзакций текущего пользователя.
Параметры:
  - p_limit: Количество записей (default 50)
  - p_offset: Смещение для пагинации (default 0)';

-- Даем права на выполнение
GRANT EXECUTE ON FUNCTION public.get_bonus_history(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bonus_history(INTEGER, INTEGER) TO anon;

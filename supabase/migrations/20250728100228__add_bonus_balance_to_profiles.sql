-- Добавляем колонку для бонусного баланса
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bonus_balance INTEGER NOT NULL DEFAULT 0;

-- Добавляем проверку, чтобы баланс не мог быть отрицательным
ALTER TABLE public.profiles
ADD CONSTRAINT check_bonus_balance_non_negative
CHECK (bonus_balance >= 0);

-- Добавляем комментарий
COMMENT ON COLUMN public.profiles.bonus_balance IS 'Текущий бонусный баланс пользователя.';
-- Назначение: Переход на новую систему бонусов с активным и
-- отложенным балансом, а также с флагом приветственного бонуса.

-- === 1. Обновляем таблицу `profiles` ===

-- Сначала удаляем старую, простую колонку с бонусами.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS bonus_balance;

-- Добавляем три новые колонки.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS active_bonus_balance INT NOT NULL DEFAULT 0 CHECK (active_bonus_balance >= 0),
    ADD COLUMN IF NOT EXISTS pending_bonus_balance INT NOT NULL DEFAULT 0 CHECK (pending_bonus_balance >= 0),
    ADD COLUMN IF NOT EXISTS has_received_welcome_bonus BOOLEAN NOT NULL DEFAULT FALSE;

-- Добавляем комментарии для ясности.
COMMENT ON COLUMN public.profiles.active_bonus_balance IS 'Бонусы, которые доступны для списания прямо сейчас.';
COMMENT ON COLUMN public.profiles.pending_bonus_balance IS 'Бонусы, ожидающие активации (в холде на 14 дней).';
COMMENT ON COLUMN public.profiles.has_received_welcome_bonus IS 'True, если пользователь уже получил 1000 приветственных бонусов.';


-- === 2. Обновляем таблицу `orders` ===
-- Добавляем колонку для отслеживания, когда бонусы за заказ "разморозятся".
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS bonuses_activation_date TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.bonuses_activation_date IS 'Дата, когда начисленные за этот заказ бонусы из pending перейдут в active.';
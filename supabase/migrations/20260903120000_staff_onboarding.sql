-- Сотрудники магазина: анкета, одобрение владельцем, роли.
--
-- ЗАЧЕМ. До сих пор людей в системе различали только `profiles.role`, где
-- допустимы ровно два значения — `user` и `admin`. Ни курьера, ни менеджера
-- завести было нельзя, а управлять заказами в Telegram мог кто угодно, кого
-- добавили в рабочий чат: проверка шла по номеру чата, а не по человеку.
--
-- Владелец выбрал путь с анкетой: новый человек оставляет имя, телефон и кем
-- хочет работать, а владелец подтверждает заявку кнопкой. До подтверждения
-- сотрудник не видит ничего.
--
-- ПОЧЕМУ ОТДЕЛЬНАЯ ТАБЛИЦА, А НЕ РОЛЬ В `profiles`. Сотрудник опознаётся по
-- Telegram, а не по учётной записи на сайте: курьер может вообще никогда не
-- заходить на uhti.kz. Ключ здесь — `telegram_user_id`, и это не то же самое,
-- что `profiles.telegram_chat_id` (тот про уведомления покупателю о его
-- заказах). Смешивать покупателей и персонал в одной таблице ролей — верный
-- способ однажды выдать покупателю кнопку «Отменить заказ».

CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Telegram-идентификатор человека. Именно id, а не @ник: ник меняется
  -- когда угодно, а по нему пришлось бы искать заново.
  telegram_user_id BIGINT NOT NULL UNIQUE,
  telegram_username TEXT,

  full_name TEXT,
  phone TEXT,

  -- `courier` и `manager` — то, ради чего всё затевалось. `owner` заведён
  -- на будущее: чтобы можно было отличить того, кто подтверждает заявки.
  role TEXT CHECK (role IN ('manager', 'courier', 'owner')),

  -- Пока анкета не заполнена до конца, заявка живёт в `draft`: по тому,
  -- каких полей не хватает, бот и понимает, что спрашивать дальше. Состояние
  -- диалога хранится здесь, а не в памяти функции — функция без состояния,
  -- между сообщениями она ничего не помнит.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  -- Кто подтвердил — Telegram-id, а не ссылка на profiles: подтверждает
  -- владелец из чата, учётной записи на сайте у него для этого не нужно.
  approved_by BIGINT
);

CREATE INDEX IF NOT EXISTS idx_staff_status_role ON public.staff (status, role);

COMMENT ON TABLE public.staff IS
  'Персонал магазина: заявки из Telegram-бота и подтверждённые сотрудники. Покупатели тут не живут — они в profiles.';

-- Автообновление updated_at — тем же триггером, что и у остальных таблиц.
DROP TRIGGER IF EXISTS trigger_staff_updated_at ON public.staff;
CREATE TRIGGER trigger_staff_updated_at
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── Доступ ─────────────────────────────────────────────────────────────────
-- Таблица служебная: с сайта в неё не ходят вовсе. Работает с ней только
-- эдж-функция бота сервисным ключом, который RLS обходит. Поэтому политик
-- нет ни одной: включённый RLS без политик и означает «никому, кроме
-- сервисного ключа».
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- ── Проверка ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff') THEN
    RAISE EXCEPTION 'Таблица staff не создана';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'staff' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'На staff не включён RLS';
  END IF;
END $$;

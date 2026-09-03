-- Доставки уходят курьерам в личку, а не в общий курьерский чат.
--
-- ЗАЧЕМ. Курьерский чат заводился, чтобы курьер не видел кухню магазина. Но
-- чужие доставки он в нём видит: если курьеров двое, каждый читает адреса,
-- телефоны и суммы другого. Владелец это заметил и выбрал личные сообщения.
--
-- КАК РАБОТАЕТ. При переводе заказа в «Передан курьеру» бот рассылает
-- предложение всем принятым курьерам (`staff.role = 'courier'`,
-- `status = 'approved'`) — без телефона покупателя, только район и время.
-- Кто первым нажал «Беру», тот и везёт: за ним закрепляется заказ, ему
-- приходят полные данные, у остальных предложение гаснет.
--
-- ПОЧЕМУ ЗАКРЕПЛЕНИЕ ХРАНИТСЯ В ЗАКАЗЕ. «Кто везёт» — это факт о заказе, а
-- не о переписке: он нужен менеджеру в карточке и владельцу в отчёте, и
-- обязан пережить удаление сообщения в Telegram.

-- `ON DELETE SET NULL`, а рядом текстовое `courier_name`: уволенного курьера
-- можно удалить из `staff`, не упираясь во внешний ключ, и при этом в старых
-- заказах останется имя того, кто их вёз.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_name TEXT,
  ADD COLUMN IF NOT EXISTS courier_taken_at TIMESTAMPTZ;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS courier_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS courier_name TEXT,
  ADD COLUMN IF NOT EXISTS courier_taken_at TIMESTAMPTZ;

-- Разосланные предложения: чей это чат и какое сообщение править, когда
-- заказ забрали. Без этого у остальных курьеров так и висела бы кнопка
-- «Беру» на чужой доставке.
--
-- Строки живут ровно до конца доставки — это не архив, а состояние рассылки.
CREATE TABLE IF NOT EXISTS public.courier_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id UUID NOT NULL,

  -- Заказы лежат в двух таблицах — гостевые отдельно, — поэтому внешнего
  -- ключа тут быть не может, и таблица заказа хранится рядом с id.
  order_table TEXT NOT NULL CHECK (order_table IN ('orders', 'guest_checkouts')),

  telegram_user_id BIGINT NOT NULL,
  message_id BIGINT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Одному курьеру одно предложение на заказ: повторная рассылка (например,
  -- после перезапуска доставки) не должна плодить кнопки.
  UNIQUE (order_id, telegram_user_id)
);

CREATE INDEX IF NOT EXISTS idx_courier_offers_order
  ON public.courier_offers (order_id);

-- Как и `staff`: доступ только у service_role, то есть у эдж-функций.
-- Политик нет намеренно — ни анониму, ни авторизованному покупателю здесь
-- делать нечего, а адреса и телефоны в строках настоящие.
ALTER TABLE public.courier_offers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.courier_offers IS
  'Разосланные курьерам предложения доставки: чьё сообщение править, когда заказ забрали.';

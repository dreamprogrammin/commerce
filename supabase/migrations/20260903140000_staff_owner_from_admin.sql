-- Владелец магазина заводится в `staff` сразу, а не через анкету.
--
-- ЗАЧЕМ. Анкета и допуск устроены так: пока в `staff` нет ни одного
-- подтверждённого менеджера, кнопки заказов работают по-старому — по
-- присутствию в рабочем чате. Это временная мягкость, чтобы выкат никого не
-- заблокировал. Но владельцу неудобно подавать заявку самому себе и самому
-- же её принимать, а до тех пор строгий режим не включится вовсе.
--
-- Поэтому владелец добавляется сразу, с ролью `owner` и статусом `approved`.
--
-- ОТКУДА БЕРЁТСЯ TELEGRAM-ID. Из `profiles`, где `role = 'admin'` и привязан
-- Telegram. Для личного чата с ботом `chat.id` совпадает с id пользователя —
-- именно этот номер и приходит в `callback_query.from.id`, по которому
-- работает допуск. Колонка там уже `bigint`, приводить ничего не нужно.
--
-- Если админов с привязанным Telegram нет, миграция ничего не делает и не
-- падает: строгий режим просто не включится, и всё останется как было.

INSERT INTO public.staff (
  telegram_user_id, telegram_username, full_name, phone, role, status, approved_at
)
SELECT
  p.telegram_chat_id,
  NULL,
  NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
  p.phone,
  'owner',
  'approved',
  NOW()
FROM public.profiles p
WHERE p.role = 'admin'
  AND p.telegram_chat_id IS NOT NULL
ON CONFLICT (telegram_user_id) DO UPDATE
  SET role = 'owner',
      status = 'approved',
      approved_at = COALESCE(public.staff.approved_at, NOW());

-- ── Проверка ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admins INTEGER;
  v_owners INTEGER;
BEGIN
  SELECT count(*) INTO v_admins
  FROM public.profiles
  WHERE role = 'admin' AND telegram_chat_id IS NOT NULL;

  SELECT count(*) INTO v_owners FROM public.staff WHERE role = 'owner' AND status = 'approved';

  -- Ровно столько владельцев, сколько подходящих админов. Если админов нет,
  -- ноль — это тоже верный результат.
  IF v_owners < v_admins THEN
    RAISE EXCEPTION 'Ожидалось владельцев не меньше %, получилось %', v_admins, v_owners;
  END IF;

  RAISE NOTICE 'Владельцев в staff: %', v_owners;
END $$;

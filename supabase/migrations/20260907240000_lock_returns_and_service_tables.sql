-- =====================================================================================
-- ВОЗВРАТЫ: читать только свои; служебные таблицы — убрать лишние гранты
-- =====================================================================================
-- Аудит 7 сентября 2026, проход по остальным таблицам.
--
-- НАЙДЕНО. `order_returns` и `order_return_items` имели SELECT-политику
-- `auth.role() = 'authenticated'` — то есть ЛЮБОЙ залогиненный покупатель мог
-- прочитать ВСЕ возвраты: суммы возврата, причины, привязку к заказам чужих
-- людей. Сейчас строк 0, утечки ещё не было, но дыра латентная.
--
-- Чиним: возврат виден владельцу заказа и админу. Гостевые возвраты (без
-- order_id, только guest_checkout_id) авторизованному пользователю не
-- принадлежат — их видит только админ, как и сами гостевые заказы.
-- =====================================================================================

DROP POLICY IF EXISTS "Authenticated can read order_returns" ON public.order_returns;

CREATE POLICY "Users read own order returns"
  ON public.order_returns
  FOR SELECT
  TO authenticated
  USING (
    current_user_has_role_internal('admin')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_returns.order_id
        AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated can read order_return_items" ON public.order_return_items;

CREATE POLICY "Users read own order return items"
  ON public.order_return_items
  FOR SELECT
  TO authenticated
  USING (
    current_user_has_role_internal('admin')
    OR EXISTS (
      SELECT 1
      FROM public.order_returns r
      JOIN public.orders o ON o.id = r.order_id
      WHERE r.id = order_return_items.return_id
        AND o.user_id = auth.uid()
    )
  );

-- =====================================================================================
-- Служебные таблицы: RLS без политик уже закрывает строки, но широкие гранты
-- anon/authenticated висят с раздачи по умолчанию. Убираем — защита в глубину:
-- если где-то по ошибке появится RLS-политика, гранты не выстрелят.
-- Пишут в эти таблицы триггеры (от postgres) и серверный код (service_role).
-- =====================================================================================

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'staff', 'reminder_logs', 'courier_offers', 'sales_plans',
    'bonus_activation_skipped', 'app_settings'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'order_returns' AND policyname = 'Authenticated can read order_returns'
  ) THEN
    RAISE EXCEPTION 'Старая открытая политика возвратов ещё на месте';
  END IF;

  IF has_table_privilege('anon', 'public.staff', 'SELECT') THEN
    RAISE EXCEPTION 'anon всё ещё имеет грант на staff';
  END IF;

  RAISE NOTICE '✅ Возвраты закрыты владельцем, служебные таблицы — без anon-грантов';
END $$;

NOTIFY pgrst, 'reload schema';

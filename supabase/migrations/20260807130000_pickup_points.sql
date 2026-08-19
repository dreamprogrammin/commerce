-- ============================================================================
--  Пункты самовывоза
-- ============================================================================
--  ЗАЧЕМ. В макете (Корзина.dc.html, блок «Пункт самовывоза») покупатель
--  выбирает, откуда забрать заказ. Переносить блок было некуда: справочника
--  пунктов не существовало, и в заказе не было места для выбора. Заводим и то,
--  и другое, чтобы адреса заполнялись из админки, а не правились в коде.
--
--  ПРО СВЯЗЬ С ЗАКАЗОМ. ON DELETE SET NULL, а не CASCADE: закрытый пункт
--  удаляют из справочника, но заказы, которые через него прошли, должны
--  остаться. Название и адрес на момент выдачи при этом теряются — если это
--  важно для истории, пункт стоит не удалять, а снимать is_active.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pickup_points (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  address       TEXT NOT NULL,
  -- Часы работы строкой: «ежедневно 10:00–22:00», «пн-пт 9:00–18:00, сб 10:00–15:00».
  -- Структурировать незачем — это подпись под названием, а не расписание,
  -- по которому что-то считается.
  working_hours TEXT,
  phone         TEXT,
  -- Комментарий для покупателя: «вход со двора», «2 этаж, налево».
  note          TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.pickup_points IS 'Пункты самовывоза, заполняются через админку';
COMMENT ON COLUMN public.pickup_points.working_hours IS 'Часы работы строкой, показывается покупателю под названием';
COMMENT ON COLUMN public.pickup_points.note IS 'Уточнение для покупателя: как найти вход';

CREATE INDEX IF NOT EXISTS idx_pickup_points_active
  ON public.pickup_points (display_order, name) WHERE is_active;

ALTER TABLE public.pickup_points ENABLE ROW LEVEL SECURITY;

-- Витрине нужен список активных пунктов до авторизации: их выбирают и гости.
DROP POLICY IF EXISTS "Активные пункты видны всем" ON public.pickup_points;
CREATE POLICY "Активные пункты видны всем"
  ON public.pickup_points FOR SELECT
  TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "Админы управляют пунктами самовывоза" ON public.pickup_points;
CREATE POLICY "Админы управляют пунктами самовывоза"
  ON public.pickup_points FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

GRANT SELECT ON public.pickup_points TO anon, authenticated;
GRANT ALL ON public.pickup_points TO authenticated, service_role;

-- updated_at сам по себе не обновится, а в админке список сортируется и по нему.
CREATE OR REPLACE FUNCTION public.touch_pickup_point_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pickup_points_updated_at ON public.pickup_points;
CREATE TRIGGER trg_pickup_points_updated_at
  BEFORE UPDATE ON public.pickup_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_pickup_point_updated_at();

-- Куда записывать выбор покупателя.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_point_id UUID REFERENCES public.pickup_points(id) ON DELETE SET NULL;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS pickup_point_id UUID REFERENCES public.pickup_points(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.orders.pickup_point_id IS 'Выбранный пункт самовывоза; NULL при доставке курьером';

NOTIFY pgrst, 'reload schema';

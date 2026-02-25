-- ============================================================================
-- Промокоды: таблица, валидация, cron-очистка
-- ============================================================================

-- 1. Таблица промокодов
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = универсальный
  discount_percent NUMERIC NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
  min_order_amount NUMERIC DEFAULT 0,
  max_uses INTEGER DEFAULT 1,
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_promo_codes_code ON public.promo_codes (code);
CREATE INDEX idx_promo_codes_user_id ON public.promo_codes (user_id);
CREATE INDEX idx_promo_codes_expires_at ON public.promo_codes (expires_at);

-- 2. RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Пользователь читает свои промокоды
CREATE POLICY "Users can read own promo codes"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Вставка/обновление только через SECURITY DEFINER функции
-- (нет INSERT/UPDATE политик для обычных пользователей)

-- 3. Функция валидации промокода
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  p_code TEXT,
  p_order_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promo RECORD;
  v_discount_amount NUMERIC;
BEGIN
  SELECT * INTO v_promo
  FROM public.promo_codes
  WHERE code = UPPER(TRIM(p_code));

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Промокод не найден');
  END IF;

  -- Проверяем привязку к пользователю
  IF v_promo.user_id IS NOT NULL AND v_promo.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Промокод не найден');
  END IF;

  -- Проверяем срок действия
  IF v_promo.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Промокод истёк');
  END IF;

  -- Проверяем лимит использований
  IF v_promo.uses_count >= v_promo.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Промокод уже использован');
  END IF;

  -- Проверяем минимальную сумму
  IF p_order_amount < v_promo.min_order_amount THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', format('Минимальная сумма заказа: %s ₸', v_promo.min_order_amount::INTEGER)
    );
  END IF;

  v_discount_amount := ROUND(p_order_amount * v_promo.discount_percent / 100, 0);

  RETURN jsonb_build_object(
    'valid', true,
    'discount_percent', v_promo.discount_percent,
    'discount_amount', v_discount_amount
  );
END;
$$;

-- 4. Cron: очистка истёкших промокодов (каждый час)
SELECT cron.schedule(
  'cleanup-expired-promo-codes',
  '0 * * * *',
  $$DELETE FROM public.promo_codes WHERE expires_at < now() - interval '7 days'$$
);

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

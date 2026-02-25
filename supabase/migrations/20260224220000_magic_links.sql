-- =====================================================================================
-- МИГРАЦИЯ: Magic Links — бесшовный переход из Telegram на сайт с автологином
-- =====================================================================================
-- magic_links: одноразовые токены (64 hex, 15 мин жизни)
-- generate_magic_link(): генерирует URL с токеном
-- Cron: очистка expired каждый час
-- =====================================================================================

-- 1. Таблица magic_links
CREATE TABLE public.magic_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  redirect_path TEXT NOT NULL DEFAULT '/',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Только service role (генерируется из SQL триггеров)
ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_magic_links_token ON public.magic_links(token) WHERE used_at IS NULL;
CREATE INDEX idx_magic_links_expires ON public.magic_links(expires_at);

-- 2. Функция generate_magic_link()
CREATE OR REPLACE FUNCTION public.generate_magic_link(
  p_user_id UUID,
  p_redirect_path TEXT DEFAULT '/'
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token TEXT;
  v_url TEXT;
BEGIN
  -- Генерируем 32 random bytes → 64 hex символа
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.magic_links (user_id, token, redirect_path)
  VALUES (p_user_id, v_token, COALESCE(p_redirect_path, '/'));

  v_url := 'https://uhti.kz/auth/magic?token=' || v_token;
  RETURN v_url;
END;
$$;

-- 3. Cron: очистка expired каждый час
SELECT cron.schedule(
  'Cleanup expired magic links',
  '0 * * * *',
  'DELETE FROM public.magic_links WHERE expires_at < now() - interval ''1 hour'';'
);

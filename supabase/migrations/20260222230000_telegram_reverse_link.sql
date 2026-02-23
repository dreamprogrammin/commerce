-- ============================================================================
-- Обратная привязка Telegram: бот → сайт (one-click)
-- Бот создаёт токен с chat_id, кнопка ведёт на сайт, сайт линкует
-- ============================================================================

-- Таблица для обратных ссылок привязки (бот → сайт)
CREATE TABLE IF NOT EXISTS public.telegram_reverse_links (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  chat_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_telegram_reverse_links_code
  ON public.telegram_reverse_links(code);

ALTER TABLE public.telegram_reverse_links ENABLE ROW LEVEL SECURITY;

-- Только через RPC (service role или authenticated через функцию)
CREATE POLICY "No direct access to reverse links" ON public.telegram_reverse_links
  FOR ALL USING (false);

-- RPC: привязать Telegram по коду (вызывается залогиненным пользователем на сайте)
CREATE OR REPLACE FUNCTION public.link_telegram_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_chat_id BIGINT;
  v_existing BIGINT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходимо авторизоваться';
  END IF;

  -- Ищем код
  SELECT chat_id INTO v_chat_id
  FROM public.telegram_reverse_links
  WHERE code = p_code
    AND expires_at > NOW();

  IF v_chat_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Код недействителен или истёк. Нажмите START в боте заново.');
  END IF;

  -- Проверяем что chat_id не привязан к другому пользователю
  SELECT telegram_chat_id INTO v_existing
  FROM public.profiles
  WHERE telegram_chat_id = v_chat_id
    AND id != v_user_id;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Этот Telegram уже привязан к другому аккаунту.');
  END IF;

  -- Привязываем
  UPDATE public.profiles
  SET telegram_chat_id = v_chat_id
  WHERE id = v_user_id;

  -- Удаляем использованный код и все другие коды с этим chat_id
  DELETE FROM public.telegram_reverse_links WHERE chat_id = v_chat_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_telegram_by_code(TEXT) TO authenticated;

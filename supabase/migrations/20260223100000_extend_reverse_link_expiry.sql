-- Увеличить default expiry reverse_links с 10 минут до 30 дней
ALTER TABLE public.telegram_reverse_links
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

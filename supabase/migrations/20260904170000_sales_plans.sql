-- =====================================================================================
-- ПЛАН ПРОДАЖ И ЕЖЕДНЕВНАЯ СВОДКА
-- =====================================================================================
-- Владелец попросил, чтобы бот подгонял по продажам: товарооборот, план,
-- процент выполнения, сравнение с прошлыми периодами — дважды в день, утром
-- в 9 и перед закрытием в 22.
--
-- Здесь заводится только ХРАНИЛИЩЕ ПЛАНА и расписание. Сам текст сводки
-- считает эдж-функция sales-digest.
--
-- План задаётся командой боту `/plan 3000000` и живёт по месяцам: дневную
-- норму бот делит сам. Отдельной строки на каждый день нет намеренно — вести
-- 30 цифр руками владелец не станет, а одна месячная правится за секунду.
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.sales_plans (
  -- Первое число месяца, к которому относится план.
  month DATE PRIMARY KEY,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Кто поставил: telegram_user_id владельца. Без FK — staff может смениться,
  -- а история плана должна пережить увольнение.
  updated_by BIGINT
);

COMMENT ON TABLE public.sales_plans IS
'План продаж по месяцам. Ставится владельцем командой /plan в Telegram,
читается эдж-функцией sales-digest. Дневная норма считается делением на число
дней в месяце.';

-- Доступ только у service_role: планы читает и пишет бот, в браузер они не
-- ходят. Политик нет — как у staff и courier_offers.
ALTER TABLE public.sales_plans ENABLE ROW LEVEL SECURITY;

-- =====================================================================================
-- Расписание: две сводки в день по времени Алматы (UTC+5)
-- =====================================================================================
-- 09:00 Алматы = 04:00 UTC — план на день.
-- 22:00 Алматы = 17:00 UTC — итог перед закрытием.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron не установлен — расписание завести негде';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net не установлен — позвать эдж-функцию нечем';
  END IF;
END $$;

SELECT cron.unschedule('sales-digest-morning')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sales-digest-morning');

SELECT cron.unschedule('sales-digest-evening')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sales-digest-evening');

SELECT cron.schedule(
  'sales-digest-morning',
  '0 4 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/sales-digest',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('slot', 'morning')
    )
  $job$
);

SELECT cron.schedule(
  'sales-digest-evening',
  '0 17 * * *',
  $job$
    SELECT net.http_post(
      url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/sales-digest',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('slot', 'evening')
    )
  $job$
);

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job
  WHERE jobname IN ('sales-digest-morning', 'sales-digest-evening');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Ожидались два задания сводки, найдено %', v_count;
  END IF;

  RAISE NOTICE '✅ Сводка продаж: 04:00 и 17:00 UTC (09:00 и 22:00 Алматы)';
END $$;

NOTIFY pgrst, 'reload schema';

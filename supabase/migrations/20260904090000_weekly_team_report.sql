-- =====================================================================================
-- ЕЖЕНЕДЕЛЬНЫЙ ОТЧЁТ ПО РАБОТЕ КОМАНДЫ
-- =====================================================================================
-- Владелец видит поток заказов в рабочем чате, но не видит картины: кто из
-- менеджеров сколько провёл, кто из курьеров сколько отвёз, много ли отмен.
-- Отчёт собирает эдж-функция team-report, здесь заводится только расписание.
--
-- Понедельник, 09:00 по Алматы = 04:00 UTC (Казахстан весь на UTC+5, перевода
-- часов нет). pg_cron считает расписание в UTC — см. `show timezone` на проде.
--
-- Отчёт приходит за ПРОШЛУЮ календарную неделю (пн–вс): в понедельник утром
-- «за 7 дней» читалось бы криво, половина недели уже новая.
-- =====================================================================================

-- Проверка состояния: без этих расширений заводить расписание бессмысленно.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron не установлен — расписание завести негде';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION 'pg_net не установлен — позвать эдж-функцию нечем';
  END IF;
END $$;

-- Пересоздаём задание: повторный прогон миграции не должен плодить копии.
SELECT cron.unschedule('weekly-team-report')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-team-report');

SELECT cron.schedule(
  'weekly-team-report',
  '0 4 * * 1',
  $job$
    SELECT net.http_post(
      url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/team-report',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('period', 'lw')
    )
  $job$
);

-- Проверка: осталось ровно одно задание с таким именем.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'weekly-team-report';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Ожидалось одно задание weekly-team-report, найдено %', v_count;
  END IF;

  RAISE NOTICE '✅ Еженедельный отчёт: понедельник 04:00 UTC (09:00 Алматы)';
END $$;

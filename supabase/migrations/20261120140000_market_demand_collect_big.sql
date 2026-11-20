-- Большой ответ DataForSEO разбирает планировщик, а не страница (20 ноября 2026).
--
-- Владелец 20.11: «Ответ не разобран: canceling statement due to statement
-- timeout». «Новые запросы» (keywords_for_keywords по 16 затравкам) вернули
-- 13 671 фразу — 39 МБ JSON. Страница зовёт market_demand_collect() через
-- PostgREST, а там statement_timeout 8 с (роль authenticator). На бою разбор
-- занял 4–12 с (замер 20.11 только чтением; локально — 1,2 с, поэтому стражи
-- не ловили): больше всего ушло на двойной разбор JSON ради кода ответа.
-- Отменённый разбор откатывается, запуск остаётся «в работе», и каждый заход
-- на страницу повторял его заново до той же отмены.
--
-- Теперь:
--  - при коротком statement_timeout (страница) ответ больше 300 КБ в хранении
--    не разбирается, а включается задача планировщика «Market Demand Collect
--    Big» раз в 30 секунд — у неё таймаут сервера, не 8 с; задача снимает
--    себя, когда ждать больше нечего;
--  - JSON ответа разбирается один раз, а не дважды, и только у «похожих»
--    (там нужен код «Too many requests»).
-- Тело — с боя (pg_get_functiondef 20.11, совпало с локальным); изменены
-- только помеченные места. Сигнатура та же — перегрузки не будет.

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
DECLARE
  v_def text;
BEGIN
  IF to_regprocedure('public.market_demand_collect()') IS NULL
     OR to_regprocedure('public.market_demand_ingest(bigint,integer,text,text)') IS NULL
     OR to_regprocedure('public.market_demand_send_ideas(bigint)') IS NULL THEN
    RAISE EXCEPTION 'нет market_demand_collect/ingest/send_ideas — миграции спроса не применены';
  END IF;
  v_def := pg_get_functiondef('public.market_demand_collect()'::regprocedure);
  IF v_def NOT LIKE '%PERFORM market_demand_send_ideas(r.id)%'
     OR v_def NOT LIKE '%v_code := coalesce(nullif(v_resp.content::jsonb%' THEN
    RAISE EXCEPTION 'market_demand_collect() не та, под которую писалась миграция';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Collect Big') THEN
    RAISE EXCEPTION 'задача «Market Demand Collect Big» уже есть';
  END IF;
END $$;

-- ── 1. Сбор ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.market_demand_collect()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_resp record;
  v_code integer;
  v_done integer := 0;
  -- новое: короткий таймаут — зовут со страницы через PostgREST (8 с)
  v_short boolean := (SELECT setting::bigint FROM pg_settings WHERE name = 'statement_timeout') BETWEEN 1 AND 59999;
  v_deferred boolean := false;
  v_json jsonb;
BEGIN
  FOR r IN SELECT id, kind, request_id, requested_at, attempts FROM market_demand_runs
           WHERE status = 'pending' ORDER BY id FOR UPDATE SKIP LOCKED LOOP
    -- В очереди: уходит, когда срок настал и у DataForSEO в работе ничего нет
    IF r.request_id IS NULL THEN
      IF r.requested_at < now() - interval '60 minutes' THEN
        UPDATE market_demand_runs SET status = 'failed', error = 'Запрос так и не ушёл в DataForSEO', finished_at = now()
        WHERE id = r.id;
        v_done := v_done + 1;
      ELSIF r.requested_at <= now()
            AND NOT EXISTS (SELECT 1 FROM market_demand_runs o
                            WHERE o.status = 'pending' AND o.request_id IS NOT NULL AND o.id <> r.id) THEN
        PERFORM market_demand_send_ideas(r.id);
      END IF;
      CONTINUE;
    END IF;

    -- новое: большой ответ со страницы не разбирать — отдать планировщику
    IF v_short AND EXISTS (SELECT 1 FROM net._http_response
                           WHERE id = r.request_id AND pg_column_size(content) > 300000) THEN
      v_deferred := true;
      CONTINUE;
    END IF;

    SELECT status_code, content, timed_out, error_msg INTO v_resp FROM net._http_response WHERE id = r.request_id;
    IF FOUND THEN
      -- «Too many requests» у похожих — ещё раз через минуту, всего до трёх попыток
      v_code := NULL;
      -- новое: JSON разбирается один раз и только у похожих
      IF r.kind = 'ideas' AND r.attempts < 3 THEN
        BEGIN
          v_json := v_resp.content::jsonb;
          v_code := coalesce(nullif(v_json ->> 'status_code', '20000'),
                             v_json -> 'tasks' -> 0 ->> 'status_code')::integer;
        EXCEPTION WHEN others THEN
          v_code := NULL;
        END;
        v_json := NULL;
      END IF;
      IF r.kind = 'ideas' AND r.attempts < 3 AND (v_code = 50301 OR v_resp.status_code = 429) THEN
        UPDATE market_demand_runs SET request_id = NULL, requested_at = now() + interval '1 minute' WHERE id = r.id;
        CONTINUE;
      END IF;
      PERFORM market_demand_ingest(r.id, v_resp.status_code, v_resp.content,
        CASE WHEN v_resp.timed_out THEN 'DataForSEO не ответил за 2 минуты'
             WHEN v_resp.error_msg IS NOT NULL THEN 'Сбой связи с DataForSEO: ' || v_resp.error_msg END);
      v_done := v_done + 1;
    ELSIF r.requested_at < now() - interval '60 minutes' THEN
      UPDATE market_demand_runs SET status = 'failed', error = 'Ответа от DataForSEO нет', finished_at = now()
      WHERE id = r.id;
      v_done := v_done + 1;
    END IF;
  END LOOP;

  -- новое: планировщик — пока есть отложенное; ждать нечего — снять задачу
  IF v_deferred THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Collect Big') THEN
      PERFORM cron.schedule('Market Demand Collect Big', '30 seconds',
        $cron$SELECT public.market_demand_collect()$cron$);
    END IF;
  ELSIF NOT v_short
        AND NOT EXISTS (SELECT 1 FROM market_demand_runs WHERE status = 'pending')
        AND EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Collect Big') THEN
    PERFORM cron.unschedule('Market Demand Collect Big');
  END IF;
  RETURN v_done;
END $function$;

-- Права — как были: CREATE OR REPLACE их не трогает, но проверить
-- ── 2. Проверка результата ───────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'market_demand_collect' AND pronamespace = 'public'::regnamespace) <> 1 THEN
    RAISE EXCEPTION 'market_demand_collect — не ровно одна версия';
  END IF;
  IF has_function_privilege('anon', 'public.market_demand_collect()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.market_demand_collect()', 'EXECUTE') THEN
    RAISE EXCEPTION 'market_demand_collect доступна гостю или покупателю';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.market_demand_collect()', 'EXECUTE') THEN
    RAISE EXCEPTION 'у service_role нет market_demand_collect';
  END IF;
END $$;

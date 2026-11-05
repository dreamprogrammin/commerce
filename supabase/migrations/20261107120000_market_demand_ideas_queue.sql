-- ============================================================================
-- Похожие запросы DataForSEO — после объёмов, с повтором (6 ноября 2026)
--
-- 5 ноября первое ручное обновление на бою: объёмы пришли ($0,09), похожие
-- запросы — «Too many requests. (код 50301)». Оба запроса уходили в одну и
-- ту же секунду, второй DataForSEO отклонял. Теперь:
--   • market_demand_request() шлёт только объёмы, похожие ставит в очередь
--     (request_id NULL);
--   • market_demand_collect() отправляет очередь, когда в работе у DataForSEO
--     не осталось ни одного запроса, и на 50301 ставит похожие обратно —
--     через минуту, всего до трёх попыток.
-- Страница опрашивает collect до 10 минут — три попытки в них укладываются;
-- плановое обновление собирает cron «Market Demand Collect» каждые 10 минут.
--
-- Тела функций сняты с прода (pg_get_functiondef 6.11.2026), сигнатуры не
-- меняются — перегрузок нет.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.market_demand_request(uuid, boolean)') IS NULL
     OR to_regprocedure('public.market_demand_collect()') IS NULL
     OR to_regprocedure('public.market_demand_ingest(bigint, integer, text, text)') IS NULL THEN
    RAISE EXCEPTION 'нет функций спроса — сначала 20261101120000_market_demand';
  END IF;
  IF position('keywords_for_keywords' IN pg_get_functiondef('public.market_demand_request(uuid, boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'market_demand_request не та, под которую готовилась миграция';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'market_demand_runs' AND column_name = 'attempts')
     OR to_regprocedure('public.market_demand_send_ideas(bigint)') IS NOT NULL THEN
    RAISE EXCEPTION 'attempts или market_demand_send_ideas уже есть — миграция применялась?';
  END IF;
END $$;

-- ── 1. Попытки ───────────────────────────────────────────────────────────────
-- Сколько раз запрос уходил в DataForSEO; в очереди ещё не ушедший — 0
ALTER TABLE public.market_demand_runs ADD COLUMN attempts smallint NOT NULL DEFAULT 1;

-- ── 2. Затравки и отправка похожих ───────────────────────────────────────────
CREATE FUNCTION public.market_demand_idea_seeds()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- Затравки похожих запросов (до 20 у DataForSEO)
  SELECT ARRAY[
    'игрушки', 'детские игрушки', 'игрушки для детей', 'купить игрушку', 'игрушки для девочек',
    'игрушки для мальчиков', 'подарок ребенку', 'конструктор', 'кукла', 'машинка', 'мягкая игрушка',
    'развивающие игрушки', 'настольные игры', 'игрушки алматы', 'магазин игрушек', 'популярные игрушки']
$$;

CREATE FUNCTION public.market_demand_send_ideas(p_run_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_creds jsonb;
  v_req bigint;
BEGIN
  SELECT decrypted_secret::jsonb INTO v_creds FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
  IF v_creds IS NULL THEN
    UPDATE market_demand_runs SET status = 'failed', error = 'Ключ DataForSEO не задан', finished_at = now()
    WHERE id = p_run_id AND status = 'pending';
    RETURN NULL;
  END IF;
  v_req := net.http_post(
    url := market_demand_api_base() || '/v3/keywords_data/google_ads/keywords_for_keywords/live',
    body := jsonb_build_array(jsonb_build_object(
      'keywords', to_jsonb(market_demand_idea_seeds()),
      'location_code', 2398,
      'language_code', 'ru',
      'sort_by', 'search_volume',
      'include_adult_keywords', false,
      'search_partners', false)),
    headers := jsonb_build_object(
      'Authorization', 'Basic ' || replace(encode(convert_to((v_creds ->> 'login') || ':' || (v_creds ->> 'password'), 'UTF8'), 'base64'), E'\n', ''),
      'Content-Type', 'application/json'),
    timeout_milliseconds := 120000);
  UPDATE market_demand_runs SET request_id = v_req, requested_at = now(), attempts = attempts + 1
  WHERE id = p_run_id;
  RETURN v_req;
END $function$;
REVOKE ALL ON FUNCTION public.market_demand_send_ideas(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_demand_idea_seeds() FROM PUBLIC, anon, authenticated;

-- ── 3. Запрос: объёмы сразу, похожие — в очередь ─────────────────────────────
CREATE OR REPLACE FUNCTION public.market_demand_request(p_admin uuid DEFAULT NULL::uuid, p_scheduled boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_creds jsonb;
  v_auth text;
  v_base text;
  v_keywords text[];
  v_headers jsonb;
  v_volumes bigint;
  v_ideas bigint;
BEGIN
  -- Одно обновление за раз: два нажатия подряд — одна оплата
  PERFORM pg_advisory_xact_lock(hashtext('market_demand_request'));
  IF EXISTS (SELECT 1 FROM market_demand_runs WHERE status = 'pending' AND requested_at > now() - interval '15 minutes') THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'обновление уже идёт');
    END IF;
    RAISE EXCEPTION 'Обновление уже идёт — дождитесь ответа DataForSEO';
  END IF;
  IF p_scheduled AND EXISTS (SELECT 1 FROM market_demand_runs
                             WHERE kind = 'volumes' AND status = 'done' AND requested_at > now() - interval '20 days') THEN
    RETURN jsonb_build_object('skipped', 'обновлялось меньше 20 дней назад');
  END IF;
  IF NOT p_scheduled AND (SELECT count(*) FROM market_demand_runs
                          WHERE kind = 'volumes' AND NOT scheduled AND requested_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Не больше 5 обновлений в сутки — каждое оплачивается с баланса DataForSEO';
  END IF;

  SELECT decrypted_secret::jsonb INTO v_creds FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
  IF v_creds IS NULL THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'ключ DataForSEO не задан');
    END IF;
    RAISE EXCEPTION 'Ключ DataForSEO не задан';
  END IF;

  SELECT array_agg(k ORDER BY k) INTO v_keywords
  FROM (SELECT DISTINCT unnest(keywords) AS k FROM market_demand_topics WHERE is_active) s;
  IF v_keywords IS NULL THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'нет активных тем');
    END IF;
    RAISE EXCEPTION 'Нет активных тем — нечего спрашивать';
  END IF;
  IF cardinality(v_keywords) > 1000 THEN
    RAISE EXCEPTION 'Фраз % — DataForSEO берёт до 1000 за задачу; отключите часть тем', cardinality(v_keywords);
  END IF;

  v_base := market_demand_api_base();
  v_auth := 'Basic ' || replace(encode(convert_to((v_creds ->> 'login') || ':' || (v_creds ->> 'password'), 'UTF8'), 'base64'), E'\n', '');
  v_headers := jsonb_build_object('Authorization', v_auth, 'Content-Type', 'application/json');

  INSERT INTO market_demand_runs (kind, scheduled, keywords_sent, requested_by, request_id)
  VALUES ('volumes', p_scheduled, cardinality(v_keywords), p_admin, net.http_post(
    url := v_base || '/v3/keywords_data/google_ads/search_volume/live',
    body := jsonb_build_array(jsonb_build_object(
      'keywords', to_jsonb(v_keywords),
      'location_code', 2398,          -- Казахстан
      'language_code', 'ru',
      'date_from', to_char(date_trunc('month', now()) - interval '24 months', 'YYYY-MM-DD'),
      'search_partners', false)),
    headers := v_headers,
    timeout_milliseconds := 120000))
  RETURNING id INTO v_volumes;

  -- Похожие — в очередь: в ту же секунду DataForSEO второй запрос отклоняет (50301).
  -- Отправит market_demand_collect(), когда объёмы ответят
  INSERT INTO market_demand_runs (kind, scheduled, keywords_sent, requested_by, request_id, attempts)
  VALUES ('ideas', p_scheduled, cardinality(market_demand_idea_seeds()), p_admin, NULL, 0)
  RETURNING id INTO v_ideas;

  RETURN jsonb_build_object('volumes_run', v_volumes, 'ideas_run', v_ideas, 'keywords', cardinality(v_keywords));
END $function$;

-- ── 4. Сбор: очередь и повтор на 50301 ──────────────────────────────────────
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

    SELECT status_code, content, timed_out, error_msg INTO v_resp FROM net._http_response WHERE id = r.request_id;
    IF FOUND THEN
      -- «Too many requests» у похожих — ещё раз через минуту, всего до трёх попыток
      v_code := NULL;
      BEGIN
        v_code := coalesce(nullif(v_resp.content::jsonb ->> 'status_code', '20000'),
                           v_resp.content::jsonb -> 'tasks' -> 0 ->> 'status_code')::integer;
      EXCEPTION WHEN others THEN
        v_code := NULL;
      END;
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
  RETURN v_done;
END $function$;

-- ── 5. Проверка ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'market_demand_request') <> 1
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'market_demand_collect') <> 1
     OR (SELECT count(*) FROM pg_proc WHERE proname = 'market_demand_send_ideas') <> 1 THEN
    RAISE EXCEPTION 'функции спроса — не ровно одна версия';
  END IF;
  IF has_function_privilege('anon', 'public.market_demand_send_ideas(bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.market_demand_send_ideas(bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'market_demand_send_ideas открыта наружу';
  END IF;
END $$;

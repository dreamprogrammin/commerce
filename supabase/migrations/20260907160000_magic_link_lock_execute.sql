-- =====================================================================================
-- MAGIC LINKS: закрыть generate_magic_link от публичного вызова
-- =====================================================================================
-- НАЙДЕНО аудитом 7 сентября 2026.
--
-- `generate_magic_link(p_user_id, p_redirect_path)` — SECURITY DEFINER: она
-- вставляет строку в `magic_links` в обход RLS, потому что её задумывали
-- звать ТОЛЬКО из триггеров уведомлений (комментарий в исходной миграции:
-- «Только service role»). Но EXECUTE у неё остался по умолчанию — PUBLIC.
-- Роли `anon` и `authenticated` (это ПУБЛИЧНЫЙ anon-ключ, он лежит в разметке
-- боевого сайта) могут вызвать её с ЛЮБЫМ `p_user_id` и получить рабочий
-- токен входа для чужого аккаунта.
--
-- Проверено на локальной копии прод-данных: вызов PostgREST с anon-ключом
-- вернул `https://uhti.kz/auth/magic?token=…` для чужого user_id. Дальше этот
-- токен меняется на сессию через /api/auth/magic — это захват аккаунта.
-- user_id при этом достаётся публично: `product_reviews` отдаёт `user_id`
-- анониму (проверено на проде).
--
-- ЧТО ДЕЛАЕМ. Отзываем EXECUTE у PUBLIC, anon и authenticated. Легитимные
-- вызовы идут из SECURITY DEFINER триггеров, работающих от `postgres`, — их
-- это не касается. Отдельно даём EXECUTE `service_role`: серверный код (эдж и
-- Nitro) ходит под ним, и пусть путь остаётся, если понадобится.
-- =====================================================================================

REVOKE EXECUTE ON FUNCTION public.generate_magic_link(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_magic_link(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_magic_link(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_magic_link(UUID, TEXT) TO service_role;


-- =====================================================================================
-- Заодно урезаем права на саму таблицу
-- =====================================================================================
-- RLS включена и политик ноль, поэтому строки через PostgREST и так не отдаются
-- и не пишутся. Но у anon/authenticated висят INSERT/UPDATE/DELETE/TRUNCATE —
-- раздача по умолчанию, которую никто не отзывал. Это защита в глубину: если
-- где-то ошибочно появится RLS-политика, широкие гранты выстрелят. Триггеры
-- пишут как `postgres` (владелец таблицы), серверный код — как `service_role`,
-- их не трогаем.

REVOKE ALL ON TABLE public.magic_links FROM anon;
REVOKE ALL ON TABLE public.magic_links FROM authenticated;

-- =====================================================================================
-- ПРОВЕРКА: у anon и authenticated права больше нет
-- =====================================================================================

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.generate_magic_link(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon всё ещё может звать generate_magic_link';
  END IF;

  IF has_function_privilege('authenticated', 'public.generate_magic_link(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated всё ещё может звать generate_magic_link';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.generate_magic_link(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role потерял доступ — сломается серверный путь';
  END IF;

  IF has_table_privilege('anon', 'public.magic_links', 'INSERT') THEN
    RAISE EXCEPTION 'anon всё ещё может писать в magic_links';
  END IF;

  RAISE NOTICE '✅ generate_magic_link и таблица magic_links закрыты от публичного доступа';
END $$;

NOTIFY pgrst, 'reload schema';

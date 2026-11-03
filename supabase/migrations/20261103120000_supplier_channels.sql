-- ============================================================================
-- Каналы поставщиков в Telegram.
--
-- Зачем (3 ноября 2026). Поставщики выкладывают фото товаров в Telegram-каналы,
-- и отбор товаров по спросу (docs/HANDOFF.md, шапка 3.11) будет читать их.
-- Владелец: «сделай открытый интерфейс, чтобы я без кода мог добавлять новых
-- поставщиков» — каналы заводятся в карточке поставщика в админке
-- («Поставщики» → «Каналы в Telegram»), а не присылаются в чат.
--
-- Как устроено:
--   * supplier_channels — канал поставщика. Открытый — по имени (t.me/<имя>);
--     закрытый — по коду приглашения (t.me/+<код>), читать его сможет только
--     аккаунт-участник. Ровно одно из двух;
--   * имя — в нижнем регистре: у Telegram имена без учёта регистра; код
--     приглашения — как есть, в нём регистр значим. Один канал — у одного
--     поставщика;
--   * title, chat_type, web_preview — что Telegram показал при добавлении:
--     название, канал это или группа, видны ли посты без аккаунта на
--     t.me/s/<имя>. Проверяет сервер админки (server/utils/telegramWeb.ts),
--     браузеру на слово не верим;
--   * удаление поставщика удаляет и его каналы;
--   * таблица закрыта RLS без политик, гостю и покупателю прав нет: читает и
--     пишет её сервер админки ключом сервиса после requireAdmin
--     (/api/admin/suppliers/channels*).
--
-- Проверка — supabase/tests/test_supplier_channels.sql.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_channels') IS NOT NULL THEN
    RAISE EXCEPTION 'supplier_channels уже существует — миграция применялась?';
  END IF;
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'id') IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'нет таблицы suppliers с id uuid';
  END IF;
END $$;

-- ── 1. Таблица ──────────────────────────────────────────────────────────────
CREATE TABLE public.supplier_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  -- Открытый канал: имя без @, в нижнем регистре
  username text UNIQUE CHECK (username ~ '^[a-z][a-z0-9_]{3,31}$'),
  -- Закрытый: код из ссылки-приглашения t.me/+<код>
  invite_hash text UNIQUE CHECK (invite_hash ~ '^[A-Za-z0-9_-]{10,64}$'),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  chat_type text NOT NULL CHECK (chat_type IN ('channel', 'group')),
  -- Посты видны без аккаунта на t.me/s/<имя>
  web_preview boolean NOT NULL DEFAULT false,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT supplier_channels_one_link CHECK ((username IS NULL) <> (invite_hash IS NULL)),
  -- Без аккаунта читается только открытый канал
  CONSTRAINT supplier_channels_preview_public CHECK (NOT web_preview OR (username IS NOT NULL AND chat_type = 'channel'))
);
CREATE INDEX supplier_channels_supplier_id_idx ON public.supplier_channels (supplier_id);

COMMENT ON TABLE public.supplier_channels IS
  'Каналы поставщиков в Telegram — источник отбора товаров по спросу. Заводятся в админке «Поставщики».';

ALTER TABLE public.supplier_channels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supplier_channels FROM anon, authenticated;
GRANT ALL ON public.supplier_channels TO service_role;

-- ── 2. Проверка результата ──────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.supplier_channels'::regclass) THEN
    RAISE EXCEPTION 'у supplier_channels не включён RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_channels') THEN
    RAISE EXCEPTION 'у supplier_channels есть политики — таблица должна быть закрыта';
  END IF;
  IF has_table_privilege('anon', 'public.supplier_channels', 'SELECT')
     OR has_table_privilege('authenticated', 'public.supplier_channels', 'SELECT')
     OR has_table_privilege('authenticated', 'public.supplier_channels', 'INSERT') THEN
    RAISE EXCEPTION 'supplier_channels доступна гостю или покупателю';
  END IF;
END $$;

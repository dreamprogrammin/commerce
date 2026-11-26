-- ============================================================================
-- Тексты ИИ для товара поставщика сохраняются (26 ноября 2026)
--
-- Владелец 26.11: «генерация описания должна происходить после нажатия кнопки
-- сгенерировать, потому что будут ситуации, когда я не захочу добавлять такой
-- товар, а токены были уже потрачены. И контент, который был сгенерирован,
-- должен сохраняться даже после перезагрузки страницы».
--
-- Форма «Новый товар» (pages/admin/products/new.vue) больше не зовёт ИИ сама,
-- только кнопкой «Сгенерировать». Ответ сервер сайта кладёт к товару
-- поставщика — как прочитанное (read_items) и разбор (demand_guess). После
-- перезагрузки, на другом устройстве и когда вкладку закрыли, пока ИИ писал,
-- форма берёт сохранённое, и токены второй раз не тратятся.
--
--   • supplier_offers.written_texts — {"<номер товара в посте>": {ответ ИИ}}:
--     name, description, seoDescription, category, brand, newBrand, warnings,
--     model, photo, usage и writtenAt. Остаток бюджета на момент ответа не
--     хранится: он устаревает. NULL — ещё не писали. Пишет
--     server/utils/contentWriter.ts, читает /api/admin/supplier-offers/draft.
--
-- Политик и прав не меняет: таблицу читает и пишет только сервер ключом
-- сервиса (20261104160000_supplier_offers).
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.supplier_offers') IS NULL THEN
    RAISE EXCEPTION 'нет supplier_offers — сначала 20261104160000_supplier_offers';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_offers'
               AND column_name = 'written_texts') THEN
    RAISE EXCEPTION 'supplier_offers.written_texts уже есть — миграция применялась?';
  END IF;
END $$;

-- ── 1. Сохранённые тексты ────────────────────────────────────────────────────
-- Предел — с запасом: описание по формату сайта занимает 2–5 КБ, а товаров в
-- посте бывает до десятка
ALTER TABLE public.supplier_offers
  ADD COLUMN written_texts jsonb
    CHECK (written_texts IS NULL
           OR (jsonb_typeof(written_texts) = 'object' AND octet_length(written_texts::text) <= 200000));

COMMENT ON COLUMN public.supplier_offers.written_texts IS
  'Тексты для сайта от ИИ по товарам поста: {"<номер товара>": {name, description, seoDescription, category, brand, newBrand, warnings, model, photo, usage, writtenAt}}. NULL — не писали. Пишет server/utils/contentWriter.ts (26.11.2026).';

-- ── 2. Проверка результата ───────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'supplier_offers'
                   AND column_name = 'written_texts' AND data_type = 'jsonb') THEN
    RAISE EXCEPTION 'supplier_offers.written_texts не появилась';
  END IF;
END $$;

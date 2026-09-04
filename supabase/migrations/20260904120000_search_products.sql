-- =====================================================================================
-- ПОИСК ПО КАТАЛОГУ: транслитерация, слова в любом порядке, опечатки
-- =====================================================================================
-- ЧТО БЫЛО. Поиск шёл клиентским запросом `name ILIKE %запрос%` — подстрокой и
-- целиком. Проверено на боевых данных 4 сентября 2026:
--
--   «лего»             0 товаров, «lego» — 22 (они называются латиницей)
--   «лол», «хот вилс»  0
--   «машинки»          3, «машинка» — 15
--   «конструктор лего» 0 (искалось как одна строка)
--   «кукла, лол»       ОШИБКА: запятая — разделитель в PostgREST `or=()`,
--                      покупатель видел «Ошибка при поиске»
--
-- ЧТО ДЕЛАЕМ. Обе стороны — и запрос, и текст товара — приводим к одному виду:
-- нижний регистр, кириллица транслитерируется в латиницу, всё остальное
-- превращается в пробелы. Тогда «лего» и «LEGO» становятся одним словом `lego`,
-- а запятая перестаёт что-либо значить.
--
-- Слова запроса ищутся ПО ОТДЕЛЬНОСТИ и все сразу (И, а не ИЛИ): «конструктор
-- лего» находит товар, где эти слова в любом порядке и не подряд.
--
-- Словоформы ловятся обрезкой окончания: «машинки» ищется и как начало слова
-- «mashin», «куклы» — как «kukl». Опечатки добирает pg_trgm
-- (`strict_word_similarity`). Оба приёма включаются только для слов от 5 букв.
--
-- Пороги подобраны на боевых данных, а не на глаз. Обычный `word_similarity`
-- пришлось отвергнуть: на запросе «лего» он давал 0.60 радиоуправляемому такси
-- и кукле DEFA (совпадало «легко» внутри описания) — половина выдачи была
-- мусором. `strict_word_similarity` на том же мусоре даёт 0.38, а на настоящих
-- словоформах («машинки» → «машинка») 0.64.
-- =====================================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =====================================================================================
-- Приведение к общему виду
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.search_normalize(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT trim(regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'абвгдезийклмнопрстуфхцыэ',
      'abvgdezijklmnoprstufhcye'
    ),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

COMMENT ON FUNCTION public.search_normalize(TEXT) IS
'Приводит запрос и текст товара к одному виду: нижний регистр, кириллица в
латиницу, прочие символы в пробелы. Многобуквенные звуки (ж, ч, ш, щ, ю, я, ё,
х) переводятся отдельно — translate работает посимвольно.';

/*
 * Многобуквенные соответствия translate не умеет — он посимвольный. Поэтому
 * поверх него отдельная обёртка: сперва меняем «ж→zh», «ч→ch» и прочие, затем
 * посимвольное отображение выше.
 */
CREATE OR REPLACE FUNCTION public.search_key(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT public.search_normalize(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(
      lower(coalesce(p_text, '')),
      'ё', 'e'), 'ж', 'zh'), 'ч', 'ch'), 'ш', 'sh'), 'щ', 'sch'),
      'ю', 'yu'), 'я', 'ya'), 'ь', ''), 'ъ', '')
  )
$$;

COMMENT ON FUNCTION public.search_key(TEXT) IS
'Ключ для поиска: то же, что search_normalize, но сперва разложены буквы,
которым нужны две латинские (ж, ч, ш, щ, ю, я) и убраны мягкий и твёрдый знаки.';

-- =====================================================================================
-- Поиск товаров
-- =====================================================================================

DROP FUNCTION IF EXISTS public.search_products(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.search_products(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  price NUMERIC,
  discount_percentage NUMERIC,
  stock_quantity INTEGER,
  category_id UUID,
  brand JSONB,
  images JSONB,
  rank INTEGER
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH query AS (
    SELECT
      public.search_key(p_query) AS whole,
      -- Пустые элементы отсеиваем: «лего,,» не должно давать пустое слово,
      -- которому подходит что угодно.
      array_remove(string_to_array(public.search_key(p_query), ' '), '') AS words
  ),
  candidates AS (
    SELECT
      p.id,
      p.name,
      p.slug,
      p.price,
      p.discount_percentage,
      p.stock_quantity,
      p.category_id,
      p.brand_id,
      p.sales_count,
      public.search_key(p.name) AS name_key,
      public.search_key(coalesce(b.name, '')) AS brand_key,
      public.search_key(
        p.name || ' ' || coalesce(b.name, '') || ' ' || coalesce(p.description, '')
      ) AS full_key
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE p.is_active = true
  ),
  matched AS (
    SELECT
      c.*,
      (SELECT q.whole FROM query q) AS q_whole
    FROM candidates c
    WHERE
      (SELECT cardinality(q.words) FROM query q) > 0
      AND NOT EXISTS (
        -- Каждое слово запроса должно найтись: подстрокой либо похожим на
        -- слово из текста. Ищем слово, которое НЕ нашлось, — если такого нет,
        -- товар подходит.
        SELECT 1
        FROM unnest((SELECT q.words FROM query q)) AS w
        WHERE position(w IN c.full_key) = 0
          -- Слово без окончания: «kukly» → «kukl» в начале слова текста.
          AND NOT (
            length(w) >= 5
            AND c.full_key ~ ('(^|[^a-z0-9])' || left(w, greatest(4, length(w) - 2)))
          )
          -- Опечатка: сравнение по целым словам, не по кускам.
          AND NOT (length(w) >= 5 AND strict_word_similarity(w, c.full_key) >= 0.55)
      )
  )
  SELECT
    m.id,
    m.name,
    m.slug,
    m.price,
    m.discount_percentage,
    m.stock_quantity,
    m.category_id,
    CASE WHEN m.brand_id IS NULL THEN NULL ELSE (
      SELECT to_jsonb(x) FROM (
        SELECT b.id, b.name, b.slug FROM public.brands b WHERE b.id = m.brand_id
      ) x
    ) END AS brand,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'image_url', pi.image_url,
        'blur_placeholder', pi.blur_placeholder
      ) ORDER BY pi.display_order NULLS LAST)
      FROM public.product_images pi
      WHERE pi.product_id = m.id
    ), '[]'::jsonb) AS images,
    /*
     * Ранжирование. Название важнее описания: по запросу «кукла» сначала
     * должны идти куклы, а не наборы, где слово встретилось в тексте.
     */
    (CASE WHEN position(m.q_whole IN m.name_key) > 0 THEN 100 ELSE 0 END
      + CASE WHEN position(m.q_whole IN m.brand_key) > 0 THEN 50 ELSE 0 END
      + (
        SELECT count(*) * 10
        FROM unnest((SELECT q.words FROM query q)) AS w
        WHERE position(w IN m.name_key) > 0
      ))::INTEGER AS rank
  FROM matched m
  ORDER BY rank DESC, m.sales_count DESC NULLS LAST, m.name
  LIMIT greatest(coalesce(p_limit, 20), 1)
$$;

COMMENT ON FUNCTION public.search_products(TEXT, INTEGER) IS
'Поиск товаров: транслитерация кириллицы, слова в любом порядке, устойчивость к
словоформам и опечаткам. Заменил клиентский ILIKE, который не находил «лего» и
падал на запятой в запросе.';

-- =====================================================================================
-- Поиск брендов (подсказки над списком товаров)
-- =====================================================================================

DROP FUNCTION IF EXISTS public.search_brands(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.search_brands(
  p_query TEXT,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (id UUID, name TEXT, slug TEXT)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT b.id, b.name, b.slug
  FROM public.brands b
  WHERE public.search_key(p_query) <> ''
    AND (
      position(public.search_key(p_query) IN public.search_key(b.name)) > 0
      OR (length(public.search_key(p_query)) >= 4
          AND word_similarity(public.search_key(p_query), public.search_key(b.name)) >= 0.6)
    )
  ORDER BY length(b.name)
  LIMIT greatest(coalesce(p_limit, 3), 1)
$$;

COMMENT ON FUNCTION public.search_brands(TEXT, INTEGER) IS
'Подсказки брендов для поиска. «лего» находит LEGO — сравнение идёт по
транслитерированному ключу.';

-- =====================================================================================
-- Права: поиск доступен всем, в том числе гостю
-- =====================================================================================

GRANT EXECUTE ON FUNCTION public.search_normalize(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_key(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_brands(TEXT, INTEGER) TO anon, authenticated;

-- =====================================================================================
-- Индекс под нечёткое сравнение
-- =====================================================================================

CREATE INDEX IF NOT EXISTS idx_products_name_trgm
  ON public.products USING gin (name gin_trgm_ops);

-- =====================================================================================
-- ПРОВЕРКА: осталось по одной версии каждой функции
-- =====================================================================================

DO $$
DECLARE
  v_products INTEGER;
  v_brands INTEGER;
BEGIN
  SELECT count(*) INTO v_products FROM pg_proc WHERE proname = 'search_products';
  SELECT count(*) INTO v_brands FROM pg_proc WHERE proname = 'search_brands';

  IF v_products <> 1 THEN
    RAISE EXCEPTION 'Ожидалась одна версия search_products, найдено %', v_products;
  END IF;

  IF v_brands <> 1 THEN
    RAISE EXCEPTION 'Ожидалась одна версия search_brands, найдено %', v_brands;
  END IF;

  RAISE NOTICE '✅ Поиск по каталогу обновлён';
END $$;

NOTIFY pgrst, 'reload schema';

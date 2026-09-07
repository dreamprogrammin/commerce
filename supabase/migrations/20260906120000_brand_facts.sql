-- Короткая справка о бренде: страна, компания, год основания, серии.
--
-- Макет «Бренд.dc.html» показывает её отдельной карточкой рядом с описанием:
-- список пар «ключ → значение», шесть строк у CaDA. В таблице `brands` таких
-- полей не было вовсе.
--
-- Одна jsonb-колонка, а не таблица `brand_facts`. Причины:
--
--  • это произвольные пары, у разных брендов разный набор. У конструкторов
--    уместны «Материал» и «Возраст», у кукол — «Серии» и «Лицензия».
--    Фиксированные колонки пришлось бы то добавлять, то оставлять пустыми;
--  • их единицы, и они всегда читаются целиком вместе с брендом. Отдельная
--    таблица дала бы join ради шести строк на каждой странице бренда;
--  • порядок важен и задаётся автором — в массиве он естественный, в таблице
--    потребовал бы колонку сортировки.
--
-- Формат: массив объектов `{ "k": "Страна", "v": "Китай" }`. Именно массив,
-- а не объект: у объекта порядок ключей в JSON не гарантирован, а карточка
-- показывает строки в заданной последовательности.
--
-- Пустой массив по умолчанию, а не NULL: витрине тогда не нужна проверка на
-- null перед перебором, а «фактов нет» и «поле не заполнено» — для этой
-- карточки одно и то же.

-- ---------------------------------------------------------------------------
-- Проверка состояния: та ли база и не занято ли имя.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.brands') IS NULL THEN
    RAISE EXCEPTION 'Нет таблицы public.brands — база не та, под которую готовилась миграция';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'facts'
  ) THEN
    RAISE EXCEPTION 'Колонка brands.facts уже существует — правка готовилась под её отсутствие';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Колонка.
-- ---------------------------------------------------------------------------
ALTER TABLE public.brands
  ADD COLUMN facts jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.brands.facts IS
  'Короткая справка для карточки «Коротко о бренде»: [{"k":"Страна","v":"Китай"}, …]. Массив, порядок строк значим.';

-- Форму значения стережёт база, а не только админка: массив объектов с
-- непустыми строковыми `k` и `v`. Без этого одна опечатка в форме роняла бы
-- отрисовку карточки у всех посетителей.
--
-- Через IMMUTABLE-функцию, а не выражением в CHECK напрямую: PostgreSQL не
-- принимает подзапросы в ограничениях («cannot use subquery in check
-- constraint»), а обойти перебор массива без подзапроса нельзя.
CREATE OR REPLACE FUNCTION public.is_valid_brand_facts(v jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  -- coalesce обязателен: у отсутствующего ключа `jsonb_typeof` возвращает
  -- NULL, сравнение даёт NULL вместо TRUE, и NOT EXISTS такую строку не
  -- считает нарушением. Проверено запуском: без него `[{"k":"Страна"}]`
  -- без значения проходило как корректное.
  SELECT jsonb_typeof(v) = 'array'
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v) AS f
       WHERE coalesce(jsonb_typeof(f), 'null') <> 'object'
          OR coalesce(jsonb_typeof(f -> 'k'), 'null') <> 'string'
          OR coalesce(jsonb_typeof(f -> 'v'), 'null') <> 'string'
          OR length(btrim(coalesce(f ->> 'k', ''))) = 0
          OR length(btrim(coalesce(f ->> 'v', ''))) = 0
     );
$function$;

ALTER TABLE public.brands
  ADD CONSTRAINT brands_facts_is_array_of_pairs
  CHECK (public.is_valid_brand_facts(facts));

-- ---------------------------------------------------------------------------
-- Контроль: колонка на месте, ограничение работает в обе стороны.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  ok boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'facts'
  ) THEN
    RAISE EXCEPTION 'Колонка brands.facts не создалась';
  END IF;

  -- Функция обязана принимать корректное и отвергать мусор.
  IF NOT public.is_valid_brand_facts('[{"k":"Страна","v":"Китай"}]'::jsonb) THEN
    RAISE EXCEPTION 'Проверка формата отвергает корректное значение';
  END IF;

  IF public.is_valid_brand_facts('"строка"'::jsonb)
     OR public.is_valid_brand_facts('[{"k":"Страна"}]'::jsonb)
     OR public.is_valid_brand_facts('[{"k":"","v":"Китай"}]'::jsonb)
     OR public.is_valid_brand_facts('[{"k":"Страна","v":42}]'::jsonb) THEN
    RAISE EXCEPTION 'Проверка формата пропускает недопустимое значение';
  END IF;
END $$;

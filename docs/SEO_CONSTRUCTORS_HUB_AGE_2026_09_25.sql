-- Описание хаба «Конструкторы» в выдаче: «от 2 лет» → «от 3 лет».
--
-- ЧТО НЕ ТАК. 23 сентября 2026 (docs/SEO_LEGO_RC_2026_09_23.sql) вступление
-- описания хаба стало «Детские конструкторы в Алматы — для мальчиков и
-- девочек от 2 лет». Тогда это совпадало с карточками: у Smoneo 55013 «Школа»
-- и 55015 «Отель в джунглях» стояло 2+. 24 сентября их поправили по коробке
-- на 3+ (docs/PRODUCT_AGE_TEXT_2026_09_24.sql), и с тех пор самый младший
-- конструктор ветки — с 3 лет: младше нет ни среди активных, ни среди снятых
-- (проверено 25 сентября). В выдаче эта строка идёт первой: «…от 2 лет.
-- 33 модели от 5 890 ₸. …» — цифры после неё страница считает сама, а
-- вступление берёт из базы, поэтому правится здесь.
--
-- ЧТО ДЕЛАЕТ. Меняет одно поле — categories.meta_description хаба
-- (constructors-root). Пишет, только если:
--   • поле ровно такое, как 25 сентября (md5 2790d301…);
--   • самый младший активный конструктор ветки — с 36 месяцев.
-- Иначе — ошибка, и не меняется ничего. Повторный запуск — «Уже сделано».
--
-- КАК ЗАПУСТИТЬ. SQL-редактор Supabase: вставить файл целиком, Run.

DO $$
DECLARE
  old_text constant text := 'Детские конструкторы в Алматы — для мальчиков и девочек от 2 лет';
  new_text constant text := 'Детские конструкторы в Алматы — для мальчиков и девочек от 3 лет';
  cur text;
  youngest int;
BEGIN
  SELECT meta_description INTO cur FROM public.categories WHERE slug = 'constructors-root';

  IF cur = new_text THEN
    RAISE NOTICE 'Уже сделано: %', cur;
    RETURN;
  END IF;

  IF cur IS DISTINCT FROM old_text OR md5(cur) <> '2790d30124dbc28bb4e50a2c0e5011b7' THEN
    RAISE EXCEPTION 'Описание хаба не то, под которое готовился файл: %', cur;
  END IF;

  WITH RECURSIVE branch AS (
    SELECT id FROM public.categories WHERE slug = 'constructors-root'
    UNION
    SELECT c.id FROM public.categories c JOIN branch b ON c.parent_id = b.id
  )
  SELECT min(p.min_age_months) INTO youngest
  FROM public.products p
  WHERE p.is_active AND p.category_id IN (SELECT id FROM branch);

  IF youngest IS DISTINCT FROM 36 THEN
    RAISE EXCEPTION 'Самый младший конструктор — % мес., а не 36: «от 3 лет» было бы неправдой', youngest;
  END IF;

  UPDATE public.categories SET meta_description = new_text WHERE slug = 'constructors-root';
  RAISE NOTICE 'Готово: %', new_text;
END $$;

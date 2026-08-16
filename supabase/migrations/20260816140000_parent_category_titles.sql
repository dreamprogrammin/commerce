-- Развести title у двух родительских категорий и их детей.
--
-- Обход всех 309 адресов sitemap оставил две группы одинаковых title:
--
--   «Куклы для девочек — купить в Казахстане | Ухтышка»
--        /catalog/girls/kukly                  и  /catalog/girls/kukly/kukly-dlya-devochek
--   «Питомцы для девочек — купить в Казахстане | Ухтышка»
--        /catalog/girls/pitomcy                и  /catalog/girls/pitomcy/pitomcy-syurprizy
--
-- Причина — данные: `seo_title` у ребёнка буквально скопирован с родителя.
--
-- Важно, чем это НЕ является. Родитель не дублирует ребёнка, а включает его:
--
--   kukly     19 товаров (4 подкатегории)  ->  kukly-dlya-devochek   12
--   pitomcy    3 товара  (2 подкатегории)  ->  pitomcy-syurprizy      2
--
-- У родителя `kukly` есть семь товаров, которых у ребёнка нет вовсе:
-- наборы-сюрпризы L.O.L. Surprise, интерактивные и реборн-куклы. Поэтому
-- canonical с родителя на ребёнка тут делать НЕЛЬЗЯ — он выбросил бы из
-- индекса более полную страницу. Рассматривалось и отклонено осознанно.
--
-- Меняется только заголовок и только у родителей: детей не трогаем, одной
-- стороны достаточно, чтобы пара перестала совпадать.
--
-- Область действия узкая. Поле читается в одном месте
-- (pages/catalog/[...slug].vue:1253) и оттуда уходит в <title>, og:title,
-- twitter:title и name в JSON-LD. H1 берётся из seo_h1 и не затрагивается,
-- адреса, меню, крошки, фильтры и выдача товаров поля не читают.
--
-- Формулировки — перечень реальных подкатегорий, 49 и 48 знаков при пороге 60.

-- ---------------------------------------------------------------------------
-- Проверка состояния.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_found INTEGER;
  n_filled INTEGER;
BEGIN
  SELECT count(*) INTO n_found
  FROM categories
  WHERE slug IN ('kukly', 'pitomcy');

  IF n_found <> 2 THEN
    RAISE EXCEPTION 'Найдено категорий kukly/pitomcy: %, ожидалось 2', n_found;
  END IF;

  -- Затирать чужую ручную правку нельзя.
  SELECT count(*) INTO n_filled
  FROM categories
  WHERE slug IN ('kukly', 'pitomcy') AND meta_title IS NOT NULL;

  IF n_filled <> 0 THEN
    RAISE EXCEPTION 'У % из двух категорий meta_title уже заполнен — правка готовилась под пустое поле', n_filled;
  END IF;

  -- Смысл правки в том, что у родителя есть свои товары помимо детских.
  -- Если это перестало быть так, формулировки надо пересматривать.
  IF NOT EXISTS (
    SELECT 1 FROM categories parent
    JOIN categories child ON child.parent_id = parent.id
    WHERE parent.slug = 'kukly'
    GROUP BY parent.id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'У kukly больше не несколько подкатегорий — заголовок «Barbie, LOL и другие» перестал быть верным';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Заголовки.
-- ---------------------------------------------------------------------------
UPDATE categories
SET meta_title = 'Куклы для девочек: Barbie, LOL и другие | Ухтышка'
WHERE slug = 'kukly';

UPDATE categories
SET meta_title = 'Питомцы для девочек: сюрпризы и мягкие | Ухтышка'
WHERE slug = 'pitomcy';

-- ---------------------------------------------------------------------------
-- Контроль: заполнены оба, длина в норме, с детьми больше не совпадают.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_set INTEGER;
  n_long INTEGER;
  n_clash INTEGER;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE length(meta_title) > 60)
  INTO n_set, n_long
  FROM categories
  WHERE slug IN ('kukly', 'pitomcy') AND meta_title IS NOT NULL;

  IF n_set <> 2 THEN
    RAISE EXCEPTION 'meta_title проставлен у % категорий из 2', n_set;
  END IF;

  IF n_long <> 0 THEN
    RAISE EXCEPTION 'Заголовков длиннее 60 знаков: %', n_long;
  END IF;

  -- Страница показывает meta_title, а при его отсутствии — seo_title.
  -- Сверяем родителя с детьми именно по этому правилу.
  SELECT count(*) INTO n_clash
  FROM categories parent
  JOIN categories child ON child.parent_id = parent.id
  WHERE parent.slug IN ('kukly', 'pitomcy')
    AND COALESCE(parent.meta_title, parent.seo_title)
      = COALESCE(child.meta_title, child.seo_title);

  IF n_clash <> 0 THEN
    RAISE EXCEPTION 'Осталось совпадений заголовка родителя с ребёнком: %', n_clash;
  END IF;
END $$;

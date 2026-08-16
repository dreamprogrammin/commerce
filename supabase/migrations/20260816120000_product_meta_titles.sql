-- Развести title у двух пар товаров-близнецов.
--
-- Обход всех 309 адресов sitemap нашёл четыре группы одинаковых title.
-- Две из них — товары, которые отличаются только цветом, а названия у них
-- совпадают в первых 48 знаках:
--
--   Радиоуправляемая машина-перевёртыш MOKA STUNT BIG 2053R красная — …
--   Радиоуправляемая машина-перевёртыш MOKA STUNT BIG 2053B синяя  — …
--   Игровая палатка-домик XHDZP FLOWER 130×100×130 см — розовый …
--   Игровая палатка-домик XHDZP FLOWER 130×100×130 см — голубой …
--
-- Генератор (utils/seoTitle.ts) режет название на 48 знаках: 48 + суффикс
-- ' | Ухтышка' = 58, чтобы уложиться в 60, после которых Google обрезает
-- заголовок сам. Различающая часть у этих пар начинается позже: одно только
-- «…MOKA STUNT BIG 2053R» — уже 55 знаков. Кодом это не решается: чтобы
-- различие попало в заголовок, его нужно поставить в начало, а это
-- редакторская работа, а не правило.
--
-- Поэтому заполняется meta_title. Карточка товара берёт его как есть
-- (pages/catalog/products/[slug].vue:491), в обход генератора.
--
-- Формулировки укладываются в 60 знаков: 52, 50, 52 и 52.
--
-- Категорийные дубли (`kukly` / `kukly-dlya-devochek` и `pitomcy` /
-- `pitomcy-syurprizy`) этой миграцией НЕ трогаются намеренно. Там у родителя
-- ноль собственных товаров, и он показывает ассортимент ребёнка рекурсивно,
-- то есть страницы дублируют друг друга и содержимым. Разные заголовки это
-- не чинят, решение по структуре за владельцем.

-- ---------------------------------------------------------------------------
-- Проверка состояния: те ли это товары и не заполнено ли поле руками.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_found INTEGER;
  n_filled INTEGER;
BEGIN
  SELECT count(*) INTO n_found
  FROM products
  WHERE slug IN (
    'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053r-krasnaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
    'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053b-sinyaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
    'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-rozovyy-domik-iz-vodonepronicaemogo-poliestera-dlya-devochek',
    'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-goluboy-domik-iz-vodonepronicaemogo-poliestera-dlya-malchikov'
  );

  IF n_found <> 4 THEN
    RAISE EXCEPTION 'Найдено товаров по слагам: %, ожидалось 4 — слаги разошлись с базой', n_found;
  END IF;

  -- Если кто-то уже вписал meta_title руками, затирать его нельзя.
  SELECT count(*) INTO n_filled
  FROM products
  WHERE meta_title IS NOT NULL
    AND slug IN (
      'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053r-krasnaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
      'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053b-sinyaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
      'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-rozovyy-domik-iz-vodonepronicaemogo-poliestera-dlya-devochek',
      'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-goluboy-domik-iz-vodonepronicaemogo-poliestera-dlya-malchikov'
    );

  IF n_filled <> 0 THEN
    RAISE EXCEPTION 'У % из четырёх товаров meta_title уже заполнен — правка готовилась под пустое поле', n_filled;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Заголовки. Различающая часть вынесена в начало, лишние подробности убраны.
-- ---------------------------------------------------------------------------
UPDATE products
SET meta_title = 'Машина-перевёртыш MOKA STUNT 2053R красная | Ухтышка'
WHERE slug = 'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053r-krasnaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let';

UPDATE products
SET meta_title = 'Машина-перевёртыш MOKA STUNT 2053B синяя | Ухтышка'
WHERE slug = 'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053b-sinyaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let';

UPDATE products
SET meta_title = 'Палатка-домик XHDZP FLOWER розовая 130×100 | Ухтышка'
WHERE slug = 'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-rozovyy-domik-iz-vodonepronicaemogo-poliestera-dlya-devochek';

UPDATE products
SET meta_title = 'Палатка-домик XHDZP FLOWER голубая 130×100 | Ухтышка'
WHERE slug = 'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-goluboy-domik-iz-vodonepronicaemogo-poliestera-dlya-malchikov';

-- ---------------------------------------------------------------------------
-- Контроль: заполнены все четыре, заголовки различны, в 60 знаков влезают.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_set INTEGER;
  n_distinct INTEGER;
  n_long INTEGER;
BEGIN
  SELECT count(*), count(DISTINCT meta_title), count(*) FILTER (WHERE length(meta_title) > 60)
  INTO n_set, n_distinct, n_long
  FROM products
  WHERE meta_title IS NOT NULL
    AND slug IN (
      'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053r-krasnaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
      'radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053b-sinyaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let',
      'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-rozovyy-domik-iz-vodonepronicaemogo-poliestera-dlya-devochek',
      'igrovaya-palatka-domik-xhdzp-flower-130x100x130-sm-goluboy-domik-iz-vodonepronicaemogo-poliestera-dlya-malchikov'
    );

  IF n_set <> 4 THEN
    RAISE EXCEPTION 'meta_title проставлен у % товаров из 4', n_set;
  END IF;

  IF n_distinct <> 4 THEN
    RAISE EXCEPTION 'Среди четырёх заголовков только % различных — дубль остался', n_distinct;
  END IF;

  IF n_long <> 0 THEN
    RAISE EXCEPTION 'Заголовков длиннее 60 знаков: %', n_long;
  END IF;
END $$;

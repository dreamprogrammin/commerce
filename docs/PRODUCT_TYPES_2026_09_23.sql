-- ═══════════════════════════════════════════════════════════════════════════
--  Тип товара в четырёх семействах разделов — 23.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. Второй шаг характеристик (первый — PRODUCT_SPECS_2026_09_23.sql,
--  выполнен 23 сентября): «Тип», как «Тип игрушки: монстр-трак» на карточках
--  «Детского мира». У каждого семейства свой атрибут, а не один общий: в
--  админке список вариантов не смешивает «Пирамидку» с «Танком», а старая
--  сборка сайта, которая показывает в фильтре все варианты подряд, не
--  покажет пустых. Варианты — только те, под которые есть хотя бы два
--  товара: ссылка на подборку из одного этого же товара бессмысленна.
--
--  ЧТО ДЕЛАЕТ.
--   1. Заводит «Тип каталки» (толокар, каталка-твистер), «Тип набора»
--      (кухня, доктор, трюмо, магазин), «Тип игрушки» (говорящая книга,
--      детский ноутбук, обучающий планшет, развивающий столик, бизиборд),
--      «Тип куклы» (шарнирная, русалка).
--   2. Привязывает их к разделам — 6 привязок: толокары, игровые наборы,
--      развивающие и «Малышам», куклы для девочек и «Куклы».
--   3. Ставит тип 40 товарам — по названию (utils/productSpecs.ts).
--      Уже заполненное не трогается (ON CONFLICT DO NOTHING).
--
--  Повторный запуск ничего не меняет.
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых значений, с откатом.

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: строка со счётчиками, INSERT 0 4, INSERT 0 13, INSERT 0 6,
--  INSERT 0 40.

BEGIN;

SELECT setval('public.attributes_id_seq',
              GREATEST((SELECT coalesce(max(id), 1) FROM public.attributes),
                       (SELECT last_value FROM public.attributes_id_seq))) AS schetchik_harakteristik,
       setval('public.attribute_options_id_seq',
              GREATEST((SELECT coalesce(max(id), 1) FROM public.attribute_options),
                       (SELECT last_value FROM public.attribute_options_id_seq))) AS schetchik_variantov;

INSERT INTO public.attributes (name, slug, display_type)
VALUES
  ('Тип каталки', 'tip-katalki', 'select'),
  ('Тип набора', 'tip-nabora', 'select'),
  ('Тип игрушки', 'tip-igrushki', 'select'),
  ('Тип куклы', 'tip-kukly', 'select')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.attribute_options (attribute_id, value)
SELECT a.id, v.value
  FROM (VALUES
    (1, 'tip-katalki', 'Толокар'),
    (2, 'tip-katalki', 'Каталка-твистер'),
    (3, 'tip-nabora', 'Кухня'),
    (4, 'tip-nabora', 'Доктор'),
    (5, 'tip-nabora', 'Трюмо'),
    (6, 'tip-nabora', 'Магазин'),
    (7, 'tip-igrushki', 'Говорящая книга'),
    (8, 'tip-igrushki', 'Детский ноутбук'),
    (9, 'tip-igrushki', 'Обучающий планшет'),
    (10, 'tip-igrushki', 'Развивающий столик'),
    (11, 'tip-igrushki', 'Бизиборд'),
    (12, 'tip-kukly', 'Шарнирная кукла'),
    (13, 'tip-kukly', 'Кукла-русалка')
  ) AS v(ord, slug, value)
  JOIN public.attributes a ON a.slug = v.slug
 WHERE NOT EXISTS (SELECT 1 FROM public.attribute_options o WHERE o.attribute_id = a.id AND o.value = v.value)
 ORDER BY v.ord;

INSERT INTO public.category_attributes (category_id, attribute_id)
SELECT c.id, a.id
  FROM (VALUES
    ('tip-katalki', 'tolokar'),
    ('tip-nabora', 'igrovye-nabory'),
    ('tip-igrushki', 'razvivayushchie-igrushki'),
    ('tip-igrushki', 'kiddy'),
    ('tip-kukly', 'kukly-dlya-devochek'),
    ('tip-kukly', 'kukly')
  ) AS v(attr_slug, cat_slug)
  JOIN public.attributes a ON a.slug = v.attr_slug
  JOIN public.categories c ON c.slug = v.cat_slug
ON CONFLICT (category_id, attribute_id) DO NOTHING;

INSERT INTO public.product_attribute_values (product_id, attribute_id, option_id)
SELECT p.id, a.id, o.id
  FROM (VALUES
    ('f1ce7817-b9ef-482b-a153-916d2625da4d', 'tip-igrushki', 'Бизиборд'),
    ('8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8', 'tip-igrushki', 'Развивающий столик'),
    ('11af95cd-d418-4440-b2c0-0fa0642cb411', 'tip-igrushki', 'Обучающий планшет'),
    ('ef3a2353-6536-4fc0-bca6-cd4fe0df335c', 'tip-igrushki', 'Говорящая книга'),
    ('19665d2e-37f1-4965-85cf-fc75d290980a', 'tip-igrushki', 'Говорящая книга'),
    ('caa95577-e819-4df9-b338-e00ad8056aa3', 'tip-igrushki', 'Говорящая книга'),
    ('6ca5ffd6-4181-437a-b00e-853d7f64f42f', 'tip-igrushki', 'Обучающий планшет'),
    ('449d1743-7a40-4b9c-a0ce-cb93f16376cf', 'tip-nabora', 'Кухня'),
    ('feb15cb7-69a4-42c9-9404-d889d6a49d8e', 'tip-igrushki', 'Детский ноутбук'),
    ('e0b46eba-7998-4d40-9e08-a1593eb40c64', 'tip-igrushki', 'Детский ноутбук'),
    ('03037f92-b805-480f-9800-281d5aa2c155', 'tip-igrushki', 'Детский ноутбук'),
    ('a5e041ae-3aa4-4640-9619-981f8003aa56', 'tip-nabora', 'Магазин'),
    ('b41215c6-4969-41a1-bde4-52e6c1842d5c', 'tip-nabora', 'Доктор'),
    ('b016fe78-2585-4f55-b9c0-148164327394', 'tip-nabora', 'Доктор'),
    ('96c6d219-536d-4ee4-9f7a-5faf69aa46db', 'tip-nabora', 'Кухня'),
    ('3b636cf1-ac7b-4c69-ae5a-1520ad9c2fcc', 'tip-nabora', 'Кухня'),
    ('535dec67-b7de-4e3c-97ee-1134e1ae7a74', 'tip-nabora', 'Кухня'),
    ('56531ec2-dda7-4274-97ca-a5986c7b7f2f', 'tip-nabora', 'Кухня'),
    ('31a3f616-0c80-4b39-b7f5-6271b13be717', 'tip-nabora', 'Магазин'),
    ('d8e219a6-7af4-4ed9-982d-f3d5c12b5404', 'tip-nabora', 'Трюмо'),
    ('4b230e7f-ee48-4597-ba7c-cbdf8f46944c', 'tip-nabora', 'Трюмо'),
    ('4dd5375a-3686-4841-9daa-d313d80cda3c', 'tip-katalki', 'Каталка-твистер'),
    ('e8f8393c-0f51-41be-b233-4517cdd1e072', 'tip-katalki', 'Каталка-твистер'),
    ('b9ea8841-041a-427a-9d0b-0b6820800d05', 'tip-katalki', 'Каталка-твистер'),
    ('6384f4a3-6bbf-4ab4-8b72-aafe9f8d83bf', 'tip-kukly', 'Кукла-русалка'),
    ('c5538681-f277-41d9-92e9-bc6c1b4143ca', 'tip-kukly', 'Кукла-русалка'),
    ('b1ba7385-b264-4072-9396-144a1196f6ee', 'tip-kukly', 'Кукла-русалка'),
    ('59a0f9e0-0231-4eaa-bd8a-f6a24adea1a0', 'tip-kukly', 'Кукла-русалка'),
    ('2fec659f-c001-416c-9949-cdd6afd6911c', 'tip-kukly', 'Шарнирная кукла'),
    ('3beca5ac-cc4c-45b9-8150-b5f6f8213e1d', 'tip-kukly', 'Шарнирная кукла'),
    ('80e16267-bd63-486b-a852-67ce7b694e60', 'tip-kukly', 'Шарнирная кукла'),
    ('ee31412a-e04a-46b2-9d8c-8f70af12f7de', 'tip-kukly', 'Шарнирная кукла'),
    ('56be98a6-d59d-4e02-9db6-0141831ce95a', 'tip-igrushki', 'Говорящая книга'),
    ('250c22c3-78ad-4f3d-bf9a-b722460df02f', 'tip-igrushki', 'Развивающий столик'),
    ('7f55e537-2a29-4202-bf36-9edb5ea8bac2', 'tip-igrushki', 'Развивающий столик'),
    ('15ff30d5-d5a8-4692-8f2a-4dba7f082e96', 'tip-katalki', 'Толокар'),
    ('ad702ae2-1cef-4507-b28a-fdb15b084ccc', 'tip-katalki', 'Толокар'),
    ('a01732e6-802f-402a-a11d-e7220d5763ed', 'tip-katalki', 'Толокар'),
    ('096e5f13-7f8f-4ce6-82c4-a3827b55ebe5', 'tip-katalki', 'Толокар'),
    ('dc8269a2-b43c-4477-9402-2d0922b6c1de', 'tip-igrushki', 'Бизиборд')
  ) AS v(product_id, attr_slug, value)
  JOIN public.products p ON p.id = v.product_id::uuid
  JOIN public.attributes a ON a.slug = v.attr_slug
  JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = v.value
ON CONFLICT (product_id, attribute_id) DO NOTHING;

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: четыре строки — Тип каталки: вариантов 2, разделов 1, товаров 7; Тип набора: вариантов 4, разделов 1, товаров 11; Тип игрушки: вариантов 5, разделов 2, товаров 14; Тип куклы: вариантов 2, разделов 2, товаров 8.

SELECT a.name,
       (SELECT count(*) FROM public.attribute_options o WHERE o.attribute_id = a.id) AS variantov,
       (SELECT count(*) FROM public.category_attributes ca WHERE ca.attribute_id = a.id) AS razdelov,
       (SELECT count(*) FROM public.product_attribute_values v WHERE v.attribute_id = a.id) AS tovarov
  FROM public.attributes a
 WHERE a.slug IN ('tip-katalki', 'tip-nabora', 'tip-igrushki', 'tip-kukly')
 ORDER BY a.id;

-- ═══════════════════════════════════════════════════════════════════════════
--  Характеристики товаров: питание, эффекты, вид техники, цвет — 23.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. Владелец попросил характеристики, как на карточках «Детского мира»,
--  со ссылками на подборки и с автозаполнением при добавлении товара. Из
--  характеристик в базе были только «Цвет» (не заполнен ни у одного товара)
--  и «Количество деталей» (у 31 конструктора).
--
--  ЧТО ДЕЛАЕТ.
--   1. Заводит шесть характеристик: Вид техники, Питание, Частота
--      управления, Масштаб, Световые эффекты, Звуковые эффекты. У «Цвета»
--      варианты получают «ё» (Зелёный, Жёлтый, Чёрный — ими не пользовался ни
--      один товар) и ещё семь цветов с образцами. У «Количества деталей»
--      убирается пробел в конце названия.
--   2. Привязывает характеристики к разделам — 51 привязок. Там они
--      появятся в админке полями, а в каталоге — фильтрами.
--   3. Заполняет значения 89 товарам — 240 значений из списков
--      и 1 чисел деталей. Значения взяты из названий и описаний
--      правилами (utils/productSpecs.ts), таблица проверки — у владельца.
--      Только там, где характеристика привязана к разделу самого товара:
--      иначе поле не видно в админке и его некому поправить.
--      Уже заполненное не трогается (ON CONFLICT DO NOTHING).
--
--  Повторный запуск ничего не меняет.
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых значений, с откатом.

-- ── 0. ПОСМОТРЕТЬ ─────────────────────────────────────────────────────────

SELECT (SELECT count(*) FROM public.attributes) AS harakteristik,
       (SELECT count(*) FROM public.attribute_options) AS variantov,
       (SELECT count(*) FROM public.category_attributes) AS privyazok,
       (SELECT count(*) FROM public.product_attribute_values) AS znacheniy;

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: строка со счётчиками, INSERT 0 6, UPDATE 3, UPDATE 1, INSERT 0 7, INSERT 0 17,
--  INSERT 0 51, INSERT 0 240, INSERT 0 1.

BEGIN;

-- Счётчики номеров — не позади данных (локальная копия отставала на
-- единицу, и вставка падала на занятом номере). Двигаются только вперёд.
SELECT setval('public.attributes_id_seq',
              GREATEST((SELECT coalesce(max(id), 1) FROM public.attributes),
                       (SELECT last_value FROM public.attributes_id_seq))) AS schetchik_harakteristik,
       setval('public.attribute_options_id_seq',
              GREATEST((SELECT coalesce(max(id), 1) FROM public.attribute_options),
                       (SELECT last_value FROM public.attribute_options_id_seq))) AS schetchik_variantov;

INSERT INTO public.attributes (name, slug, display_type)
VALUES
  ('Вид техники', 'vid-tehniki', 'select'),
  ('Питание', 'pitanie', 'select'),
  ('Частота управления', 'chastota-upravleniya', 'select'),
  ('Масштаб', 'masshtab', 'select'),
  ('Световые эффекты', 'svetovye-effekty', 'select'),
  ('Звуковые эффекты', 'zvukovye-effekty', 'select')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.attribute_options o
   SET value = v.new_value
  FROM (VALUES ('Зеленый', 'Зелёный'), ('Желтый', 'Жёлтый'), ('Черный', 'Чёрный')) AS v(old_value, new_value)
 WHERE o.attribute_id = (SELECT id FROM public.attributes WHERE slug = 'color')
   AND o.value = v.old_value
   AND NOT EXISTS (SELECT 1 FROM public.product_attribute_values pav WHERE pav.option_id = o.id);

UPDATE public.attributes SET name = 'Количество деталей'
 WHERE slug = 'kolichestvo-detaley' AND name = 'Количество деталей ';

INSERT INTO public.attribute_options (attribute_id, value, meta)
SELECT a.id, v.value, jsonb_build_object('hex', v.hex)
  FROM public.attributes a
  CROSS JOIN (VALUES
    (1, 'Голубой', '#38bdf8'),
    (2, 'Розовый', '#f472b6'),
    (3, 'Бежевый', '#d6c3a5'),
    (4, 'Коричневый', '#92400e'),
    (5, 'Серый', '#9ca3af'),
    (6, 'Оранжевый', '#f97316'),
    (7, 'Фиолетовый', '#8b5cf6')
  ) AS v(ord, value, hex)
 WHERE a.slug = 'color'
   AND NOT EXISTS (SELECT 1 FROM public.attribute_options o WHERE o.attribute_id = a.id AND o.value = v.value)
 ORDER BY v.ord;

INSERT INTO public.attribute_options (attribute_id, value)
SELECT a.id, v.value
  FROM (VALUES
    (1, 'vid-tehniki', 'Легковая машина'),
    (2, 'vid-tehniki', 'Машина-перевёртыш'),
    (3, 'vid-tehniki', 'Внедорожник'),
    (4, 'vid-tehniki', 'Спецтехника'),
    (5, 'vid-tehniki', 'Танк'),
    (6, 'vid-tehniki', 'Вертолёт'),
    (7, 'vid-tehniki', 'Самолёт'),
    (8, 'vid-tehniki', 'Квадрокоптер'),
    (9, 'pitanie', 'Аккумулятор'),
    (10, 'pitanie', 'Батарейки'),
    (11, 'pitanie', 'Без батареек'),
    (12, 'chastota-upravleniya', '2,4 ГГц'),
    (13, 'chastota-upravleniya', '27 МГц'),
    (14, 'masshtab', '1:10'),
    (15, 'masshtab', '1:16'),
    (16, 'svetovye-effekty', 'Есть'),
    (17, 'zvukovye-effekty', 'Есть')
  ) AS v(ord, slug, value)
  JOIN public.attributes a ON a.slug = v.slug
 WHERE NOT EXISTS (SELECT 1 FROM public.attribute_options o WHERE o.attribute_id = a.id AND o.value = v.value)
 ORDER BY v.ord;

INSERT INTO public.category_attributes (category_id, attribute_id)
SELECT c.id, a.id
  FROM (VALUES
    ('vid-tehniki', 'radioupravlyaemye-mashinki'),
    ('chastota-upravleniya', 'radioupravlyaemye-mashinki'),
    ('masshtab', 'radioupravlyaemye-mashinki'),
    ('pitanie', 'radioupravlyaemye-mashinki'),
    ('pitanie', 'mashinki'),
    ('pitanie', 'boys'),
    ('pitanie', 'avtotreki'),
    ('pitanie', 'parkingi-i-garazhi'),
    ('pitanie', 'roboty'),
    ('pitanie', 'interaktivnye-igrushki'),
    ('pitanie', 'razvivayushchie-igrushki'),
    ('pitanie', 'kiddy'),
    ('pitanie', 'igrovye-nabory'),
    ('pitanie', 'girls'),
    ('pitanie', 'mylnye-puzyri'),
    ('pitanie', 'aktivnye-igry'),
    ('pitanie', 'interaktivnye-kukly'),
    ('svetovye-effekty', 'radioupravlyaemye-mashinki'),
    ('svetovye-effekty', 'mashinki'),
    ('svetovye-effekty', 'boys'),
    ('svetovye-effekty', 'avtotreki'),
    ('svetovye-effekty', 'parkingi-i-garazhi'),
    ('svetovye-effekty', 'roboty'),
    ('svetovye-effekty', 'interaktivnye-igrushki'),
    ('svetovye-effekty', 'razvivayushchie-igrushki'),
    ('svetovye-effekty', 'kiddy'),
    ('svetovye-effekty', 'tolokar'),
    ('svetovye-effekty', 'igrovye-nabory'),
    ('svetovye-effekty', 'girls'),
    ('svetovye-effekty', 'mylnye-puzyri'),
    ('svetovye-effekty', 'samokaty'),
    ('zvukovye-effekty', 'radioupravlyaemye-mashinki'),
    ('zvukovye-effekty', 'mashinki'),
    ('zvukovye-effekty', 'boys'),
    ('zvukovye-effekty', 'parkingi-i-garazhi'),
    ('zvukovye-effekty', 'roboty'),
    ('zvukovye-effekty', 'interaktivnye-igrushki'),
    ('zvukovye-effekty', 'razvivayushchie-igrushki'),
    ('zvukovye-effekty', 'kiddy'),
    ('zvukovye-effekty', 'tolokar'),
    ('zvukovye-effekty', 'igrovye-nabory'),
    ('zvukovye-effekty', 'girls'),
    ('zvukovye-effekty', 'interaktivnye-kukly'),
    ('zvukovye-effekty', 'aktivnye-igry'),
    ('color', 'radioupravlyaemye-mashinki'),
    ('color', 'roboty'),
    ('color', 'razvivayushchie-igrushki'),
    ('color', 'tolokar'),
    ('color', 'igrovye-nabory'),
    ('color', 'samokaty'),
    ('color', 'palatki')
  ) AS v(attr_slug, cat_slug)
  JOIN public.attributes a ON a.slug = v.attr_slug
  JOIN public.categories c ON c.slug = v.cat_slug
ON CONFLICT (category_id, attribute_id) DO NOTHING;

INSERT INTO public.product_attribute_values (product_id, attribute_id, option_id)
SELECT p.id, a.id, o.id
  FROM (VALUES
    ('f1ce7817-b9ef-482b-a153-916d2625da4d', 'pitanie', 'Батарейки'),
    ('f1ce7817-b9ef-482b-a153-916d2625da4d', 'svetovye-effekty', 'Есть'),
    ('f1ce7817-b9ef-482b-a153-916d2625da4d', 'zvukovye-effekty', 'Есть'),
    ('f1ce7817-b9ef-482b-a153-916d2625da4d', 'color', 'Синий'),
    ('8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8', 'pitanie', 'Батарейки'),
    ('8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8', 'svetovye-effekty', 'Есть'),
    ('8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8', 'zvukovye-effekty', 'Есть'),
    ('11af95cd-d418-4440-b2c0-0fa0642cb411', 'pitanie', 'Аккумулятор'),
    ('11af95cd-d418-4440-b2c0-0fa0642cb411', 'zvukovye-effekty', 'Есть'),
    ('4b4980bc-0991-40fc-a822-4eda3c7a6861', 'pitanie', 'Аккумулятор'),
    ('4b4980bc-0991-40fc-a822-4eda3c7a6861', 'svetovye-effekty', 'Есть'),
    ('ef3a2353-6536-4fc0-bca6-cd4fe0df335c', 'pitanie', 'Батарейки'),
    ('ef3a2353-6536-4fc0-bca6-cd4fe0df335c', 'zvukovye-effekty', 'Есть'),
    ('19665d2e-37f1-4965-85cf-fc75d290980a', 'pitanie', 'Аккумулятор'),
    ('19665d2e-37f1-4965-85cf-fc75d290980a', 'zvukovye-effekty', 'Есть'),
    ('caa95577-e819-4df9-b338-e00ad8056aa3', 'pitanie', 'Аккумулятор'),
    ('caa95577-e819-4df9-b338-e00ad8056aa3', 'zvukovye-effekty', 'Есть'),
    ('8100ad58-3534-4c3b-9570-6eee6b17bf6d', 'zvukovye-effekty', 'Есть'),
    ('6ca5ffd6-4181-437a-b00e-853d7f64f42f', 'zvukovye-effekty', 'Есть'),
    ('449d1743-7a40-4b9c-a0ce-cb93f16376cf', 'pitanie', 'Батарейки'),
    ('449d1743-7a40-4b9c-a0ce-cb93f16376cf', 'svetovye-effekty', 'Есть'),
    ('449d1743-7a40-4b9c-a0ce-cb93f16376cf', 'zvukovye-effekty', 'Есть'),
    ('feb15cb7-69a4-42c9-9404-d889d6a49d8e', 'pitanie', 'Батарейки'),
    ('e0b46eba-7998-4d40-9e08-a1593eb40c64', 'pitanie', 'Батарейки'),
    ('e0b46eba-7998-4d40-9e08-a1593eb40c64', 'zvukovye-effekty', 'Есть'),
    ('e0b46eba-7998-4d40-9e08-a1593eb40c64', 'color', 'Розовый'),
    ('03037f92-b805-480f-9800-281d5aa2c155', 'pitanie', 'Батарейки'),
    ('03037f92-b805-480f-9800-281d5aa2c155', 'zvukovye-effekty', 'Есть'),
    ('03037f92-b805-480f-9800-281d5aa2c155', 'color', 'Серый'),
    ('3b506190-cb30-4bf3-8549-51ffac1202cb', 'svetovye-effekty', 'Есть'),
    ('3b506190-cb30-4bf3-8549-51ffac1202cb', 'color', 'Чёрный'),
    ('d5e4b821-84b3-458f-9f12-f63f299641c3', 'svetovye-effekty', 'Есть'),
    ('d5e4b821-84b3-458f-9f12-f63f299641c3', 'color', 'Красный'),
    ('622f8666-0a5b-4711-ac9f-4f04785a0f22', 'color', 'Голубой'),
    ('b80db466-fb18-4ec3-ace7-684e15790e7a', 'color', 'Розовый'),
    ('ec6da253-3976-4d1b-a73b-43281e4cd0af', 'pitanie', 'Батарейки'),
    ('ec6da253-3976-4d1b-a73b-43281e4cd0af', 'svetovye-effekty', 'Есть'),
    ('ec6da253-3976-4d1b-a73b-43281e4cd0af', 'zvukovye-effekty', 'Есть'),
    ('f98da138-2aa9-441d-933f-2e914d3198fa', 'pitanie', 'Батарейки'),
    ('f98da138-2aa9-441d-933f-2e914d3198fa', 'svetovye-effekty', 'Есть'),
    ('f98da138-2aa9-441d-933f-2e914d3198fa', 'zvukovye-effekty', 'Есть'),
    ('f98da138-2aa9-441d-933f-2e914d3198fa', 'color', 'Чёрный'),
    ('a5e041ae-3aa4-4640-9619-981f8003aa56', 'pitanie', 'Батарейки'),
    ('a5e041ae-3aa4-4640-9619-981f8003aa56', 'svetovye-effekty', 'Есть'),
    ('a5e041ae-3aa4-4640-9619-981f8003aa56', 'zvukovye-effekty', 'Есть'),
    ('b016fe78-2585-4f55-b9c0-148164327394', 'pitanie', 'Батарейки'),
    ('b016fe78-2585-4f55-b9c0-148164327394', 'svetovye-effekty', 'Есть'),
    ('b016fe78-2585-4f55-b9c0-148164327394', 'zvukovye-effekty', 'Есть'),
    ('96c6d219-536d-4ee4-9f7a-5faf69aa46db', 'svetovye-effekty', 'Есть'),
    ('96c6d219-536d-4ee4-9f7a-5faf69aa46db', 'zvukovye-effekty', 'Есть'),
    ('96c6d219-536d-4ee4-9f7a-5faf69aa46db', 'color', 'Розовый'),
    ('31a3f616-0c80-4b39-b7f5-6271b13be717', 'svetovye-effekty', 'Есть'),
    ('31a3f616-0c80-4b39-b7f5-6271b13be717', 'zvukovye-effekty', 'Есть'),
    ('d8e219a6-7af4-4ed9-982d-f3d5c12b5404', 'svetovye-effekty', 'Есть'),
    ('d8e219a6-7af4-4ed9-982d-f3d5c12b5404', 'zvukovye-effekty', 'Есть'),
    ('d8e219a6-7af4-4ed9-982d-f3d5c12b5404', 'color', 'Розовый'),
    ('4b230e7f-ee48-4597-ba7c-cbdf8f46944c', 'svetovye-effekty', 'Есть'),
    ('4b230e7f-ee48-4597-ba7c-cbdf8f46944c', 'zvukovye-effekty', 'Есть'),
    ('df66ff47-4dd0-4934-b79f-cdb20ff131c8', 'pitanie', 'Батарейки'),
    ('df66ff47-4dd0-4934-b79f-cdb20ff131c8', 'svetovye-effekty', 'Есть'),
    ('df66ff47-4dd0-4934-b79f-cdb20ff131c8', 'zvukovye-effekty', 'Есть'),
    ('e9f30c56-ba7d-414f-aa4e-e5c3ed5aa6e4', 'zvukovye-effekty', 'Есть'),
    ('257c8627-13fc-4f7d-b29e-6ab4296f5501', 'pitanie', 'Батарейки'),
    ('257c8627-13fc-4f7d-b29e-6ab4296f5501', 'zvukovye-effekty', 'Есть'),
    ('4dd5375a-3686-4841-9daa-d313d80cda3c', 'svetovye-effekty', 'Есть'),
    ('4dd5375a-3686-4841-9daa-d313d80cda3c', 'color', 'Зелёный'),
    ('e8f8393c-0f51-41be-b233-4517cdd1e072', 'svetovye-effekty', 'Есть'),
    ('e8f8393c-0f51-41be-b233-4517cdd1e072', 'color', 'Коричневый'),
    ('b9ea8841-041a-427a-9d0b-0b6820800d05', 'svetovye-effekty', 'Есть'),
    ('b9ea8841-041a-427a-9d0b-0b6820800d05', 'color', 'Розовый'),
    ('3bce02d3-b815-46af-90e3-4aa33aef1754', 'pitanie', 'Аккумулятор'),
    ('3bce02d3-b815-46af-90e3-4aa33aef1754', 'vid-tehniki', 'Квадрокоптер'),
    ('3bce02d3-b815-46af-90e3-4aa33aef1754', 'color', 'Чёрный'),
    ('f02ee20d-a66a-4501-8667-39d2ebe52087', 'pitanie', 'Батарейки'),
    ('f02ee20d-a66a-4501-8667-39d2ebe52087', 'zvukovye-effekty', 'Есть'),
    ('a4900031-59df-4b24-a5f8-795c59ef8edd', 'zvukovye-effekty', 'Есть'),
    ('c1ae4126-f7e9-4089-bded-bdf611725d2e', 'pitanie', 'Аккумулятор'),
    ('c1ae4126-f7e9-4089-bded-bdf611725d2e', 'vid-tehniki', 'Вертолёт'),
    ('c1ae4126-f7e9-4089-bded-bdf611725d2e', 'color', 'Синий'),
    ('b105638d-0e8f-47ab-ba76-0ba1857db752', 'pitanie', 'Аккумулятор'),
    ('b105638d-0e8f-47ab-ba76-0ba1857db752', 'vid-tehniki', 'Вертолёт'),
    ('b105638d-0e8f-47ab-ba76-0ba1857db752', 'color', 'Красный'),
    ('c7ef6de3-0f7c-41e0-84b9-e22ee9224eb0', 'pitanie', 'Аккумулятор'),
    ('c7ef6de3-0f7c-41e0-84b9-e22ee9224eb0', 'vid-tehniki', 'Вертолёт'),
    ('c7ef6de3-0f7c-41e0-84b9-e22ee9224eb0', 'color', 'Жёлтый'),
    ('89d89089-5c9a-418e-99a0-8da1d2a06e22', 'pitanie', 'Батарейки'),
    ('89d89089-5c9a-418e-99a0-8da1d2a06e22', 'svetovye-effekty', 'Есть'),
    ('89d89089-5c9a-418e-99a0-8da1d2a06e22', 'vid-tehniki', 'Легковая машина'),
    ('45a742bf-24f8-45f6-a362-10cba43a9ce7', 'pitanie', 'Батарейки'),
    ('45a742bf-24f8-45f6-a362-10cba43a9ce7', 'vid-tehniki', 'Спецтехника'),
    ('45a742bf-24f8-45f6-a362-10cba43a9ce7', 'color', 'Синий'),
    ('dade5c34-f42b-4a9c-950b-e205edfc5f52', 'zvukovye-effekty', 'Есть'),
    ('b82251da-347e-44b4-9898-da8b3bc01fb5', 'pitanie', 'Аккумулятор'),
    ('b82251da-347e-44b4-9898-da8b3bc01fb5', 'svetovye-effekty', 'Есть'),
    ('b82251da-347e-44b4-9898-da8b3bc01fb5', 'zvukovye-effekty', 'Есть'),
    ('56be98a6-d59d-4e02-9db6-0141831ce95a', 'zvukovye-effekty', 'Есть'),
    ('83085e32-95c4-4b87-82a6-e42dd3001bf9', 'pitanie', 'Батарейки'),
    ('83085e32-95c4-4b87-82a6-e42dd3001bf9', 'svetovye-effekty', 'Есть'),
    ('83085e32-95c4-4b87-82a6-e42dd3001bf9', 'zvukovye-effekty', 'Есть'),
    ('528fb9ad-df06-48ab-9a32-5e80e999900a', 'pitanie', 'Батарейки'),
    ('528fb9ad-df06-48ab-9a32-5e80e999900a', 'svetovye-effekty', 'Есть'),
    ('528fb9ad-df06-48ab-9a32-5e80e999900a', 'zvukovye-effekty', 'Есть'),
    ('eeb1f135-66e8-4158-827d-ecc697e3bb63', 'pitanie', 'Батарейки'),
    ('cf4e68d4-b1d2-4a30-80af-cfcdb2b37391', 'pitanie', 'Аккумулятор'),
    ('cf4e68d4-b1d2-4a30-80af-cfcdb2b37391', 'svetovye-effekty', 'Есть'),
    ('5f0cfaf6-fa29-4236-8a5c-d61e75e841cb', 'pitanie', 'Батарейки'),
    ('a6079d6d-7a8f-4ac3-8980-4d001797deb3', 'svetovye-effekty', 'Есть'),
    ('c4404074-de4d-43b1-ae70-189eadf66ae3', 'pitanie', 'Аккумулятор'),
    ('c4404074-de4d-43b1-ae70-189eadf66ae3', 'svetovye-effekty', 'Есть'),
    ('c4404074-de4d-43b1-ae70-189eadf66ae3', 'chastota-upravleniya', '27 МГц'),
    ('c4404074-de4d-43b1-ae70-189eadf66ae3', 'vid-tehniki', 'Легковая машина'),
    ('98e5923a-be1b-44ce-aca2-aacafbd9407a', 'pitanie', 'Аккумулятор'),
    ('98e5923a-be1b-44ce-aca2-aacafbd9407a', 'svetovye-effekty', 'Есть'),
    ('98e5923a-be1b-44ce-aca2-aacafbd9407a', 'zvukovye-effekty', 'Есть'),
    ('98e5923a-be1b-44ce-aca2-aacafbd9407a', 'vid-tehniki', 'Машина-перевёртыш'),
    ('23ea7892-55fe-4bee-96f0-51efdfe9748d', 'pitanie', 'Аккумулятор'),
    ('23ea7892-55fe-4bee-96f0-51efdfe9748d', 'svetovye-effekty', 'Есть'),
    ('23ea7892-55fe-4bee-96f0-51efdfe9748d', 'zvukovye-effekty', 'Есть'),
    ('23ea7892-55fe-4bee-96f0-51efdfe9748d', 'vid-tehniki', 'Машина-перевёртыш'),
    ('23ea7892-55fe-4bee-96f0-51efdfe9748d', 'color', 'Синий'),
    ('0f742180-7794-4cd0-b26f-7a8d0037615b', 'pitanie', 'Аккумулятор'),
    ('0f742180-7794-4cd0-b26f-7a8d0037615b', 'svetovye-effekty', 'Есть'),
    ('0f742180-7794-4cd0-b26f-7a8d0037615b', 'zvukovye-effekty', 'Есть'),
    ('0f742180-7794-4cd0-b26f-7a8d0037615b', 'vid-tehniki', 'Машина-перевёртыш'),
    ('0f742180-7794-4cd0-b26f-7a8d0037615b', 'color', 'Красный'),
    ('04902f7d-5dc0-4d79-b227-03d65ffa26d7', 'pitanie', 'Аккумулятор'),
    ('04902f7d-5dc0-4d79-b227-03d65ffa26d7', 'svetovye-effekty', 'Есть'),
    ('04902f7d-5dc0-4d79-b227-03d65ffa26d7', 'zvukovye-effekty', 'Есть'),
    ('04902f7d-5dc0-4d79-b227-03d65ffa26d7', 'vid-tehniki', 'Машина-перевёртыш'),
    ('d2e64b0f-0b2f-48d6-8de4-b3e4f3b83be1', 'svetovye-effekty', 'Есть'),
    ('d2e64b0f-0b2f-48d6-8de4-b3e4f3b83be1', 'zvukovye-effekty', 'Есть'),
    ('d2e64b0f-0b2f-48d6-8de4-b3e4f3b83be1', 'masshtab', '1:16'),
    ('d2e64b0f-0b2f-48d6-8de4-b3e4f3b83be1', 'vid-tehniki', 'Спецтехника'),
    ('d9af1b38-8392-422d-a156-15e1e12116e2', 'pitanie', 'Аккумулятор'),
    ('d9af1b38-8392-422d-a156-15e1e12116e2', 'svetovye-effekty', 'Есть'),
    ('d9af1b38-8392-422d-a156-15e1e12116e2', 'zvukovye-effekty', 'Есть'),
    ('d9af1b38-8392-422d-a156-15e1e12116e2', 'masshtab', '1:10'),
    ('d9af1b38-8392-422d-a156-15e1e12116e2', 'vid-tehniki', 'Спецтехника'),
    ('02c73d8f-8470-421e-8dc2-ca34158e9e0d', 'pitanie', 'Аккумулятор'),
    ('02c73d8f-8470-421e-8dc2-ca34158e9e0d', 'svetovye-effekty', 'Есть'),
    ('02c73d8f-8470-421e-8dc2-ca34158e9e0d', 'masshtab', '1:16'),
    ('02c73d8f-8470-421e-8dc2-ca34158e9e0d', 'vid-tehniki', 'Легковая машина'),
    ('8c097d26-d1d2-4b6c-b259-f4739a64dc08', 'pitanie', 'Аккумулятор'),
    ('8c097d26-d1d2-4b6c-b259-f4739a64dc08', 'svetovye-effekty', 'Есть'),
    ('8c097d26-d1d2-4b6c-b259-f4739a64dc08', 'zvukovye-effekty', 'Есть'),
    ('8c097d26-d1d2-4b6c-b259-f4739a64dc08', 'vid-tehniki', 'Танк'),
    ('406bc4e2-6e5e-4177-bf61-c060ca9916b9', 'pitanie', 'Батарейки'),
    ('406bc4e2-6e5e-4177-bf61-c060ca9916b9', 'vid-tehniki', 'Спецтехника'),
    ('406bc4e2-6e5e-4177-bf61-c060ca9916b9', 'color', 'Жёлтый'),
    ('902dfc61-6d25-4b8e-886a-b4a47b0b9bb4', 'pitanie', 'Аккумулятор'),
    ('902dfc61-6d25-4b8e-886a-b4a47b0b9bb4', 'svetovye-effekty', 'Есть'),
    ('902dfc61-6d25-4b8e-886a-b4a47b0b9bb4', 'zvukovye-effekty', 'Есть'),
    ('902dfc61-6d25-4b8e-886a-b4a47b0b9bb4', 'chastota-upravleniya', '2,4 ГГц'),
    ('902dfc61-6d25-4b8e-886a-b4a47b0b9bb4', 'vid-tehniki', 'Спецтехника'),
    ('5b3e85e4-7c61-4d75-8a64-72bdefa6cd49', 'zvukovye-effekty', 'Есть'),
    ('5b3e85e4-7c61-4d75-8a64-72bdefa6cd49', 'chastota-upravleniya', '2,4 ГГц'),
    ('5b3e85e4-7c61-4d75-8a64-72bdefa6cd49', 'vid-tehniki', 'Спецтехника'),
    ('51edaa34-2ee8-4140-9c98-f4dea3a36955', 'pitanie', 'Аккумулятор'),
    ('51edaa34-2ee8-4140-9c98-f4dea3a36955', 'svetovye-effekty', 'Есть'),
    ('51edaa34-2ee8-4140-9c98-f4dea3a36955', 'masshtab', '1:16'),
    ('51edaa34-2ee8-4140-9c98-f4dea3a36955', 'vid-tehniki', 'Внедорожник'),
    ('f0cfff18-64df-4bbd-99c1-a75cf6cbb8a1', 'pitanie', 'Аккумулятор'),
    ('f0cfff18-64df-4bbd-99c1-a75cf6cbb8a1', 'svetovye-effekty', 'Есть'),
    ('f0cfff18-64df-4bbd-99c1-a75cf6cbb8a1', 'zvukovye-effekty', 'Есть'),
    ('39926ad8-77c1-47c1-bf75-18cb79bce9cc', 'pitanie', 'Аккумулятор'),
    ('39926ad8-77c1-47c1-bf75-18cb79bce9cc', 'svetovye-effekty', 'Есть'),
    ('39926ad8-77c1-47c1-bf75-18cb79bce9cc', 'chastota-upravleniya', '2,4 ГГц'),
    ('39926ad8-77c1-47c1-bf75-18cb79bce9cc', 'vid-tehniki', 'Самолёт'),
    ('39926ad8-77c1-47c1-bf75-18cb79bce9cc', 'color', 'Синий'),
    ('79127570-fae3-40f6-bf9b-8f32185cc8dd', 'pitanie', 'Аккумулятор'),
    ('79127570-fae3-40f6-bf9b-8f32185cc8dd', 'svetovye-effekty', 'Есть'),
    ('79127570-fae3-40f6-bf9b-8f32185cc8dd', 'chastota-upravleniya', '2,4 ГГц'),
    ('79127570-fae3-40f6-bf9b-8f32185cc8dd', 'vid-tehniki', 'Самолёт'),
    ('79127570-fae3-40f6-bf9b-8f32185cc8dd', 'color', 'Серый'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'pitanie', 'Аккумулятор'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'svetovye-effekty', 'Есть'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'zvukovye-effekty', 'Есть'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'chastota-upravleniya', '2,4 ГГц'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'vid-tehniki', 'Танк'),
    ('62cf7416-821b-4c67-bb90-90df45cc91a0', 'color', 'Зелёный'),
    ('00c3e8b4-9ebd-4c60-ba24-c764b97fea1e', 'pitanie', 'Аккумулятор'),
    ('00c3e8b4-9ebd-4c60-ba24-c764b97fea1e', 'svetovye-effekty', 'Есть'),
    ('00c3e8b4-9ebd-4c60-ba24-c764b97fea1e', 'zvukovye-effekty', 'Есть'),
    ('00c3e8b4-9ebd-4c60-ba24-c764b97fea1e', 'chastota-upravleniya', '2,4 ГГц'),
    ('00c3e8b4-9ebd-4c60-ba24-c764b97fea1e', 'vid-tehniki', 'Танк'),
    ('433169f7-acb0-4afb-b52e-3da58e902dd6', 'vid-tehniki', 'Спецтехника'),
    ('e8c320d1-2fc8-415c-9b73-cbb77f73cd84', 'pitanie', 'Батарейки'),
    ('e8c320d1-2fc8-415c-9b73-cbb77f73cd84', 'svetovye-effekty', 'Есть'),
    ('e8c320d1-2fc8-415c-9b73-cbb77f73cd84', 'zvukovye-effekty', 'Есть'),
    ('a236076a-f146-4d34-9fb5-e8721b71b938', 'pitanie', 'Батарейки'),
    ('a236076a-f146-4d34-9fb5-e8721b71b938', 'svetovye-effekty', 'Есть'),
    ('a236076a-f146-4d34-9fb5-e8721b71b938', 'zvukovye-effekty', 'Есть'),
    ('250c22c3-78ad-4f3d-bf9a-b722460df02f', 'zvukovye-effekty', 'Есть'),
    ('ff7e9785-26a9-4f87-b8aa-07a59cc3d146', 'pitanie', 'Аккумулятор'),
    ('ff7e9785-26a9-4f87-b8aa-07a59cc3d146', 'zvukovye-effekty', 'Есть'),
    ('4952e727-e96b-4e98-b395-47340aae40c0', 'pitanie', 'Аккумулятор'),
    ('4952e727-e96b-4e98-b395-47340aae40c0', 'svetovye-effekty', 'Есть'),
    ('4952e727-e96b-4e98-b395-47340aae40c0', 'zvukovye-effekty', 'Есть'),
    ('4952e727-e96b-4e98-b395-47340aae40c0', 'color', 'Белый'),
    ('8f5fada8-01f9-4701-ac80-239ea7e4d6ad', 'pitanie', 'Аккумулятор'),
    ('8f5fada8-01f9-4701-ac80-239ea7e4d6ad', 'svetovye-effekty', 'Есть'),
    ('8f5fada8-01f9-4701-ac80-239ea7e4d6ad', 'zvukovye-effekty', 'Есть'),
    ('8f5fada8-01f9-4701-ac80-239ea7e4d6ad', 'color', 'Жёлтый'),
    ('c63031f6-c715-4f18-8326-de4021f82873', 'pitanie', 'Аккумулятор'),
    ('c63031f6-c715-4f18-8326-de4021f82873', 'svetovye-effekty', 'Есть'),
    ('c63031f6-c715-4f18-8326-de4021f82873', 'zvukovye-effekty', 'Есть'),
    ('c63031f6-c715-4f18-8326-de4021f82873', 'color', 'Зелёный'),
    ('922ccc2f-68af-40aa-86f0-d8afefe66753', 'pitanie', 'Батарейки'),
    ('922ccc2f-68af-40aa-86f0-d8afefe66753', 'svetovye-effekty', 'Есть'),
    ('922ccc2f-68af-40aa-86f0-d8afefe66753', 'zvukovye-effekty', 'Есть'),
    ('016998bc-19c5-45a1-b5f2-d18adecc8128', 'pitanie', 'Аккумулятор'),
    ('016998bc-19c5-45a1-b5f2-d18adecc8128', 'svetovye-effekty', 'Есть'),
    ('016998bc-19c5-45a1-b5f2-d18adecc8128', 'zvukovye-effekty', 'Есть'),
    ('9b05760a-bf9a-4b7e-a121-ac9fc963e008', 'pitanie', 'Батарейки'),
    ('9b05760a-bf9a-4b7e-a121-ac9fc963e008', 'svetovye-effekty', 'Есть'),
    ('95a7dfbc-5544-4a4d-afe7-eaa041ff2918', 'pitanie', 'Батарейки'),
    ('95a7dfbc-5544-4a4d-afe7-eaa041ff2918', 'svetovye-effekty', 'Есть'),
    ('c70a64b0-ea44-416a-969f-7fef2bd0008c', 'color', 'Чёрный'),
    ('af67eaf5-42aa-4242-9399-0c5c42db0f83', 'color', 'Красный'),
    ('d0939eec-48fe-4b5e-b3e5-98ad203244c3', 'zvukovye-effekty', 'Есть'),
    ('15ff30d5-d5a8-4692-8f2a-4dba7f082e96', 'svetovye-effekty', 'Есть'),
    ('15ff30d5-d5a8-4692-8f2a-4dba7f082e96', 'zvukovye-effekty', 'Есть'),
    ('15ff30d5-d5a8-4692-8f2a-4dba7f082e96', 'color', 'Голубой'),
    ('ad702ae2-1cef-4507-b28a-fdb15b084ccc', 'svetovye-effekty', 'Есть'),
    ('ad702ae2-1cef-4507-b28a-fdb15b084ccc', 'zvukovye-effekty', 'Есть'),
    ('ad702ae2-1cef-4507-b28a-fdb15b084ccc', 'color', 'Бежевый'),
    ('a01732e6-802f-402a-a11d-e7220d5763ed', 'svetovye-effekty', 'Есть'),
    ('a01732e6-802f-402a-a11d-e7220d5763ed', 'zvukovye-effekty', 'Есть'),
    ('a01732e6-802f-402a-a11d-e7220d5763ed', 'color', 'Розовый'),
    ('096e5f13-7f8f-4ce6-82c4-a3827b55ebe5', 'svetovye-effekty', 'Есть'),
    ('096e5f13-7f8f-4ce6-82c4-a3827b55ebe5', 'zvukovye-effekty', 'Есть'),
    ('096e5f13-7f8f-4ce6-82c4-a3827b55ebe5', 'color', 'Жёлтый'),
    ('d87a968a-68a1-4111-b6ad-9fc11bffe9a0', 'pitanie', 'Батарейки'),
    ('d87a968a-68a1-4111-b6ad-9fc11bffe9a0', 'zvukovye-effekty', 'Есть'),
    ('c6f002ec-756d-4ca3-8293-cd66e4dde137', 'pitanie', 'Батарейки'),
    ('c6f002ec-756d-4ca3-8293-cd66e4dde137', 'zvukovye-effekty', 'Есть'),
    ('dc8269a2-b43c-4477-9402-2d0922b6c1de', 'pitanie', 'Батарейки'),
    ('dc8269a2-b43c-4477-9402-2d0922b6c1de', 'svetovye-effekty', 'Есть'),
    ('dc8269a2-b43c-4477-9402-2d0922b6c1de', 'zvukovye-effekty', 'Есть'),
    ('dc8269a2-b43c-4477-9402-2d0922b6c1de', 'color', 'Розовый')
  ) AS v(product_id, attr_slug, value)
  JOIN public.products p ON p.id = v.product_id::uuid
  JOIN public.attributes a ON a.slug = v.attr_slug
  JOIN public.attribute_options o ON o.attribute_id = a.id AND o.value = v.value
ON CONFLICT (product_id, attribute_id) DO NOTHING;

INSERT INTO public.product_attribute_values (product_id, attribute_id, numeric_value)
SELECT p.id, a.id, v.pieces
  FROM (VALUES
    ('5f593c71-e145-4fb8-9262-d84a26a51f17', 404)
  ) AS v(product_id, pieces)
  JOIN public.products p ON p.id = v.product_id::uuid
  JOIN public.attributes a ON a.slug = 'kolichestvo-detaley'
ON CONFLICT (product_id, attribute_id) DO NOTHING;

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: по строке на характеристику; tovarov — сколько товаров с
--  значением: pitanie 59, svetovye-effekty 54, zvukovye-effekty 58, color 34, vid-tehniki 24, chastota-upravleniya 7, masshtab 4;
--  у «Количества деталей» — 32.

SELECT a.name, a.slug,
       (SELECT count(*) FROM public.attribute_options o WHERE o.attribute_id = a.id) AS variantov,
       (SELECT count(*) FROM public.category_attributes ca WHERE ca.attribute_id = a.id) AS razdelov,
       (SELECT count(*) FROM public.product_attribute_values v WHERE v.attribute_id = a.id) AS tovarov
  FROM public.attributes a
 ORDER BY a.id;

-- ═══════════════════════════════════════════════════════════════════════════
--  Бренды для товаров, у которых производитель назван в названии — 26.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. План по аудиту, п. 7: у 92 товаров из 178 нет бренда. Google для
--  товарных карточек ждёт производителя (или штрихкод), а штрихкода у
--  товаров нет ни одного: единственный заполненный — «8497», это не GTIN.
--
--  ЧТО ПОКАЗАЛ РАЗБОР 92 НАЗВАНИЙ. Брендов, уже заведённых в базе, нет ни в
--  одном. Производитель прямо назван у 16 товаров — это 11 брендов, которых
--  в базе нет. Остальные 76 — безымянные игрушки («Толокар Sport 5566»,
--  «Синтезатор MQ-6106») или с чужими персонажами (Маквин, BEN10, Mickey
--  Mouse, Кот Том) — им бренд не ставится: назвать производителем Disney или
--  выдумать фабрику нельзя. Google это допускает: без бренда товар идёт с
--  артикулом (MPN) и с пометкой «идентификатора нет» в фиде.
--
--  Владелец 26 сентября: заводить все 11 брендов.
--
--  ЧТО ДЕЛАЕТ.
--   1. Заводит 11 брендов: Tourist, SuboTech, MalPlay, SOBEBEAR, DGT-Games,
--      KING BECKET, Sima-Land, BIAI, BST, Shantou Jinxing, Rong Xian Yi.
--      Написание — как в названиях товаров. У каждого появится страница
--      /brand/… с его товарами; логотипа и текста пока нет — их можно
--      добавить в админке, страница без них показывает название.
--   2. Привязывает к ним 16 товаров: 6 игровых наборов-чемоданов Tourist и
--      по одному товару остальным.
--
--  Автовопросы для новых брендов НЕ создаются: триггер смотрит на
--  settings.auto_generate_faq, а на бою она выключена.
--
--  НЕ ТРОГАЛ, хотя похоже (без доказательства в названии или описании):
--  «Бункер 0134R-71» — тот же код серии, что у DGT-Games, но издатель не
--  назван; роботы «Кибер-бот BG1538» — тот же префикс, что у SuboTech;
--  синтезаторы MQ-200A и MQ-6106 — серия MQ, как у пианино Sima-Land;
--  самокаты «Lambo XW»; батарейки «Новая Победа» и «СОНИ»; треки «Magic
--  Tracks» (это торговая марка другой компании). Если на упаковках есть
--  бренд — пришлите, проставлю.
--
--  ЗАЩИТА. Товар получает бренд, только если бренда у него ещё нет и в его
--  названии есть имя бренда. Бренд заводится, только если такого ещё нет.
--  Повторный запуск ничего не меняет.
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых строк, с откатом.

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: INSERT 0 11, затем UPDATE 16.

BEGIN;

INSERT INTO public.brands (name, slug) VALUES
  ('Tourist', 'tourist'),
  ('SuboTech', 'subotech'),
  ('MalPlay', 'malplay'),
  ('SOBEBEAR', 'sobebear'),
  ('DGT-Games', 'dgt-games'),
  ('KING BECKET', 'king-becket'),
  ('Sima-Land', 'sima-land'),
  ('BIAI', 'biai'),
  ('BST', 'bst'),
  ('Shantou Jinxing', 'shantou-jinxing'),
  ('Rong Xian Yi', 'rong-xian-yi')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.products p
   SET brand_id = b.id
  FROM (VALUES
    ('96c6d219-536d-4ee4-9f7a-5faf69aa46db', 'tourist', 'Tourist'),          -- Кухня Tourist 008-101A
    ('d8e219a6-7af4-4ed9-982d-f3d5c12b5404', 'tourist', 'Tourist'),          -- Трюмо Tourist 008-103A
    ('b41215c6-4969-41a1-bde4-52e6c1842d5c', 'tourist', 'Tourist'),          -- Доктор Tourist 008-105A
    ('3b636cf1-ac7b-4c69-ae5a-1520ad9c2fcc', 'tourist', 'Tourist'),          -- Кухня Tourist 008-601A
    ('4b230e7f-ee48-4597-ba7c-cbdf8f46944c', 'tourist', 'Tourist'),          -- Трюмо Tourist 008-603A
    ('b016fe78-2585-4f55-b9c0-148164327394', 'tourist', 'Tourist'),          -- Доктор Tourist 008-605A
    ('016998bc-19c5-45a1-b5f2-d18adecc8128', 'subotech', 'SuboTech'),        -- робот-собака BG1544
    ('250c22c3-78ad-4f3d-bf9a-b722460df02f', 'malplay', 'MalPlay'),          -- столик PARK GAME YL256
    ('02005fee-cda7-4d41-8646-5dbb84ef2e20', 'sobebear', 'SOBEBEAR'),        -- книжка-маска YL1022-72
    ('562cc0f2-7989-4553-9445-2f09300e6448', 'dgt-games', 'DGT-Games'),      -- Ходилки-Бродилки 0134R-72
    ('76702e7a-94ce-48ac-9451-39045295ef6e', 'king-becket', 'KING BECKET'),  -- бадминтон A6118
    ('48c67a40-e60a-4da3-9def-beb6d75659b1', 'sima-land', 'Sima-Land'),      -- пианино MQ-3700
    ('65ae23b8-8d7d-4629-91e5-4340190e9bfc', 'biai', 'BIAI'),                -- бизиборд 8725
    ('2eb53354-9671-49b8-ab80-e1deb3fa48d0', 'bst', 'BST'),                  -- косметика LK28587
    ('8748b9bd-3fac-4934-b5ae-8d4f6365620a', 'shantou-jinxing', 'Jinxing'),  -- Beauty Bomb
    ('922ccc2f-68af-40aa-86f0-d8afefe66753', 'rong-xian-yi', 'Rong Xian Yi') -- ракета ZR175
  ) AS m(product_id, brand_slug, name_part)
  JOIN public.brands b ON b.slug = m.brand_slug
 WHERE p.id = m.product_id::uuid
   AND p.brand_id IS NULL
   AND strpos(p.name, m.name_part) > 0;

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: 11 строк; у Tourist 6 товаров, у остальных по 1.
--  Ниже — сколько активных товаров осталось без бренда: было 92, станет 76.

SELECT b.name, b.slug, count(p.id) AS tovarov
  FROM public.brands b
  LEFT JOIN public.products p ON p.brand_id = b.id AND p.is_active
 WHERE b.slug IN ('tourist', 'subotech', 'malplay', 'sobebear', 'dgt-games', 'king-becket',
                  'sima-land', 'biai', 'bst', 'shantou-jinxing', 'rong-xian-yi')
 GROUP BY b.name, b.slug
 ORDER BY tovarov DESC, b.name;

SELECT count(*) AS bez_brenda FROM public.products WHERE is_active AND brand_id IS NULL;

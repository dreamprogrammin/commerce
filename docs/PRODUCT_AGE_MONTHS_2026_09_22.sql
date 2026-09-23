-- ═══════════════════════════════════════════════════════════════════════════
--  Возраст малышовых игрушек — точными месяцами, 22 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАПУСКАТЬ ПОСЛЕ МИГРАЦИИ 20260922120000_product_age_in_months — ей
--  заводятся колонки с месяцами. Раньше срока запуск упадёт с ошибкой
--  «column min_age_months does not exist» и ничего не изменит.
--
--  ЗАЧЕМ. У 8 активных товаров в описании возраст указан в месяцах, а в
--  базе он округлён до лет: игрушки «от 6», «от 9» и «от 18 месяцев»
--  записаны как «от 1 года», говорящая книга «от 6 месяцев» — как «от 2
--  лет», кулер «от 18 месяцев до 8 лет» — как «от 3 лет». Сайт показывает
--  то, что в базе, а подбор по ребёнку по той же цифре решает, кому игрушку
--  предлагать.
--
--  ЧТО ДЕЛАЕТ. Ставит месяцы, как в описании. Годы база пересчитает сама
--  (триггер из миграции). Строка меняется, только если возраст всё ещё тот,
--  что был 22 сентября, — правку руками не затрёт.
--
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых значений, с откатом:
--  UPDATE 1 восемь раз и 8 пересобранных вопросов, повторный запуск —
--  UPDATE 0.

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: UPDATE 1 восемь раз, затем 8 строк пересборки вопросов.

BEGIN;

-- Пирамидка HOLA HE2101: в описании «для детей от 6 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 6, max_age_months = NULL
 WHERE id = 'e8c320d1-2fc8-415c-9b73-cbb77f73cd84'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Ходунок-панель HUANGER HE0829: в описании «от 6 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 6, max_age_months = NULL
 WHERE id = '8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Говорящая книга 078-1: в описании «для детей от 6 месяцев»; в базе было «от 2 лет»
UPDATE public.products
   SET min_age_months = 6, max_age_months = NULL
 WHERE id = 'ef3a2353-6536-4fc0-bca6-cd4fe0df335c'
   AND min_age_months = 24 AND max_age_months IS NULL;

-- Погремушка-брелок HOLA E8996: в описании «для детей от 9 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 9, max_age_months = NULL
 WHERE id = 'a236076a-f146-4d34-9fb5-e8721b71b938'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Машинка-сортер HOLA 516: в описании «от 18 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 18, max_age_months = NULL
 WHERE id = 'dade5c34-f42b-4a9c-950b-e205edfc5f52'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Книжка-маска SOBEBEAR YL1022-72: в описании «для детей от 18 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 18, max_age_months = NULL
 WHERE id = '02005fee-cda7-4d41-8646-5dbb84ef2e20'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Столик MalPlay PARK GAME YL256: в описании «для детей от 18 месяцев»; в базе было «от 1 года»
UPDATE public.products
   SET min_age_months = 18, max_age_months = NULL
 WHERE id = '250c22c3-78ad-4f3d-bf9a-b722460df02f'
   AND min_age_months = 12 AND max_age_months IS NULL;

-- Игровой кулер My Little Home A1010-4: в описании «Для детей от 18 месяцев до 8 лет»; в базе было «от 3 лет»
UPDATE public.products
   SET min_age_months = 18, max_age_months = 96
 WHERE id = 'f98da138-2aa9-441d-933f-2e914d3198fa'
   AND min_age_months = 36 AND max_age_months IS NULL;

-- Ответ «С какого возраста можно играть…» у этих товаров сгенерирован из
-- старых лет («от 1 года»). Пересобираем их автоматические вопросы: функция
-- из миграции пишет возраст месяцами. Удаляются и пишутся заново только
-- автоматические вопросы (у каждого из 8 — три: возраст, доставка, возврат);
-- вопросов покупателей у этих товаров нет.
--  Ожидаемо: 8 строк, в rezultat — {"needs_ai" : false}.
SELECT left(p.name, 40) AS name, public.generate_product_questions(p.id, true) AS rezultat
  FROM public.products p
 WHERE p.id IN ('e8c320d1-2fc8-415c-9b73-cbb77f73cd84',
              '8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8',
              'ef3a2353-6536-4fc0-bca6-cd4fe0df335c',
              'a236076a-f146-4d34-9fb5-e8721b71b938',
              'dade5c34-f42b-4a9c-950b-e205edfc5f52',
              '02005fee-cda7-4d41-8646-5dbb84ef2e20',
              '250c22c3-78ad-4f3d-bf9a-b722460df02f',
              'f98da138-2aa9-441d-933f-2e914d3198fa');

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: 8 строк, в колонке na_saite — как в описании товара:
--  «от 6 месяцев» ×3, «от 9 месяцев», «от 18 месяцев» ×3,
--  «от 18 месяцев до 8 лет»; в otvet_v_voprosah — то же самое словами
--  «Производитель рекомендует для детей от … .».

SELECT left(p.name, 60) AS name,
       p.min_age_months, p.max_age_months,
       p.min_age_years, p.max_age_years,
       public.age_range_ru(p.min_age_months, p.max_age_months) AS na_saite,
       (SELECT q.answer_text FROM public.product_questions q
         WHERE q.product_id = p.id AND q.is_auto_generated
           AND q.question_text LIKE 'С какого возраста%') AS otvet_v_voprosah
  FROM public.products p
 WHERE p.id IN ('e8c320d1-2fc8-415c-9b73-cbb77f73cd84',
              '8e4a95b7-a91c-4eff-9c41-4bc9087ee4c8',
              'ef3a2353-6536-4fc0-bca6-cd4fe0df335c',
              'a236076a-f146-4d34-9fb5-e8721b71b938',
              'dade5c34-f42b-4a9c-950b-e205edfc5f52',
              '02005fee-cda7-4d41-8646-5dbb84ef2e20',
              '250c22c3-78ad-4f3d-bf9a-b722460df02f',
              'f98da138-2aa9-441d-933f-2e914d3198fa')
 ORDER BY p.min_age_months, p.name;

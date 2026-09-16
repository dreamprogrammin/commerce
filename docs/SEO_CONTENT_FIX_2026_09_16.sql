-- ═══════════════════════════════════════════════════════════════════════════
--  Ложные обещания в текстах базы — подготовлено 16 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЧТО ЭТО. Готовые запросы к БОЕВОЙ базе. Ничего не применяется само:
--  раздел 0 только считает, разделы 1–6 правят, раздел 7 проверяет результат.
--  Схему файл НЕ меняет — только тексты, поэтому его место не в миграциях.
--
--  КАК ЗАПУСКАТЬ. По одному разделу, в транзакции, сверяя число задетых строк
--  с ожидаемым (оно написано у каждого раздела):
--
--      BEGIN;
--      -- вставить UPDATE одного раздела
--      -- посмотреть «UPDATE N» и сверить с ожидаемым
--      COMMIT;   -- или ROLLBACK, если N не сошлось
--
--  Запросы идемпотентны: второй прогон задевает ноль строк.
--
--  ОТКУДА ЦИФРЫ. Выборка по боевой базе 16 сентября 2026 анонимным ключом:
--
--      таблица                    10 000 ₸   1-2 дня   1 день при   до 50%   🔥
--                                                        заказе
--      category_questions (191)       63        43          0          3     42
--      product_questions  (315)      105         0          0          0      0
--      category_brand_questions (52)  26         0         13          0      0
--      brand_questions     (50)        0         0          0          0      0
--
--      products.description: 83 из 178 содержат один и тот же абзац про
--      доставку, 60 из них — призыв «Заказывайте прямо сейчас!».
--
--  ПРОВЕРЕНО ЗАПУСКОМ, а не глазами. Все запросы прогнаны на ЛОКАЛЬНОЙ базе в
--  транзакции с откатом: боевые тексты подставлены дословно, правки применены,
--  результат осмотрен, `ROLLBACK`. HTML после вырезания остаётся целым (теги
--  `<strong>` закрыты, лишних пробелов нет), контрольные запросы дали нули.
--  Отдельно сверено, что выражение из раздела 5 накрывает ВСЕ 83 карточки на
--  бою, а не часть. Повторить проверку можно так:
--
--      sg docker -c "docker exec -i supabase_db_<ref> psql -U postgres -d postgres" \
--        < ваш_файл.sql          # с BEGIN … ROLLBACK по краям
--
--  ⚠️ ГЛАВНОЕ, ЧТО НУЖНО ЗНАТЬ ДО ПРАВКИ. Эти тексты пишет ГЕНЕРАТОР —
--  SQL-функции `generate_category_questions`, `generate_product_questions`,
--  `generate_category_brand_faq` и шаблоны в `composables/useSeoTemplates.ts`.
--  Пока в них те же формулировки, любая новая генерация вернёт ложные обещания
--  обратно.
--
--  ГЕНЕРАТОР УЖЕ ПОЧИНЕН — ждёт применения:
--      supabase/migrations/20260916130000_fix_delivery_claims_in_generators.sql
--      supabase/migrations/20260916140000_fix_brand_faq_prices.sql
--  Их применяет CI кнопкой Run workflow с подтверждением `APPLY`.
--
--  ПОПРАВКА. Здесь стояло, что тела функций агенту не видны и их нужно прислать
--  вручную. Это неверно: `supabase db dump --linked` читает прод-схему, доступ у
--  CLI на этой машине есть. Тела для миграций сняты с прода, как велит п. 7
--  раздела «Как мы работаем».
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. СНАЧАЛА ПОСЧИТАТЬ ───────────────────────────────────────────────────
-- Ничего не меняет. Если числа разойдутся с таблицей выше — база успела
-- измениться, и правки ниже стоит пересчитать, а не запускать вслепую.

SELECT 'category_questions'       AS таблица,
       count(*) FILTER (WHERE answer_text LIKE '%10 000 ₸%')        AS порог_10000,
       count(*) FILTER (WHERE answer_text LIKE '%1-2 дня%')         AS срок_1_2_дня,
       count(*) FILTER (WHERE answer_text ILIKE '%до 50%%')         AS скидка_50,
       count(*) FILTER (WHERE answer_text LIKE '%🔥%')              AS эмодзи
  FROM public.category_questions
UNION ALL
SELECT 'product_questions',
       count(*) FILTER (WHERE answer_text LIKE '%10 000 ₸%'),
       count(*) FILTER (WHERE answer_text LIKE '%1-2 дня%'),
       count(*) FILTER (WHERE answer_text ILIKE '%до 50%%'),
       count(*) FILTER (WHERE answer_text LIKE '%🔥%')
  FROM public.product_questions
UNION ALL
SELECT 'category_brand_questions',
       count(*) FILTER (WHERE answer_text LIKE '%10 000 ₸%'),
       count(*) FILTER (WHERE answer_text LIKE '%1 день при заказе%'),
       count(*) FILTER (WHERE answer_text ILIKE '%до 50%%'),
       count(*) FILTER (WHERE answer_text LIKE '%🔥%')
  FROM public.category_brand_questions;

-- Страховка к разделу 1: «10 000 ₸» должно встречаться ТОЛЬКО рядом со словом
-- «бесплатн…». Если этот запрос вернёт строки — там сумма означает не порог, а
-- что-то другое (например цену), и такие строки правятся руками.
SELECT 'category_questions' AS таблица, id, answer_text FROM public.category_questions
 WHERE answer_text LIKE '%10 000 ₸%'
   AND answer_text !~* '(бесплатн[^.!?]{0,60}10 000 ₸)|(10 000 ₸[^.!?]{0,40}бесплатн)'
UNION ALL
SELECT 'product_questions', id, answer_text FROM public.product_questions
 WHERE answer_text LIKE '%10 000 ₸%'
   AND answer_text !~* '(бесплатн[^.!?]{0,60}10 000 ₸)|(10 000 ₸[^.!?]{0,40}бесплатн)'
UNION ALL
SELECT 'category_brand_questions', id, answer_text FROM public.category_brand_questions
 WHERE answer_text LIKE '%10 000 ₸%'
   AND answer_text !~* '(бесплатн[^.!?]{0,60}10 000 ₸)|(10 000 ₸[^.!?]{0,40}бесплатн)';


-- ── 1. ПОРОГ БЕСПЛАТНОЙ ДОСТАВКИ: 10 000 ₸ → 15 000 ₸ ──────────────────────
--
--  Это не косметика, а обещание, которого магазин не выполняет. В корзине
--  порог считается по `FREE_SHIPPING_THRESHOLD = 15000` (constants/index.ts),
--  а 194 ответа обещают бесплатную доставку от десяти тысяч. Покупатель читает
--  ответ на странице, добирает корзину до 10 000 и на оформлении видит другую
--  сумму.
--
--  Ожидаемо: 63 + 105 + 26 = 194 строки.

UPDATE public.category_questions
   SET answer_text = replace(answer_text, '10 000 ₸', '15 000 ₸')
 WHERE answer_text LIKE '%10 000 ₸%';

UPDATE public.product_questions
   SET answer_text = replace(answer_text, '10 000 ₸', '15 000 ₸')
 WHERE answer_text LIKE '%10 000 ₸%';

UPDATE public.category_brand_questions
   SET answer_text = replace(answer_text, '10 000 ₸', '15 000 ₸')
 WHERE answer_text LIKE '%10 000 ₸%';


-- ── 2. СРОК ДОСТАВКИ: «1-2 дня» и «1 день» → «1–3 рабочих дня» ─────────────
--
--  По опубликованным условиям `/terms` доставка по Алматы занимает 1–3 рабочих
--  дня, по Казахстану 3–7. Формулировку «за 1-2 дня» мы уже убирали из
--  сниппетов категорий и с лендинга бренда — здесь то же самое, но в тексте
--  вопросов на странице.
--
--  Ожидаемо: 43 строки в category_questions, 13 в category_brand_questions.

UPDATE public.category_questions
   SET answer_text = replace(answer_text, '1-2 дня', '1–3 рабочих дня')
 WHERE answer_text LIKE '%1-2 дня%';

-- «…занимает 1 день при заказе до 18:00.» — обещание к тому же с условием,
-- которое нигде не опубликовано. Заменяем предложение целиком.
UPDATE public.category_brand_questions
   SET answer_text = regexp_replace(
         answer_text,
         'занимает 1 день при заказе до 18:00',
         'занимает 1–3 рабочих дня',
         'g')
 WHERE answer_text LIKE '%1 день при заказе%';


-- ── 3. «СКИДКИ ДО 50%» — РАЗДЕЛ СНЯТ, НЕ ЗАПУСКАТЬ ────────────────────────
--
--  Здесь стоял запрос, вырезающий фразу «Скидки до 50%». Он БЫЛ НЕВЕРЕН, и я
--  это проверил уже после того, как написал: скидка настоящая. Текст собирает
--  функция `generate_category_questions`, и процент в нём — не выдумка
--  маркетолога, а `MAX(discount_percentage)` по живым товарам категории.
--
--  Сверка по бою 16 сентября 2026: три куклы Mermaze Mermaidz со скидкой 50%,
--  конструктор Sluban 40%, головоломка 35%. То есть «до 50%» — правда.
--
--  Что с этим не так на самом деле: цифра ЗАМОРОЖЕНА в момент генерации. Если
--  скидка кончится, текст останется. Это общая беда сохранённых сгенерированных
--  ответов, а не ложь, и удалением фразы она не лечится.
--
--  Эмодзи 🔥 рядом с этой фразой — отдельная история, он убирается разделом 4.

-- ── 4. ЭМОДЗИ В ОТВЕТАХ ────────────────────────────────────────────────────
--
--  🔥 в тексте ответа Google из русской выдачи вырезает, а знаки под него
--  тратятся. То же правило, что для описаний категорий (`composeCategoryMeta`).
--
--  Ожидаемо: 42 строки.

UPDATE public.category_questions
   SET answer_text = trim(regexp_replace(replace(answer_text, '🔥', ''), '\s{2,}', ' ', 'g'))
 WHERE answer_text LIKE '%🔥%';


-- ── 5. ОДИН И ТОТ ЖЕ АБЗАЦ ПРО ДОСТАВКУ В 83 КАРТОЧКАХ ─────────────────────
--
--  «Доставляем по всему Казахстану — в Алматы, Астану, Шымкент и другие
--  города. Удобная оплата, быстрая доставка и оригинальный товар с гарантией
--  качества. Заказывайте прямо сейчас!»
--
--  Дословно повторяется в 83 карточках из 178 — почти половина каталога. Для
--  поиска это дубль, для покупателя — абзац, не говорящий ничего о товаре;
--  условия доставки и так есть в разметке и в `/terms`.
--
--  ⚠️ РЕШЕНИЕ ВАШЕ: удалить абзац (ниже) или оставить и смириться с дублем.
--  Ожидаемо: 83 строки.

UPDATE public.products
   SET description = trim(regexp_replace(
         description,
         '<p>\s*Доставляем по всему Казахстану[^<]*</p>\s*',
         '',
         'g'))
 WHERE description LIKE '%Доставляем по всему Казахстану%';


-- ── 6. ПУНКТ САМОВЫВОЗА ────────────────────────────────────────────────────
--
--  Таблица `pickup_points` ПУСТА, хотя самовывозом идёт большинство заказов
--  (42 из 45 по замеру 3 сентября, см. `utils/orderStatus.ts`). Блок с адресом
--  на оформлении рисуется только при `length > 0`, поэтому покупатель выбирает
--  самовывоз и не узнаёт, куда ехать.
--
--  ⚠️ ЗНАЧЕНИЯ НИЖЕ — ЧЕРНОВИК из того, что опубликовано на `/about`. Адрес без
--  номера дома, а часы — те, что вы назвали 15 сентября. Проверьте всё три
--  поля перед запуском.

INSERT INTO public.pickup_points (name, address, working_hours, phone, note, is_active, display_order)
VALUES (
  'Склад Ухтышки',                                  -- как назвать пункт покупателю
  'г. Алматы, мкр. Шапагат, ул. Амангельды, ?',      -- ⚠️ номер дома
  'ежедневно 9:00–21:00',                            -- ⚠️ сверить
  '+7 702 537 94 73',
  NULL,                                              -- «вход со двора», «2 этаж» — если нужно
  TRUE,
  0
);


-- ── 7. ПРОВЕРКА ПОСЛЕ ПРАВОК ───────────────────────────────────────────────
-- Все четыре числа должны стать нулями.

SELECT 'порог 10 000 ₸'          AS что_ищем,
       (SELECT count(*) FROM public.category_questions       WHERE answer_text LIKE '%10 000 ₸%')
     + (SELECT count(*) FROM public.product_questions        WHERE answer_text LIKE '%10 000 ₸%')
     + (SELECT count(*) FROM public.category_brand_questions WHERE answer_text LIKE '%10 000 ₸%') AS осталось
UNION ALL
SELECT 'срок 1-2 дня',
       (SELECT count(*) FROM public.category_questions WHERE answer_text LIKE '%1-2 дня%')
UNION ALL
SELECT 'срок 1 день при заказе',
       (SELECT count(*) FROM public.category_brand_questions WHERE answer_text LIKE '%1 день при заказе%')
UNION ALL
-- Не ошибка, а справка: процент берётся из настоящих скидок товаров.
SELECT 'упоминаний «до 50%» (это правда, не чиним)',
       (SELECT count(*) FROM public.category_questions WHERE position('до 50%' in answer_text) > 0)
UNION ALL
SELECT 'эмодзи 🔥',
       (SELECT count(*) FROM public.category_questions WHERE answer_text LIKE '%🔥%')
UNION ALL
SELECT 'общий абзац в карточках',
       (SELECT count(*) FROM public.products WHERE description LIKE '%Доставляем по всему Казахстану%')
UNION ALL
SELECT 'пунктов самовывоза (должен быть 1)',
       (SELECT count(*) FROM public.pickup_points WHERE is_active);


-- ═══════════════════════════════════════════════════════════════════════════
--  ОТДЕЛЬНЫЙ ВОПРОС: 191 шаблонный вопрос категорий
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Их писал не человек, а SQL-генератор: по четыре на категорию, по одному
--  шаблону. Названия подставляются как есть, а они у нас в дательном падеже,
--  и получается «Что такое Девочкам?», «Сколько стоят Девочкам в Алматы?».
--  Плюс внутри ответов замороженные числа («37 товаров» при нынешних 38).
--
--  Четырём корневым разделам — девочкам, мальчикам, малышам, конструкторы —
--  вопросы уже написаны руками и лежат в репозитории
--  (`constants/categoryStaticText.ts`), шаблонные там скрыты кодом.
--
--  ВАРИАНТ А (рекомендую): удалить шаблонные вопросы там, где они читаются
--  сломанно, и постепенно писать нормальные в репозиторий, как для четырёх
--  разделов. Сломанными считаем те, где название стоит в дательном падеже —
--  оканчивается на «ам»/«ям».

--  Сначала посмотреть, что попадёт под удаление:
SELECT c.name, q.question_text
  FROM public.category_questions q
  JOIN public.categories c ON c.id = q.category_id
 WHERE q.is_auto_generated
   AND (c.name ILIKE '%ам' OR c.name ILIKE '%ям')
 ORDER BY c.name, q.question_text;

--  И только потом удалять:
-- DELETE FROM public.category_questions q
--  USING public.categories c
--  WHERE q.category_id = c.id
--    AND q.is_auto_generated
--    AND (c.name ILIKE '%ам' OR c.name ILIKE '%ям');

--  ВАРИАНТ Б: не удалять, а переписать формулировку так, чтобы падеж не
--  мешал — название в кавычках как имя раздела. Ответы при этом останутся
--  прежними, со своей ломаной грамматикой внутри, поэтому вариант половинчатый.
--
-- UPDATE public.category_questions q SET question_text = 'Что есть в разделе «' || c.name || '»?'
--   FROM public.categories c WHERE q.category_id = c.id AND q.question_text = 'Что такое ' || c.name || '?';
-- UPDATE public.category_questions q SET question_text = 'Сколько стоят товары раздела «' || c.name || '» в Алматы?'
--   FROM public.categories c WHERE q.category_id = c.id AND q.question_text = 'Сколько стоят ' || c.name || ' в Алматы?';
-- UPDATE public.category_questions q SET question_text = 'Какие бренды есть в разделе «' || c.name || '»?'
--   FROM public.categories c WHERE q.category_id = c.id AND q.question_text = 'Какие бренды ' || c.name || ' можно купить?';
-- UPDATE public.category_questions q SET question_text = 'Как быстро доставят заказ из раздела «' || c.name || '» по Алматы?'
--   FROM public.categories c WHERE q.category_id = c.id AND q.question_text = 'Как быстро доставите ' || c.name || ' в Алматы?';

-- ═══════════════════════════════════════════════════════════════════════════
--  Пустые иконки в описаниях товаров — подготовлено 21 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЧТО СЛУЧИЛОСЬ. В описаниях товаров иконки задаются атрибутом
--  data-icon="fluent-emoji-flat:<имя>". Пять имён в коллекции НЕ
--  СУЩЕСТВУЮТ — браузер рисует на их месте пустое место. Сервер иконок на
--  такой запрос отвечает пустотой (проверено: /api/_nuxt_icon/…?icons=
--  direct-hit). Задето 102 карточки из 178.
--
--  Похоже, имена придумывались по английскому названию эмодзи в Юникоде
--  («direct hit» — это 🎯), а в Fluent Emoji у той же картинки своё имя.
--
--      было              карточек   стало              почему
--      direct-hit          80       bullseye           та же 🎯
--      gem                 34       gem-stone          та же 💎
--      superhero            3       person-superhero   🦸 без пола; наборы LEGO Marvel
--      dinosaur             3       sauropod           🦕; наборы с динозаврами
--      treasure-chest       1       gem-stone          сундука в эмодзи нет; «Охота за сокровищами»
--
--  Все пять новых имён проверены по коллекции @iconify-json/fluent-emoji-flat
--  1.2.5 — существуют.
--
--  ПРОВЕРЕНО ЗАПУСКОМ: все описания с боя положены во временную таблицу
--  локальной базы, правка применена, ROLLBACK; после неё несуществующих
--  имён ноль.
--
--  ИДЕМПОТЕНТНО: второй прогон задевает ноль строк.

-- ── 0. СНАЧАЛА ПОСЧИТАТЬ ───────────────────────────────────────────────────
--  Ожидаемо на 21 сентября: 80, 34, 3, 3, 1.

SELECT count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:direct-hit"%')     AS direct_hit,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:gem"%')            AS gem,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:superhero"%')      AS superhero,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:dinosaur"%')       AS dinosaur,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:treasure-chest"%') AS treasure_chest
  FROM public.products;


-- ── 1. ПРАВКА ──────────────────────────────────────────────────────────────
--  Кавычка в конце шаблона обязательна: без неё «gem» задело бы и
--  «gem-stone», которое и так правильное.

BEGIN;

UPDATE public.products
   SET description = replace(replace(replace(replace(replace(description,
         'fluent-emoji-flat:direct-hit"',     'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"',            'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"',      'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:dinosaur"',       'fluent-emoji-flat:sauropod"'),
         'fluent-emoji-flat:treasure-chest"', 'fluent-emoji-flat:gem-stone"')
 WHERE description LIKE '%fluent-emoji-flat:direct-hit"%'
    OR description LIKE '%fluent-emoji-flat:gem"%'
    OR description LIKE '%fluent-emoji-flat:superhero"%'
    OR description LIKE '%fluent-emoji-flat:dinosaur"%'
    OR description LIKE '%fluent-emoji-flat:treasure-chest"%';

--  Ожидаемо: UPDATE 102.
COMMIT;


-- ── 2. ПРОВЕРИТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: пять нулей.

SELECT count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:direct-hit"%')     AS direct_hit,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:gem"%')            AS gem,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:superhero"%')      AS superhero,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:dinosaur"%')       AS dinosaur,
       count(*) FILTER (WHERE description LIKE '%fluent-emoji-flat:treasure-chest"%') AS treasure_chest
  FROM public.products;

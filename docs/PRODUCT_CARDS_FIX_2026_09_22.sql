-- ═══════════════════════════════════════════════════════════════════════════
--  Две карточки: возраст каталок-твистеров и серия набора L.O.L. — 22.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ.
--
--  1. Каталки-твистеры Bibi Car Капибара KS105 — три цвета (G, K, R). В
--     характеристиках «от 1 года» (min_age_years = 1), а в описании дважды
--     «рекомендована детям старше 3 лет». Возраст из характеристик идёт в
--     карточку («Рекомендованный возраст»), в фильтр по возрасту и в факты
--     разделов: родителю годовалого ребёнка сайт показывает каталку, которую
--     производитель советует с трёх. На фото тоже катается ребёнок постарше.
--     ЕСЛИ НА КОРОБКЕ ДРУГОЙ ВОЗРАСТ — блок 1 не запускайте, скажите.
--
--  2. Набор «L.O.L. Surprise Movie Magic». На фото — шар «Movie Magic» и
--     «10 surprises», в поле «артикул» (sku) — 576471: у MGA это и есть
--     Movie Magic. А в названии, описании для поиска и описании стоит 576600 —
--     артикул другой куклы, «Winter Chill Confetti» (под ним её продают
--     магазины, штрихкод 035051576600). В описании так прямо и написано:
--     «Набор-сюрприз L.O.L. Surprise Under Wraps Winter Chill Confetti Reveal
--     арт. 576600».
--
--  ЧТО ДЕЛАЕТ.
--
--  1. Твистеры: min_age_years 1 → 3. Только там, где всё ещё 1.
--  2. Набор L.O.L.: 576600 → 576471 в названии, описании для поиска и
--     описании; «Under Wraps Winter Chill Confetti Reveal» → «Movie Magic».
--     Только если все три поля такие же, как 22 сентября (md5), — правку
--     руками не затрёт. Адрес страницы НЕ меняется, хотя в нём тоже 576600:
--     новый адрес страница набирала бы в поиске заново, а ради артикула в
--     ссылке это того не стоит.
--
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых значений, в
--  транзакции с откатом: UPDATE 3 и UPDATE 1, повторный запуск — UPDATE 0 и
--  UPDATE 0.

-- ── 0. ПОСМОТРЕТЬ ─────────────────────────────────────────────────────────

SELECT left(name, 70) AS name, min_age_years, sku
  FROM public.products
 WHERE id IN ('5f7dd8f1-457a-41ae-ad26-d0958250dace', '4dd5375a-3686-4841-9daa-d313d80cda3c', 'e8f8393c-0f51-41be-b233-4517cdd1e072', 'b9ea8841-041a-427a-9d0b-0b6820800d05')
 ORDER BY name;

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: UPDATE 3, затем UPDATE 1. UPDATE 0 — поле уже кто-то поправил,
--  ничего не перезаписано.

BEGIN;

UPDATE public.products
   SET min_age_years = 3
 WHERE id IN ('4dd5375a-3686-4841-9daa-d313d80cda3c',
              'e8f8393c-0f51-41be-b233-4517cdd1e072',
              'b9ea8841-041a-427a-9d0b-0b6820800d05')
   AND min_age_years = 1;

UPDATE public.products
   SET name            = replace(name, '576600', '576471'),
       seo_description = replace(seo_description, '576600', '576471'),
       description     = replace(replace(description,
                           'Under Wraps Winter Chill Confetti Reveal', 'Movie Magic'),
                           '576600', '576471')
 WHERE id = '5f7dd8f1-457a-41ae-ad26-d0958250dace'
   AND md5(name)            = '541caf7bd65638737220e7a83b3cf825'
   AND md5(seo_description) = '3f4497a8e945b92602d5f808f12f28e6'
   AND md5(description)     = '68d9fa34d4387043c2a8bf4426c7227e';

COMMIT;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: четыре строки. У трёх каталок min_age_years = 3. У набора
--  L.O.L. est_576600 = false, est_winter_chill = false, v_nazvanii_576471 = true.

SELECT left(name, 70) AS name,
       min_age_years,
       (name || coalesce(seo_description, '') || coalesce(description, '')) LIKE '%576600%' AS est_576600,
       coalesce(description, '') LIKE '%Winter Chill%' AS est_winter_chill,
       name LIKE '%576471%' AS v_nazvanii_576471
  FROM public.products
 WHERE id IN ('5f7dd8f1-457a-41ae-ad26-d0958250dace', '4dd5375a-3686-4841-9daa-d313d80cda3c', 'e8f8393c-0f51-41be-b233-4517cdd1e072', 'b9ea8841-041a-427a-9d0b-0b6820800d05')
 ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════════
--  Пустые иконки в текстах разделов, брендов и линеек — 21 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЧТО СЛУЧИЛОСЬ. Продолжение SEO_ICON_NAMES_FIX_2026_09_21.sql: после
--  правки товаров проверены все тексты с data-icon в базе. Битые имена
--  нашлись ещё в трёх таблицах — это пустые иконки на страницах разделов,
--  бренд-лендингах и страницах линеек:
--
--      разделы   doll ×1, bulldozer ×1, squeeze-bottle ×1
--      бренды    direct-hit ×7, gem ×4, doll ×1, superhero ×1, mermaid ×1
--      линейки   direct-hit ×8, superhero ×5
--  (товары и связки категория+бренд — чистые)
--
--  ЗАМЕНЫ. Первые три — те же, что для товаров; для остальных прямой эмодзи
--  нет, выбрано по смыслу текста рядом:
--
--      direct-hit      → bullseye              та же 🎯
--      gem             → gem-stone             та же 💎
--      superhero       → person-superhero      🦸
--      doll            → princess              👸 «Интерактивные куклы», Barbie
--      bulldozer       → building-construction 🏗 «Спецтехника — герои строек»
--      squeeze-bottle  → relieved-face         😌 «Антистресс — мни, дави и расслабляйся»
--      mermaid         → spiral-shell          🐚 «Mermaze Mermaidz — русалки»
--
--  Все новые имена проверены по @iconify-json/fluent-emoji-flat 1.2.5.
--  Кавычка в конце шаблонов обязательна: без неё «gem» задело бы «gem-stone».
--
--  ПРОВЕРЕНО ЗАПУСКОМ на свежей выгрузке трёх таблиц с боя во временных
--  таблицах, ROLLBACK. ИДЕМПОТЕНТНО.

BEGIN;

UPDATE public.categories
   SET description = replace(replace(replace(replace(replace(replace(replace(description,
         'fluent-emoji-flat:direct-hit"', 'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"', 'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"', 'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:doll"', 'fluent-emoji-flat:princess"'),
         'fluent-emoji-flat:bulldozer"', 'fluent-emoji-flat:building-construction"'),
         'fluent-emoji-flat:squeeze-bottle"', 'fluent-emoji-flat:relieved-face"'),
         'fluent-emoji-flat:mermaid"', 'fluent-emoji-flat:spiral-shell"'),
       seo_text = replace(replace(replace(replace(replace(replace(replace(seo_text,
         'fluent-emoji-flat:direct-hit"', 'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"', 'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"', 'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:doll"', 'fluent-emoji-flat:princess"'),
         'fluent-emoji-flat:bulldozer"', 'fluent-emoji-flat:building-construction"'),
         'fluent-emoji-flat:squeeze-bottle"', 'fluent-emoji-flat:relieved-face"'),
         'fluent-emoji-flat:mermaid"', 'fluent-emoji-flat:spiral-shell"')
 WHERE description LIKE '%fluent-emoji-flat:direct-hit"%'
    OR description LIKE '%fluent-emoji-flat:gem"%'
    OR description LIKE '%fluent-emoji-flat:superhero"%'
    OR description LIKE '%fluent-emoji-flat:doll"%'
    OR description LIKE '%fluent-emoji-flat:bulldozer"%'
    OR description LIKE '%fluent-emoji-flat:squeeze-bottle"%'
    OR description LIKE '%fluent-emoji-flat:mermaid"%'
    OR seo_text LIKE '%fluent-emoji-flat:direct-hit"%'
    OR seo_text LIKE '%fluent-emoji-flat:gem"%'
    OR seo_text LIKE '%fluent-emoji-flat:superhero"%'
    OR seo_text LIKE '%fluent-emoji-flat:doll"%'
    OR seo_text LIKE '%fluent-emoji-flat:bulldozer"%'
    OR seo_text LIKE '%fluent-emoji-flat:squeeze-bottle"%'
    OR seo_text LIKE '%fluent-emoji-flat:mermaid"%';

UPDATE public.brands
   SET description = replace(replace(replace(replace(replace(replace(replace(description,
         'fluent-emoji-flat:direct-hit"', 'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"', 'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"', 'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:doll"', 'fluent-emoji-flat:princess"'),
         'fluent-emoji-flat:bulldozer"', 'fluent-emoji-flat:building-construction"'),
         'fluent-emoji-flat:squeeze-bottle"', 'fluent-emoji-flat:relieved-face"'),
         'fluent-emoji-flat:mermaid"', 'fluent-emoji-flat:spiral-shell"'),
       seo_text = replace(replace(replace(replace(replace(replace(replace(seo_text,
         'fluent-emoji-flat:direct-hit"', 'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"', 'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"', 'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:doll"', 'fluent-emoji-flat:princess"'),
         'fluent-emoji-flat:bulldozer"', 'fluent-emoji-flat:building-construction"'),
         'fluent-emoji-flat:squeeze-bottle"', 'fluent-emoji-flat:relieved-face"'),
         'fluent-emoji-flat:mermaid"', 'fluent-emoji-flat:spiral-shell"')
 WHERE description LIKE '%fluent-emoji-flat:direct-hit"%'
    OR description LIKE '%fluent-emoji-flat:gem"%'
    OR description LIKE '%fluent-emoji-flat:superhero"%'
    OR description LIKE '%fluent-emoji-flat:doll"%'
    OR description LIKE '%fluent-emoji-flat:bulldozer"%'
    OR description LIKE '%fluent-emoji-flat:squeeze-bottle"%'
    OR description LIKE '%fluent-emoji-flat:mermaid"%'
    OR seo_text LIKE '%fluent-emoji-flat:direct-hit"%'
    OR seo_text LIKE '%fluent-emoji-flat:gem"%'
    OR seo_text LIKE '%fluent-emoji-flat:superhero"%'
    OR seo_text LIKE '%fluent-emoji-flat:doll"%'
    OR seo_text LIKE '%fluent-emoji-flat:bulldozer"%'
    OR seo_text LIKE '%fluent-emoji-flat:squeeze-bottle"%'
    OR seo_text LIKE '%fluent-emoji-flat:mermaid"%';

UPDATE public.product_lines
   SET description = replace(replace(replace(replace(replace(replace(replace(description,
         'fluent-emoji-flat:direct-hit"', 'fluent-emoji-flat:bullseye"'),
         'fluent-emoji-flat:gem"', 'fluent-emoji-flat:gem-stone"'),
         'fluent-emoji-flat:superhero"', 'fluent-emoji-flat:person-superhero"'),
         'fluent-emoji-flat:doll"', 'fluent-emoji-flat:princess"'),
         'fluent-emoji-flat:bulldozer"', 'fluent-emoji-flat:building-construction"'),
         'fluent-emoji-flat:squeeze-bottle"', 'fluent-emoji-flat:relieved-face"'),
         'fluent-emoji-flat:mermaid"', 'fluent-emoji-flat:spiral-shell"')
 WHERE description LIKE '%fluent-emoji-flat:direct-hit"%'
    OR description LIKE '%fluent-emoji-flat:gem"%'
    OR description LIKE '%fluent-emoji-flat:superhero"%'
    OR description LIKE '%fluent-emoji-flat:doll"%'
    OR description LIKE '%fluent-emoji-flat:bulldozer"%'
    OR description LIKE '%fluent-emoji-flat:squeeze-bottle"%'
    OR description LIKE '%fluent-emoji-flat:mermaid"%';

COMMIT;

-- ── ПРОВЕРИТЬ ──────────────────────────────────────────────────────────────
--  Ожидаемо: три нуля.

SELECT (SELECT count(*) FROM public.categories WHERE description ~ 'fluent-emoji-flat:(direct-hit|gem|superhero|doll|bulldozer|squeeze-bottle|mermaid)"' OR seo_text ~ 'fluent-emoji-flat:(direct-hit|gem|superhero|doll|bulldozer|squeeze-bottle|mermaid)"') AS categories,
       (SELECT count(*) FROM public.brands WHERE description ~ 'fluent-emoji-flat:(direct-hit|gem|superhero|doll|bulldozer|squeeze-bottle|mermaid)"' OR seo_text ~ 'fluent-emoji-flat:(direct-hit|gem|superhero|doll|bulldozer|squeeze-bottle|mermaid)"') AS brands,
       (SELECT count(*) FROM public.product_lines WHERE description ~ 'fluent-emoji-flat:(direct-hit|gem|superhero|doll|bulldozer|squeeze-bottle|mermaid)"') AS product_lines;

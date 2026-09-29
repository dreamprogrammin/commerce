-- Вопросы на страницах брендов: цена до скидки и без пробелов, «в 1 категориях»,
-- описание бренда целиком внутри ответа — вместе со старым абзацем про доставку.
--
-- ЧТО ВИДЕЛ ПОКУПАТЕЛЬ (боевая база, 26 сентября 2026, 76 вопросов у 32 брендов,
-- все созданы генератором 16 сентября):
--
--   «Сколько стоят игрушки MokaToys?» — «варьируются от 7990 до 19990 тенге»:
--       цена без скидки (`price`, а не `final_price`), без пробела между
--       разрядами и «тенге» вместо «₸» (формат из CLAUDE.md: «1 000 ₸»);
--   «В каких категориях представлены…» — «в 1 категориях нашего каталога», и
--       названия разделов в дательном падеже («Конструкторы Мальчикам»);
--   «Какие игрушки выпускает бренд…» — описание бренда ЦЕЛИКОМ, с абзацем
--       «Купить … в Казахстане»: в 9 ответах «Срок доставки 1–3 рабочих дня»
--       сразу после «доставкой по всему Казахстану» (по /terms — 3–7), а у пустых
--       брендов — «представлен 0 игрушками в нашем каталоге».
--
-- Три соседних генератора (разделов, товаров, связок «раздел + бренд»)
-- исправлены миграциями 16–17 сентября; этот пропустили. Кнопка «сгенерировать
-- вопросы для всех брендов» в админке вызывает именно его, поэтому правится
-- функция, а не только тексты: иначе первое же нажатие вернуло бы всё обратно.
--
-- ЧТО МЕНЯЕТСЯ:
--   • о бренде — первый абзац описания, который про сам бренд (абзацы про
--     доставку и наличие пропускаются), без разметки, и «В каталоге Ухтышки —
--     N моделей X» либо «Сейчас товаров X нет в наличии»;
--   • разделы — читаемые названия (`seo_h1`): «в разделе «…»» / «в разделах: …»;
--   • цены — по цене со скидкой, «от 7 490 до 18 890 ₸»;
--   • счёт — по всем товарам бренда: прежний GROUP BY по стране делил их на
--     группы, и LIMIT 1 брал одну из них;
--   • порядок вопросов задан явно (100/200/300), раньше у всех было 999.
--
-- Подпись та же (uuid, boolean), права не меняются — вызовы из админки и
-- триггер auto_generate_brand_faq работают как прежде. Тело снято с прода
-- (`supabase db dump --linked`, 24 сентября 2026; миграций на эту функцию с тех
-- пор нет — `supabase migration list --linked` 26 сентября).
--
-- Тексты в базе эта миграция НЕ трогает: пересобирает их
-- `docs/BRAND_TEXTS_2026_09_26.sql` — его запускать ПОСЛЕ миграции.

-- База та, под которую писалось: у функции старый шаблон (или уже новый — тогда
-- повторное применение безвредно), и есть plural_ru из миграции 16 сентября.
DO $check$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.generate_brand_questions(uuid,boolean)'::regprocedure) INTO v_def;
  IF v_def NOT LIKE '%варьируются от%' AND v_def NOT LIKE '%В каталоге Ухтышки%' THEN
    RAISE EXCEPTION 'generate_brand_questions не та, под которую писалась миграция — сверьте тело с продом';
  END IF;
  PERFORM 'public.plural_ru(integer,text,text,text)'::regprocedure;
END
$check$;

CREATE OR REPLACE FUNCTION public.generate_brand_questions(p_brand_id uuid, p_skip_ai boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_brand_name TEXT;
  v_brand_description TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_categories_count INTEGER;
  v_product_lines_count INTEGER;
  v_categories TEXT;
  v_lead TEXT;
  v_first_category TEXT;
  v_rest TEXT;
  v_pos INTEGER;
BEGIN
  SELECT b.name, b.description
    INTO v_brand_name, v_brand_description
    FROM public.brands b
   WHERE b.id = p_brand_id;

  IF v_brand_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Brand not found');
  END IF;

  -- Все активные товары бренда разом. Цена — та, что платит покупатель.
  SELECT count(DISTINCT p.id),
         min(p.final_price),
         max(p.final_price),
         count(DISTINCT p.category_id),
         count(DISTINCT p.product_line_id),
         string_agg(DISTINCT COALESCE(NULLIF(btrim(cat.seo_h1), ''), cat.name), ', '
                    ORDER BY COALESCE(NULLIF(btrim(cat.seo_h1), ''), cat.name))
    INTO v_products_count, v_min_price, v_max_price, v_categories_count,
         v_product_lines_count, v_categories
    FROM public.products p
    LEFT JOIN public.categories cat ON cat.id = p.category_id
   WHERE p.brand_id = p_brand_id
     AND p.is_active = true;

  -- Первый абзац описания, который про сам бренд: абзацы про доставку и
  -- наличие («Купить … в Казахстане», «Какие модели сейчас в наличии…»)
  -- пропускаются, разметка внутри абзаца снимается. Ищется позициями, а не
  -- регуляркой `<p>(.*?)</p>`: в PostgreSQL жадность всего выражения задаёт
  -- первый квантификатор, и «ленивая» часть там может дотянуться до
  -- последнего </p>. Нет такого абзаца — ответ без него.
  v_rest := COALESCE(v_brand_description, '');
  LOOP
    v_pos := strpos(v_rest, '<p');
    EXIT WHEN v_pos = 0;
    v_rest := substr(v_rest, v_pos);
    v_pos := strpos(v_rest, '>');
    EXIT WHEN v_pos = 0;
    v_rest := substr(v_rest, v_pos + 1);
    v_pos := strpos(v_rest, '</p>');
    EXIT WHEN v_pos = 0;
    v_lead := btrim(regexp_replace(substr(v_rest, 1, v_pos - 1), '<[^>]+>', '', 'g'));
    v_rest := substr(v_rest, v_pos + 4);
    EXIT WHEN v_lead <> '' AND v_lead !~* '(доставк|самовывоз|в наличии)';
    v_lead := NULL;
  END LOOP;

  DELETE FROM public.brand_questions
   WHERE brand_id = p_brand_id AND is_auto_generated = true;

  -- Вопрос 1: о бренде
  INSERT INTO public.brand_questions (
    brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
  ) VALUES (
    p_brand_id, NULL,
    'Какие игрушки выпускает бренд ' || v_brand_name || '?',
    concat_ws(' ',
      v_lead,
      CASE
        WHEN v_products_count > 0 THEN
          'В каталоге Ухтышки — ' || v_products_count || ' '
          || public.plural_ru(v_products_count, 'модель', 'модели', 'моделей') || ' ' || v_brand_name || '.'
        ELSE
          'Сейчас товаров ' || v_brand_name || ' нет в наличии.'
      END),
    true, NOW(), 100
  );

  -- Вопрос 2: разделы и серии
  IF v_categories_count > 0 THEN
    v_first_category := split_part(v_categories, ', ', 1);
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_brand_id, NULL,
      'В каких категориях представлены игрушки ' || v_brand_name || '?',
      'Игрушки бренда ' || v_brand_name || ' — '
      || CASE
           WHEN v_categories_count = 1 THEN 'в разделе «' || v_first_category || '»'
           ELSE 'в разделах: ' || v_categories
         END || '.'
      || CASE
           WHEN v_product_lines_count > 0 THEN
             ' В каталоге ' || v_product_lines_count || ' '
             || public.plural_ru(v_product_lines_count, 'серия', 'серии', 'серий') || ' бренда.'
           ELSE ''
         END,
      true, NOW(), 200
    );
  END IF;

  -- Вопрос 3: цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.brand_questions (
      brand_id, user_id, question_text, answer_text, is_auto_generated, answered_at, priority_order
    ) VALUES (
      p_brand_id, NULL,
      'Сколько стоят игрушки ' || v_brand_name || '?',
      'Цены на игрушки ' || v_brand_name || ' в Ухтышке — '
      || CASE
           WHEN round(v_min_price) = round(v_max_price) THEN
             replace(to_char(round(v_min_price)::bigint, 'FM999,999,999'), ',', ' ') || ' ₸'
           ELSE
             'от ' || replace(to_char(round(v_min_price)::bigint, 'FM999,999,999'), ',', ' ')
             || ' до ' || replace(to_char(round(v_max_price)::bigint, 'FM999,999,999'), ',', ' ') || ' ₸'
         END
      || ', цена каждой модели — в её карточке.',
      true, NOW(), 300
    );
  END IF;

  RETURN json_build_object('needs_ai', false);
END;
$function$;

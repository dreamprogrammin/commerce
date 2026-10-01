-- Вопросы бренда: абзац о бренде с фразой про доставку в конце больше не
-- пропускается.
--
-- ЧТО БЫЛО. generate_brand_questions берёт для первого ответа («Какие игрушки
-- выпускает бренд…») первый абзац описания, который не про магазин, — и
-- проверяла это по ВСЕМУ абзацу. У Mermaze абзац о бренде кончается фразой
-- «В Ухтышке — куклы Mermaze Mermaidz с доставкой по Алматы и Казахстану», он
-- отбрасывался, а следующие два — действительно про магазин. Ответ выходил без
-- рассказа о бренде: только «В каталоге Ухтышки — 3 модели…». Из 30 брендов с
-- описанием так было только у Mermaze.
--
-- ЧТО МЕНЯЕТСЯ: признак «про магазин» проверяется в первой фразе абзаца — как
-- у leadExcerpt на сайте (utils/seoText.ts). Больше в теле ничего не меняется,
-- проверка администратора (20260926140000) остаётся.
--
-- Тело — из миграции 20260926140000 (применена 26 сентября; миграций на функцию
-- с тех пор нет). Сверка md5 ниже упадёт, если на базе оно другое.
--
-- Тексты вопросов эта миграция не трогает: пересобирает их
-- docs/BRAND_FAQ_MERMAZE_2026_10_01.sql — запускать ПОСЛЕ миграции.

DO $check$
BEGIN
  IF md5((SELECT prosrc FROM pg_proc
           WHERE oid = to_regprocedure('public.generate_brand_questions(uuid,boolean)')))
     IS DISTINCT FROM 'b19cc969c86fc153eb4d3589972220f7' THEN
    RAISE EXCEPTION 'generate_brand_questions на базе не та, что в миграции 20260926140000 — тело надо снять заново';
  END IF;
END
$check$;

CREATE OR REPLACE FUNCTION "public"."generate_brand_questions"("p_brand_id" "uuid", "p_skip_ai" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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
  -- Через API — только администратор: миграция 20260926140000.
  PERFORM public.assert_faq_generator_caller();

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
    -- Про магазин — только если об этом ПЕРВАЯ фраза абзаца: у Mermaze абзац о
    -- бренде кончается «…с доставкой по Алматы и Казахстану», и проверка по
    -- всему абзацу выбрасывала его (30 сентября 2026; так же в leadExcerpt).
    EXIT WHEN v_lead <> ''
          AND substring(v_lead from '^[^.!?…]*[.!?…]?') !~* '(доставк|самовывоз|в наличии)';
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
$$;

DO $verify$
BEGIN
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.generate_brand_questions(uuid,boolean)'))
     NOT LIKE '%substring(v_lead from%' THEN
    RAISE EXCEPTION 'Новая проверка первой фразы не встала';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.generate_brand_questions(uuid,boolean)'))
     NOT LIKE '%PERFORM public.assert_faq_generator_caller();%' THEN
    RAISE EXCEPTION 'Пропала проверка администратора';
  END IF;
  IF has_function_privilege('anon', 'public.generate_brand_questions(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'generate_brand_questions снова исполняется анонимно';
  END IF;
END
$verify$;

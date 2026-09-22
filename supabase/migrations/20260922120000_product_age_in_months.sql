-- ═══════════════════════════════════════════════════════════════════════════
--  Возраст товара в месяцах — 22 сентября 2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. Возраст хранился целыми годами (min_age_years / max_age_years), и
--  игрушку «от 6 месяцев» можно было записать только как «от 1 года». На бою у
--  9 активных товаров в описании месяцы (6, 9, 18), а в базе — округлённые
--  годы: пирамидка HOLA «от 6 месяцев», погремушка «от 9», столик «от 18» —
--  все «1». Подбор по ребёнку сравнивал целые годы: ребёнок до года — «0 лет»,
--  и игрушки для малышей, записанные как «1», ему не подбирались. Генератор
--  вопросов о линейке писал «от 1 лет».
--
--  ЧТО ДЕЛАЕТ.
--   1. products.min_age_months / max_age_months — основной возраст, в
--      месяцах. Заполняются из лет (× 12); updated_at при этом не трогается,
--      чтобы карта сайта не объявила все товары изменёнными.
--   2. Годы остаются: их отдаёт get_filtered_products и читает код сайта,
--      который сейчас на бою. Триггер держит обе пары в согласии: записали
--      месяцы (новая админка) — годы пересчитаются; записали годы (старая
--      админка) — месяцы. Игрушке младше года в годах ставится 1 — так их и
--      вводили до сих пор, старый сайт покажет то же, что показывал.
--   3. public.age_genitive_ru / public.age_range_ru — возраст словами:
--      «от 6 месяцев», «от 1 года», «от 6 месяцев до 3 лет». Та же логика,
--      что в utils/productAge.ts; одинаковый набор случаев проверяется здесь,
--      в разделе 6, и в tests/utils/productAge.test.ts.
--   4. Подбор по ребёнку (get_personalized_recommendations) и напоминания о
--      днях рождения (check_birthday_notifications) сравнивают месяцы; вопросы
--      о товаре и линейке (generate_product_questions,
--      generate_product_line_questions) пишут возраст через age_range_ru.
--      Тела сняты с прода 22.09.2026 (pg_get_functiondef), изменены только
--      строки про возраст. Сигнатуры и возвращаемые типы прежние — перегрузок
--      не появляется, старый код вызывает их как раньше.
--
--  Для текущего сайта безопасно: колонки только добавляются, прежние не
--  меняются, функции отвечают в прежнем виде.

-- ── 0. ПРОВЕРКА СОСТОЯНИЯ ─────────────────────────────────────────────────
DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'products'
                AND column_name IN ('min_age_months', 'max_age_months')) THEN
    RAISE EXCEPTION 'products.min_age_months уже есть — миграция готовилась под другую базу';
  END IF;
  IF to_regprocedure('public.plural_ru(integer,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'нет public.plural_ru(integer,text,text,text)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.products'::regclass
                    AND tgname = 'trigger_products_updated_at') THEN
    RAISE EXCEPTION 'нет триггера trigger_products_updated_at на products';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.get_personalized_recommendations(uuid,integer)'))) IS DISTINCT FROM 'b507c949dd82bcee5de8b70a02a506ec' THEN
    RAISE EXCEPTION 'public.get_personalized_recommendations(uuid,integer) на базе не та, что снята с прода 22.09.2026 — тело надо снять заново';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.check_birthday_notifications()'))) IS DISTINCT FROM '033a570f1b01d30f42671a5b7bd6daa0' THEN
    RAISE EXCEPTION 'public.check_birthday_notifications() на базе не та, что снята с прода 22.09.2026 — тело надо снять заново';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.generate_product_questions(uuid,boolean)'))) IS DISTINCT FROM '0b7876770c256c1b94613760aff09df8' THEN
    RAISE EXCEPTION 'public.generate_product_questions(uuid,boolean) на базе не та, что снята с прода 22.09.2026 — тело надо снять заново';
  END IF;
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = to_regprocedure('public.generate_product_line_questions(uuid,boolean)'))) IS DISTINCT FROM 'f7c020b4943c686c1dd07a693e30fbcc' THEN
    RAISE EXCEPTION 'public.generate_product_line_questions(uuid,boolean) на базе не та, что снята с прода 22.09.2026 — тело надо снять заново';
  END IF;
END
$check$;

-- ── 1. КОЛОНКИ ────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN min_age_months integer CHECK (min_age_months BETWEEN 0 AND 1200),
  ADD COLUMN max_age_months integer CHECK (max_age_months BETWEEN 0 AND 1200);

COMMENT ON COLUMN public.products.min_age_months IS
  'Минимальный возраст в месяцах — основной. min_age_years пересчитывается триггером trigger_sync_product_age.';
COMMENT ON COLUMN public.products.max_age_months IS
  'Максимальный возраст в месяцах — основной. max_age_years пересчитывается триггером trigger_sync_product_age.';

-- ── 2. ПЕРЕНОС ИЗ ЛЕТ ─────────────────────────────────────────────────────
ALTER TABLE public.products DISABLE TRIGGER trigger_products_updated_at;
UPDATE public.products
   SET min_age_months = min_age_years * 12,
       max_age_months = max_age_years * 12
 WHERE min_age_years IS NOT NULL OR max_age_years IS NOT NULL;
ALTER TABLE public.products ENABLE TRIGGER trigger_products_updated_at;

-- ── 3. ГОДЫ И МЕСЯЦЫ В СОГЛАСИИ ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_age_units()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Годы из месяцев: нижняя граница вниз, но не меньше 1 для игрушек младше
  -- года (так их вводили до месяцев); верхняя — вверх.
  IF TG_OP = 'INSERT' THEN
    IF NEW.min_age_months IS NOT NULL THEN
      NEW.min_age_years := CASE WHEN NEW.min_age_months = 0 THEN 0 ELSE GREATEST(1, NEW.min_age_months / 12) END;
    ELSIF NEW.min_age_years IS NOT NULL THEN
      NEW.min_age_months := NEW.min_age_years * 12;
    END IF;
    IF NEW.max_age_months IS NOT NULL THEN
      NEW.max_age_years := CEIL(NEW.max_age_months / 12.0)::integer;
    ELSIF NEW.max_age_years IS NOT NULL THEN
      NEW.max_age_months := NEW.max_age_years * 12;
    END IF;
  ELSE
    IF NEW.min_age_months IS DISTINCT FROM OLD.min_age_months THEN
      NEW.min_age_years := CASE
        WHEN NEW.min_age_months IS NULL THEN NULL
        WHEN NEW.min_age_months = 0 THEN 0
        ELSE GREATEST(1, NEW.min_age_months / 12) END;
    ELSIF NEW.min_age_years IS DISTINCT FROM OLD.min_age_years THEN
      NEW.min_age_months := NEW.min_age_years * 12;
    END IF;
    IF NEW.max_age_months IS DISTINCT FROM OLD.max_age_months THEN
      NEW.max_age_years := CEIL(NEW.max_age_months / 12.0)::integer;
    ELSIF NEW.max_age_years IS DISTINCT FROM OLD.max_age_years THEN
      NEW.max_age_months := NEW.max_age_years * 12;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_sync_product_age
  BEFORE INSERT OR UPDATE OF min_age_years, max_age_years, min_age_months, max_age_months
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_age_units();

-- ── 4. ВОЗРАСТ СЛОВАМИ ────────────────────────────────────────────────────
-- Родительный падеж — возраст всегда после «от» и «до»: от 1 года, от 2 лет,
-- от 1 месяца, от 6 месяцев; дробные годы — «от 3,5 года».
CREATE OR REPLACE FUNCTION public.age_genitive_ru(p_months integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_months IS NULL THEN NULL
    WHEN p_months > 0 AND p_months % 12 = 0
      THEN (p_months / 12)::text || ' ' || public.plural_ru(p_months / 12, 'года', 'лет', 'лет')
    WHEN p_months < 36
      THEN p_months::text || ' ' || public.plural_ru(p_months, 'месяца', 'месяцев', 'месяцев')
    ELSE replace(to_char(round(p_months / 12.0, 1), 'FM999990.0'), '.', ',') || ' года'
  END
$function$;

CREATE OR REPLACE FUNCTION public.age_range_ru(p_min integer, p_max integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_min IS NULL AND p_max IS NULL THEN NULL
    WHEN p_min IS NOT NULL AND p_max IS NOT NULL AND p_max > p_min THEN
      CASE
        WHEN p_min = 0 THEN 'с рождения до ' || public.age_genitive_ru(p_max)
        WHEN p_min % 12 = 0 AND p_max % 12 = 0
          THEN 'от ' || (p_min / 12) || ' до ' || (p_max / 12) || ' '
               || public.plural_ru(p_max / 12, 'года', 'лет', 'лет')
        WHEN p_max % 12 <> 0 AND p_max < 36
          THEN 'от ' || p_min || ' до ' || p_max || ' '
               || public.plural_ru(p_max, 'месяца', 'месяцев', 'месяцев')
        ELSE 'от ' || public.age_genitive_ru(p_min) || ' до ' || public.age_genitive_ru(p_max)
      END
    WHEN p_min IS NOT NULL THEN
      CASE WHEN p_min = 0 THEN 'с рождения' ELSE 'от ' || public.age_genitive_ru(p_min) END
    ELSE 'до ' || public.age_genitive_ru(p_max)
  END
$function$;

-- ── 5. ФУНКЦИИ, КОТОРЫЕ СРАВНИВАЮТ И ПИШУТ ВОЗРАСТ ────────────────────────
-- Тела — с прода 22.09.2026, изменены только строки про возраст.

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(p_user_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, name text, slug text, description text, price numeric, final_price numeric, category_id uuid, bonus_points_award integer, stock_quantity integer, sales_count integer, is_active boolean, min_age_years integer, max_age_years integer, gender text, accessory_ids uuid[], is_accessory boolean, barcode text, brand_id uuid, origin_country_id integer, material_id integer, discount_percentage numeric, created_at timestamp with time zone, updated_at timestamp with time zone, product_images json)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
    -- Сценарий 1: У пользователя есть дети
    IF EXISTS (SELECT 1 FROM public.children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price, 
          p.final_price,  -- 🔥 ДОБАВЛЕНО
          p.category_id, p.bonus_points_award, p.stock_quantity,
          p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
          p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
                'alt_text', pi.alt_text, 'display_order', pi.display_order,
                'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
              ) ORDER BY pi.display_order
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) as product_images
        FROM public.products p
        LEFT JOIN public.product_images pi ON pi.product_id = p.id
        WHERE
            p.is_active = TRUE
            AND EXISTS (
                SELECT 1 FROM public.children c
                WHERE c.user_id = p_user_id
                -- Возраст — в месяцах (22.09.2026): ребёнок до года раньше был
                -- «0 лет» и не получал игрушек «от 6 месяцев», записанных как «1».
                -- Верхняя граница в целых годах покрывает весь последний год:
                -- «до 3 лет» подходит и ребёнку 3 лет 5 месяцев — как при
                -- прежнем сравнении годами.
                AND (EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)))
                    >= COALESCE(p.min_age_months, 0)
                AND (EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)))
                    <= COALESCE(p.max_age_months + CASE WHEN p.max_age_months % 12 = 0 THEN 11 ELSE 0 END, 1200)
                AND (p.gender = 'unisex' OR p.gender IS NULL OR p.gender = c.gender)
            )
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 2: Нет детей, но есть история просмотров
    IF EXISTS (SELECT 1 FROM public.product_views WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price,
          p.final_price,  -- 🔥 ДОБАВЛЕНО
          p.category_id, p.bonus_points_award, p.stock_quantity,
          p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
          p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
                'alt_text', pi.alt_text, 'display_order', pi.display_order,
                'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
              ) ORDER BY pi.display_order
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) as product_images
        FROM public.products p
        LEFT JOIN public.product_images pi ON pi.product_id = p.id
        WHERE
            p.is_active = TRUE
            AND p.category_id IN (
                SELECT DISTINCT pr.category_id
                FROM public.product_views pv
                JOIN public.products pr ON pr.id = pv.product_id
                WHERE pv.user_id = p_user_id
                AND pr.category_id IS NOT NULL
            )
            AND p.id NOT IN (
                SELECT product_id FROM public.product_views WHERE user_id = p_user_id
            )
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 3: Fallback - популярные товары
    RETURN QUERY
    SELECT
      p.id, p.name, p.slug, p.description, p.price,
      p.final_price,  -- 🔥 ДОБАВЛЕНО
      p.category_id, p.bonus_points_award, p.stock_quantity,
      p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
      p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
            'alt_text', pi.alt_text, 'display_order', pi.display_order,
            'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'::json
      ) as product_images
    FROM public.products p
    LEFT JOIN public.product_images pi ON pi.product_id = p.id
    WHERE p.is_active = TRUE
    GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
             p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
             p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
    ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
    LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_birthday_notifications()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_child RECORD;
  v_age_years INTEGER;
  v_product_names TEXT[];
  v_product_rec RECORD;
  v_product_link TEXT;
  v_body TEXT;
  v_new_active_balance INTEGER;
  v_processed INTEGER := 0;
BEGIN
  FOR v_child IN
    SELECT
      c.id AS child_id,
      c.user_id,
      c.name AS child_name,
      c.gender AS child_gender,
      c.birth_date,
      EXTRACT(YEAR FROM (current_date + interval '7 days')) - EXTRACT(YEAR FROM c.birth_date) AS upcoming_age
    FROM public.children c
    JOIN public.profiles p ON p.id = c.user_id
    WHERE TO_CHAR(c.birth_date, 'MM-DD') = TO_CHAR(current_date + interval '7 days', 'MM-DD')
      -- Дедупликация: нет ли birthday_reminder для этого user_id в текущем году
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = c.user_id
          AND n.type = 'birthday_reminder'
          AND EXTRACT(YEAR FROM n.created_at) = EXTRACT(YEAR FROM current_date)
          AND n.body LIKE '%' || c.name || '%'
      )
  LOOP
    v_age_years := v_child.upcoming_age::INTEGER;

    -- Подбираем 3 товара по возрасту/полу
    v_product_names := ARRAY[]::TEXT[];
    v_product_link := NULL;

    FOR v_product_rec IN
      SELECT p.name, p.slug
      FROM public.products p
      WHERE p.is_active = true
        AND p.stock_quantity > 0
        -- Возраст — в месяцах (22.09.2026): игрушка «от 18 месяцев» к двум
        -- годам подходит, «до 18 месяцев» — уже нет.
        AND (p.min_age_months IS NULL OR p.min_age_months <= v_age_years * 12)
        AND (p.max_age_months IS NULL OR p.max_age_months >= v_age_years * 12)
        AND (p.gender IS NULL OR p.gender = 'unisex' OR p.gender = v_child.child_gender)
      ORDER BY p.sales_count DESC NULLS LAST
      LIMIT 3
    LOOP
      v_product_names := array_append(v_product_names, v_product_rec.name);
      IF v_product_link IS NULL THEN
        v_product_link := '/catalog/products/' || v_product_rec.slug;
      END IF;
    END LOOP;

    -- Начисляем 1000 бонусов
    UPDATE public.profiles
    SET active_bonus_balance = active_bonus_balance + 1000
    WHERE id = v_child.user_id
    RETURNING active_bonus_balance INTO v_new_active_balance;

    INSERT INTO public.bonus_transactions (
      user_id, amount, transaction_type, status, balance_after, description
    ) VALUES (
      v_child.user_id,
      1000,
      'birthday',
      'completed',
      v_new_active_balance,
      format('Бонусы ко дню рождения %s (%s лет)', v_child.child_name, v_age_years)
    );

    -- Формируем уведомление
    v_body := format('Через 7 дней %s исполнится %s', v_child.child_name, v_age_years)
      || CASE
           WHEN v_age_years % 10 = 1 AND v_age_years <> 11 THEN ' год!'
           WHEN v_age_years % 10 BETWEEN 2 AND 4 AND NOT (v_age_years BETWEEN 12 AND 14) THEN ' года!'
           ELSE ' лет!'
         END;

    IF array_length(v_product_names, 1) > 0 THEN
      v_body := v_body || E'\nИдеи подарков: ' || array_to_string(v_product_names, ', ') || '.';
    END IF;

    v_body := v_body || E'\n🎁 Вам начислено 1000 бонусов!';

    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      v_child.user_id,
      'birthday_reminder',
      '🎂 Скоро день рождения!',
      v_body,
      COALESCE(v_product_link, '/catalog'),
      false
    );

    v_processed := v_processed + 1;
  END LOOP;

  RETURN format('Обработано: %s уведомлений о днях рождения', v_processed);
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_product_questions(p_product_id uuid, p_skip_ai boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_min_months INTEGER;
  v_max_months INTEGER;
  v_brand_name TEXT;
  v_material_name TEXT;
  v_country_name TEXT;
  v_price NUMERIC;
  v_name TEXT;
  v_description TEXT;
  v_category_name TEXT;
  v_result JSON;
BEGIN
  SELECT
    p.min_age_years,
    p.max_age_years,
    p.min_age_months,
    p.max_age_months,
    b.name,
    m.name,
    c.name,
    p.price,
    p.name,
    p.description,
    cat.name
  INTO
    v_min_age,
    v_max_age,
    v_min_months,
    v_max_months,
    v_brand_name,
    v_material_name,
    v_country_name,
    v_price,
    v_name,
    v_description,
    v_category_name
  FROM public.products p
  LEFT JOIN public.brands b ON p.brand_id = b.id
  LEFT JOIN public.materials m ON p.material_id = m.id
  LEFT JOIN public.countries c ON p.origin_country_id = c.id
  LEFT JOIN public.categories cat ON p.category_id = cat.id
  WHERE p.id = p_product_id;

  DELETE FROM public.product_questions
  WHERE product_id = p_product_id AND is_auto_generated = true;

  IF v_min_months IS NOT NULL OR v_max_months IS NOT NULL THEN
    INSERT INTO public.product_questions (
      product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_id,
      NULL,
      'С какого возраста можно играть с этой игрушкой?',
      -- Возраст словами, как на сайте (utils/productAge.ts): «от 6 месяцев»,
      -- «от 1 года», «от 6 месяцев до 3 лет». Было «от 1 лет».
      'Производитель рекомендует для детей ' || public.age_range_ru(v_min_months, v_max_months) || '.',
      true,
      NOW()
    );
  END IF;

  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Как быстро доставите в Алматы?',
    'Доставка по Алматы занимает 1–3 рабочих дня. Доставка бесплатна при заказе от 15 000 ₸.',
    true,
    NOW()
  );

  INSERT INTO public.product_questions (
    product_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_id,
    NULL,
    'Можно ли вернуть товар?',
    'Да, вы можете вернуть товар в течение 14 дней с момента получения, если он не был в использовании и сохранена упаковка.',
    true,
    NOW()
  );

  IF v_price > 50000 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'product_id', p_product_id,
      'name', v_name,
      'price', v_price,
      'description', v_description,
      'brand', v_brand_name,
      'material', v_material_name,
      'country', v_country_name,
      'category', v_category_name,
      'min_age', v_min_age,
      'max_age', v_max_age
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_product_line_questions(p_product_line_id uuid, p_skip_ai boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_line_name TEXT;
  v_line_description TEXT;
  v_brand_name TEXT;
  v_products_count INTEGER;
  v_min_price NUMERIC;
  v_max_price NUMERIC;
  v_min_age INTEGER;
  v_max_age INTEGER;
  v_min_months INTEGER;
  v_max_months INTEGER;
  v_result JSON;
BEGIN
  -- Получаем данные линейки
  SELECT
    pl.name,
    pl.description,
    b.name,
    COUNT(DISTINCT p.id),
    MIN(p.price),
    MAX(p.price),
    MIN(p.min_age_years),
    MAX(p.max_age_years),
    MIN(p.min_age_months),
    MAX(p.max_age_months)
  INTO
    v_line_name,
    v_line_description,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price,
    v_min_age,
    v_max_age,
    v_min_months,
    v_max_months
  FROM public.product_lines pl
  LEFT JOIN public.brands b ON pl.brand_id = b.id
  LEFT JOIN public.products p ON p.product_line_id = pl.id AND p.is_active = true
  WHERE pl.id = p_product_line_id
  GROUP BY pl.id, pl.name, pl.description, b.name;

  IF v_line_name IS NULL THEN
    RETURN json_build_object('needs_ai', false, 'error', 'Product line not found');
  END IF;

  -- Удаляем старые автогенерированные вопросы
  DELETE FROM public.product_line_questions
  WHERE product_line_id = p_product_line_id AND is_auto_generated = true;

  -- Вопрос 1: О линейке
  INSERT INTO public.product_line_questions (
    product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
  ) VALUES (
    p_product_line_id, NULL,
    'Что такое линейка игрушек "' || v_line_name || '"?',
    CASE
      WHEN v_line_description IS NOT NULL THEN
        v_line_description || ' Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' включает ' || v_products_count || ' игрушек.'
      ELSE
        'Линейка "' || v_line_name || '" от бренда ' || COALESCE(v_brand_name, 'производителя') || ' - популярная серия игрушек. В ассортименте ' || v_products_count || ' различных игрушек.'
    END,
    true, NOW()
  );

  -- Вопрос 2: Производитель
  IF v_brand_name IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Кто производит линейку "' || v_line_name || '"?',
      'Линейка "' || v_line_name || '" производится компанией ' || v_brand_name || ' - известным брендом качественных игрушек для детей.',
      true, NOW()
    );
  END IF;

  -- Вопрос 3: Цены
  IF v_min_price IS NOT NULL AND v_max_price IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Сколько стоят игрушки линейки "' || v_line_name || '"?',
      'Цены на игрушки линейки "' || v_line_name || '" варьируются от ' ||
      to_char(v_min_price, 'FM999G999G999') || ' ₸ до ' ||
      to_char(v_max_price, 'FM999G999G999') || ' ₸.',
      true, NOW()
    );
  END IF;

  -- Вопрос 4: Возраст
  IF v_min_months IS NOT NULL OR v_max_months IS NOT NULL THEN
    INSERT INTO public.product_line_questions (
      product_line_id, user_id, question_text, answer_text, is_auto_generated, answered_at
    ) VALUES (
      p_product_line_id, NULL,
      'Для какого возраста подходят игрушки "' || v_line_name || '"?',
      'Игрушки линейки "' || v_line_name || '" рекомендованы для детей ' ||
      -- Возраст словами, как на сайте (utils/productAge.ts). Было «от 1 лет».
      public.age_range_ru(v_min_months, v_max_months) || '.',
      true, NOW()
    );
  END IF;

  -- AI для популярных линеек
  IF v_products_count > 15 AND NOT p_skip_ai THEN
    v_result := json_build_object(
      'needs_ai', true,
      'entity_type', 'product_line',
      'product_line_id', p_product_line_id,
      'name', v_line_name,
      'description', v_line_description,
      'brand_name', v_brand_name,
      'products_count', v_products_count,
      'min_price', v_min_price,
      'max_price', v_max_price
    );
  ELSE
    v_result := json_build_object('needs_ai', false);
  END IF;

  RETURN v_result;
END;
$function$;

-- ── 6. САМОПРОВЕРКА ───────────────────────────────────────────────────────
DO $selfcheck$
DECLARE
  r record;
  v_got text;
BEGIN
  -- возраст словами — те же случаи, что в tests/utils/productAge.test.ts
  FOR r IN
    SELECT * FROM (VALUES
      (6, NULL, 'от 6 месяцев'),
      (9, NULL, 'от 9 месяцев'),
      (1, NULL, 'от 1 месяца'),
      (21, NULL, 'от 21 месяца'),
      (12, NULL, 'от 1 года'),
      (18, NULL, 'от 18 месяцев'),
      (24, NULL, 'от 2 лет'),
      (36, NULL, 'от 3 лет'),
      (42, NULL, 'от 3,5 года'),
      (72, NULL, 'от 6 лет'),
      (252, NULL, 'от 21 года'),
      (0, NULL, 'с рождения'),
      (0, 12, 'с рождения до 1 года'),
      (NULL, 36, 'до 3 лет'),
      (NULL, 6, 'до 6 месяцев'),
      (48, 144, 'от 4 до 12 лет'),
      (12, 36, 'от 1 до 3 лет'),
      (6, 18, 'от 6 до 18 месяцев'),
      (12, 18, 'от 12 до 18 месяцев'),
      (18, 96, 'от 18 месяцев до 8 лет'),
      (6, 36, 'от 6 месяцев до 3 лет'),
      (36, 36, 'от 3 лет'),
      (NULL, NULL, NULL)
    ) AS t(min_m, max_m, expected)
  LOOP
    v_got := public.age_range_ru(r.min_m::integer, r.max_m::integer);
    IF v_got IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'age_range_ru(%, %) = «%», ожидалось «%»', r.min_m, r.max_m, v_got, r.expected;
    END IF;
  END LOOP;

  -- перенос: месяцы ровно из лет у каждого товара
  IF EXISTS (SELECT 1 FROM public.products
              WHERE min_age_months IS DISTINCT FROM min_age_years * 12
                 OR max_age_months IS DISTINCT FROM max_age_years * 12) THEN
    RAISE EXCEPTION 'перенос лет в месяцы разошёлся';
  END IF;

  -- по одной версии каждой функции — без перегрузок (п. 10 CLAUDE.md)
  FOR r IN
    SELECT p.proname, count(*) AS n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('get_personalized_recommendations', 'check_birthday_notifications',
                         'generate_product_questions', 'generate_product_line_questions',
                         'age_genitive_ru', 'age_range_ru', 'sync_product_age_units')
     GROUP BY p.proname
  LOOP
    IF r.n <> 1 THEN
      RAISE EXCEPTION 'у % версий: %', r.proname, r.n;
    END IF;
  END LOOP;
END
$selfcheck$;

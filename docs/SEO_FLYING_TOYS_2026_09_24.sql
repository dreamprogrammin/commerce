-- ═══════════════════════════════════════════════════════════════════════════
--  Раздел «Летающие игрушки» и чистка «Радиоуправляемых машинок», 24.09.2026
-- ═══════════════════════════════════════════════════════════════════════════
--
--  ЗАЧЕМ. План по аудиту 24 сентября, п. 4: из 24 товаров «Радиоуправляемых
--  машинок» шесть — не машинки: три вертолёта AIRCRAFT JM9198, два самолёта
--  HW31 и квадрокоптер E88. Раздел открывался вертолётом за 1 590 ₸ при
--  сортировке по цене, а в выдаче стояло «24 модели от 1 590 ₸» — цена не
--  машинки. Владелец выбрал отдельный раздел в «Мальчикам».
--
--  НАЗВАНИЕ — «Летающие игрушки», а не «Радиоуправляемые вертолёты и
--  самолёты», как было в вопросе владельцу: у вертолётов JM9198 пульта нет,
--  они взлетают от ладони (так в описании товара). Если нужно другое имя —
--  поменять строки name, seo_title, seo_h1 ниже; адрес (slug, href) лучше
--  оставить.
--
--  ЧТО ДЕЛАЕТ — одним блоком: либо всё, либо ничего.
--   1. Заводит раздел «Летающие игрушки» — /catalog/boys/letayushchie-igrushki,
--      в меню сразу после «Машинок» (остальные разделы «Мальчикам» сдвигаются
--      на одну позицию). Заголовок, H1 и текст: как выбрать — управление, где
--      запускать, заряд, камера, возраст; все факты из описаний шести товаров.
--   2. Даёт ему те же фильтры, что у машинок (вид техники, цвет, питание,
--      частота, свет, звук, масштаб). Без этого у перенесённых товаров
--      характеристики в карточке потеряли бы ссылки на подборки.
--   3. Переносит шесть товаров. Адреса карточек не меняются — они от раздела
--      не зависят; меняются хлебные крошки и «похожие товары».
--   4. В тексте машинок убирает «и летающие модели: вертолёты, самолёты-
--      истребители, квадрокоптер» и «самолёты, квадрокоптер… — от 6 лет»,
--      добавляет ссылку на новый раздел.
--
--  Число моделей и цены сайт считает сам: у машинок станет 18 моделей от
--  4 090 ₸, у нового раздела — 6 от 1 590 ₸.
--
--  ЧЕГО НЕ ДЕЛАЕТ. Картинки у раздела нет — сайт показывает его и без неё,
--  как «Ролевые и сюжетные наборы». Загрузить можно в админке, там же
--  сделается размытая заглушка. Вопросы-ответы генератором не создаются:
--  автогенерация на бою выключена (settings.auto_generate_faq = false).
--
--  ЗАЩИТА. Блок сначала проверяет, что база та, под которую он писался:
--  разделы на месте, все шесть товаров ещё в машинках, текст машинок руками
--  не правили (md5). Иначе — ошибка, и не меняется ничего. Повторный запуск
--  ничего не меняет и пишет «Уже сделано».
--  ПРОВЕРЕНО ЗАПУСКОМ на локальной базе с копией боевых строк, с откатом.

-- ── 1. ПОМЕНЯТЬ ───────────────────────────────────────────────────────────
--  Ожидаемо: «DO» без ошибок и сообщение «Готово: …».

DO $$
DECLARE
  c_boys CONSTANT uuid := 'ea621b45-afbb-4e0c-b83e-3f6dd1e2e32e';  -- Мальчикам
  c_mash CONSTANT uuid := '8e300047-f9ee-4c96-939f-5de9a757388b';  -- Машинки
  c_rc   CONSTANT uuid := '954664bf-2ba2-45ce-9873-386b186a7db6';  -- Радиоуправляемые машинки
  c_fly  CONSTANT uuid[] := ARRAY[
    'c7ef6de3-0f7c-41e0-84b9-e22ee9224eb0',  -- вертолёт AIRCRAFT JM9198/Y жёлтый
    'c1ae4126-f7e9-4089-bded-bdf611725d2e',  -- вертолёт AIRCRAFT JM9198/B синий
    'b105638d-0e8f-47ab-ba76-0ba1857db752',  -- вертолёт AIRCRAFT JM9198/R красный
    '3bce02d3-b815-46af-90e3-4aa33aef1754',  -- квадрокоптер E88
    '39926ad8-77c1-47c1-bf75-18cb79bce9cc',  -- самолёт-истребитель HW31/B синий
    '79127570-fae3-40f6-bf9b-8f32185cc8dd'   -- самолёт-истребитель HW31/S серый
  ]::uuid[];
  v_new   uuid;
  v_order int;
  v_n     int;
BEGIN
  -- Повторный запуск
  SELECT id INTO v_new FROM public.categories WHERE slug = 'letayushchie-igrushki';
  IF v_new IS NOT NULL THEN
    SELECT count(*) INTO v_n FROM public.products WHERE id = ANY (c_fly) AND category_id = v_new;
    IF v_n = 6 THEN
      RAISE NOTICE 'Уже сделано: раздел есть, все шесть товаров в нём. Ничего не менял.';
      RETURN;
    END IF;
    RAISE EXCEPTION 'Раздел letayushchie-igrushki уже есть, но в нём % из 6 товаров. База не та, под которую писался файл, — ничего не менял.', v_n;
  END IF;

  -- База та, под которую писался файл?
  PERFORM 1 FROM public.categories WHERE id = c_boys AND slug = 'boys';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Нет раздела «Мальчикам» (boys) с ожидаемым id — ничего не менял.';
  END IF;
  PERFORM 1 FROM public.categories WHERE id = c_mash AND slug = 'mashinki' AND parent_id = c_boys;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Нет раздела «Машинки» внутри «Мальчикам» — ничего не менял.';
  END IF;
  PERFORM 1 FROM public.categories WHERE id = c_rc AND slug = 'radioupravlyaemye-mashinki' AND parent_id = c_mash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Нет раздела «Радиоуправляемые машинки» внутри «Машинок» — ничего не менял.';
  END IF;
  SELECT count(*) INTO v_n FROM public.products WHERE id = ANY (c_fly) AND category_id = c_rc;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'В машинках % из 6 летающих товаров — их уже переносили? Ничего не менял.', v_n;
  END IF;
  PERFORM 1 FROM public.categories WHERE id = c_rc AND md5(seo_text) = '260cc24c811e437eebe8bd089dc39dca';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Текст раздела машинок меняли после 24 сентября — не затираю. Ничего не менял.';
  END IF;

  -- 1. Раздел — в меню сразу после «Машинок»
  SELECT display_order + 1 INTO v_order FROM public.categories WHERE id = c_mash;
  UPDATE public.categories
     SET display_order = display_order + 1
   WHERE parent_id = c_boys AND display_order >= v_order;

  INSERT INTO public.categories (
    name, slug, href, parent_id, is_root_category, display_in_menu, display_order,
    seo_title, seo_h1, seo_keywords, seo_text
  ) VALUES (
    'Летающие игрушки',
    'letayushchie-igrushki',
    '/catalog/boys/letayushchie-igrushki',
    c_boys, false, true, v_order,
    'Летающие игрушки для детей — купить в Алматы | Ухтышка',
    'Летающие игрушки для детей',
    ARRAY['летающие игрушки', 'летающие игрушки для детей', 'радиоуправляемый вертолёт',
          'радиоуправляемый самолёт', 'квадрокоптер для детей', 'летающие игрушки Алматы'],
    replace($txt$<h2 data-icon="fluent-emoji-flat:helicopter">Летающие игрушки для детей в Алматы</h2>
<p>В разделе — вертолёты AIRCRAFT, которые взлетают от ладони, самолёты-истребители HW31 на пульте и квадрокоптер E88 с камерой. Машинки, танки и спецтехника на пульте — в разделе <a href="/catalog/boys/mashinki/radioupravlyaemye-mashinki">радиоуправляемые машинки</a>.</p>

<h2 data-icon="fluent-emoji-flat:light-bulb">Как выбрать летающую игрушку</h2>
<ul>
  <li data-icon="fluent-emoji-flat:raised-hand">Управление — вертолёту AIRCRAFT пульт не нужен: он поднимается в воздух, когда к нему подносят руку. Самолёт HW31 управляется с пульта на 2,4 ГГц, квадрокоптер E88 — с пульта или со смартфона через приложение для iOS и Android.</li>
  <li data-icon="fluent-emoji-flat:national-park">Где запускать — самолёт HW31 сделан для улицы: он из пены EPP, переносит падения и порывы ветра, а пульт достаёт до 300 м. У квадрокоптера винты закрыты рамками, и он переживает столкновения, а у вертолёта AIRCRAFT крылышки из мягкого пластика, безопасные для детских рук.</li>
  <li data-icon="fluent-emoji-flat:battery">Заряд — самолёт и квадрокоптер летают около 10 минут. Квадрокоптер заряжается 2 часа, самолёт — около 4; для пульта самолёта нужны 4 батарейки АА, в комплект они не входят. Вертолёт AIRCRAFT заряжают по USB, не дольше 20 минут.</li>
  <li data-icon="fluent-emoji-flat:video-camera">Камера — у квадрокоптера E88: видео с неё идёт на экран пульта и смартфона, а подняться он может до 60 м.</li>
  <li data-icon="fluent-emoji-flat:child">Возраст — вертолёты AIRCRAFT рассчитаны на детей от 3 лет, самолёты и квадрокоптер — от 6 лет.</li>
</ul>

<h2 data-icon="fluent-emoji-flat:delivery-truck">Купить летающую игрушку в Алматы</h2>
<p>Цена, возраст и характеристики — в карточке каждой модели, а в фильтрах раздела можно выбрать вид техники: вертолёт, самолёт или квадрокоптер. Доставка по Алматы — 1–3 рабочих дня, по Казахстану — 3–7; в Алматы заказ можно забрать самовывозом из мкр. Шапагат.</p>$txt$, chr(13), '')
  )
  RETURNING id INTO v_new;

  -- 2. Фильтры — как у машинок
  INSERT INTO public.category_attributes (category_id, attribute_id)
  SELECT v_new, attribute_id FROM public.category_attributes WHERE category_id = c_rc;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'У машинок нет фильтров — копировать нечего. Ничего не менял.';
  END IF;

  -- 3. Товары
  UPDATE public.products SET category_id = v_new WHERE id = ANY (c_fly) AND category_id = c_rc;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'Перенеслось % товаров вместо 6 — ничего не менял.', v_n;
  END IF;

  -- 4. Текст машинок: без летающих моделей, со ссылкой на новый раздел
  UPDATE public.categories
     SET seo_text = replace($txt$<h2 data-icon="fluent-emoji-flat:racing-car">Радиоуправляемые машинки для детей в Алматы</h2>
<p>В разделе — легковые машинки и машины-перевёртыши, внедорожник «Нива», танки, спецтехника — башенные краны, экскаватор, бульдозер, трактор, пожарные машины. Из брендов больше всего моделей <a href="/brand/mokatoys">MokaToys</a>, есть и <a href="/brand/hstar">Hstar</a>.</p>

<h2 data-icon="fluent-emoji-flat:light-bulb">Как выбрать радиоуправляемую машинку</h2>
<ul>
  <li data-icon="fluent-emoji-flat:battery">Питание — машинку с аккумулятором заряжают, чаще всего по USB, и батарейки на неё не уходят. Но пульт и у неё обычно работает от батареек АА, а в комплект они, как правило, не входят — сколько нужно, написано в описании модели.</li>
  <li data-icon="fluent-emoji-flat:satellite-antenna">Частота — если играть будут двое, берите модели с пультом на 2,4 ГГц: они не мешают друг другу.</li>
  <li data-icon="fluent-emoji-flat:child">Возраст — большинство моделей рассчитаны на детей от 3 лет; бульдозер HSTAR с пультом на 9 каналов — от 6 лет.</li>
</ul>

<h2 data-icon="fluent-emoji-flat:delivery-truck">Купить радиоуправляемую машинку в Алматы</h2>
<p>Цена, возраст и характеристики — в карточке каждой модели, а в фильтрах раздела можно выбрать технику на аккумуляторе или с управлением на 2,4 ГГц. Рядом — <a href="/catalog/boys/mashinki/avtotreki">автотреки</a>, <a href="/catalog/boys/mashinki/parkingi-i-garazhi">паркинги и гаражи</a> и <a href="/catalog/boys/interaktivnye-igrushki/roboty">роботы на пульте</a>, а вертолёты, самолёты и квадрокоптер — в разделе <a href="/catalog/boys/letayushchie-igrushki">летающие игрушки</a>. Доставка по Алматы — 1–3 рабочих дня, по Казахстану — 3–7; в Алматы заказ можно забрать самовывозом из мкр. Шапагат.</p>$txt$, chr(13), '')
   WHERE id = c_rc;

  RAISE NOTICE 'Готово: раздел «Летающие игрушки» заведён (id %), перенесено товаров: 6.', v_new;
END
$$;

-- ── 2. ПРОВЕРИТЬ ──────────────────────────────────────────────────────────
--  Ожидаемо: 18 у машинок, 6 у летающих; у летающих filtrov = 7,
--  tekst_ok = true у обоих разделов.

SELECT c.slug, c.href, c.display_order,
       (SELECT count(*) FROM public.products p WHERE p.category_id = c.id AND p.is_active) AS tovarov,
       (SELECT count(*) FROM public.category_attributes a WHERE a.category_id = c.id)      AS filtrov,
       CASE c.slug
         WHEN 'radioupravlyaemye-mashinki' THEN c.seo_text NOT LIKE '%летающие модели%'
                                            AND c.seo_text LIKE '%/catalog/boys/letayushchie-igrushki%'
         ELSE c.seo_text LIKE '%Как выбрать летающую игрушку%'
       END AS tekst_ok
  FROM public.categories c
 WHERE c.slug IN ('radioupravlyaemye-mashinki', 'letayushchie-igrushki')
 ORDER BY c.slug;

--  Ожидаемо: шесть разделов «Мальчикам» по порядку: mashinki 0,
--  letayushchie-igrushki 1, дальше прежние — со сдвигом на один.

SELECT slug, display_order
  FROM public.categories
 WHERE parent_id = 'ea621b45-afbb-4e0c-b83e-3f6dd1e2e32e'
 ORDER BY display_order;

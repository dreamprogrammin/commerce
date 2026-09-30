-- =====================================================================================
-- final_price без скидки = цена, которую ввёл владелец
-- =====================================================================================
-- НАЙДЕНО аудитом 30 сентября 2026.
--
-- Психологическое округление (миграция 20260331102800) задумано для цен СО
-- скидкой: 15 302 ₸ → 15 290 ₸. Но формула применялась и при скидке 0, а цены у
-- владельца и так оканчиваются на 90 — и округление срезало ещё 100 ₸:
-- 1 290 → 1 190, 79 990 → 79 890. На бою таких активных товаров 12 из 14 без
-- скидки.
--
-- Последствие: плитка в каталоге (`ProductCard.vue` берёт `final_price` только
-- при скидке) показывала 1 290 ₸, а карточка, разметка Product, фид Merchant
-- Center и касса (`create_guest_checkout`, `create_user_order` считают по
-- `final_price`) — 1 190 ₸. Покупатель видел одну цену, платил другую; магазин
-- недополучал 100 ₸ с каждой продажи.
--
-- Решение (владелец: «реши её»): правильная цена — введённая. Без скидки
-- `final_price = price`, со скидкой формула прежняя. Бонусы тех же 12 товаров
-- пересчитываются от новой цены (5% — как у 174 товаров из 178), если они
-- были посчитаны от старой.
--
-- Postgres 17: выражение меняется `SET EXPRESSION` — колонка остаётся на месте,
-- порядок столбцов в `products.*` не сдвигается, индексы перестраиваются сами.
-- =====================================================================================

-- ── 1. Проверка состояния: база та, под которую писалось ─────────────────────────
DO $$
DECLARE
  v_expr text;
  v_expected text := 'CASE WHEN (((price * ((100)::numeric - COALESCE(discount_percentage, (0)::numeric))) / (100)::numeric) < (500)::numeric) THEN (floor((((price * ((100)::numeric - COALESCE(discount_percentage, (0)::numeric))) / (100)::numeric) / (10)::numeric)) * (10)::numeric) ELSE ((floor((((price * ((100)::numeric - COALESCE(discount_percentage, (0)::numeric))) / (100)::numeric) / (100)::numeric)) * (100)::numeric) - (10)::numeric) END';
BEGIN
  IF current_setting('server_version_num')::int < 170000 THEN
    RAISE EXCEPTION 'Нужен Postgres 17+ (SET EXPRESSION), а здесь %', current_setting('server_version');
  END IF;

  SELECT btrim(regexp_replace(generation_expression, '\s+', ' ', 'g'))
    INTO v_expr
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'final_price';

  IF v_expr IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'final_price уже не та формула, под которую писалась миграция: %', v_expr;
  END IF;
END $$;

-- ── 2. Бонусы, посчитанные от старой цены, — запомнить до смены формулы ────────
CREATE TEMP TABLE _bonus_fix ON COMMIT DROP AS
SELECT id
  FROM public.products
 WHERE COALESCE(discount_percentage, 0) = 0
   AND final_price <> price
   AND bonus_points_award = ROUND(final_price * 0.05);

-- ── 3. Новая формула ────────────────────────────────────────────────────────────
ALTER TABLE public.products
  ALTER COLUMN final_price SET EXPRESSION AS (
    CASE
      -- Без скидки — ровно введённая цена: она уже «на 90», округлять нечего
      WHEN COALESCE(discount_percentage, 0) <= 0 THEN price
      -- Со скидкой дешевле 500 ₸ — до десятков
      WHEN (price * (100 - COALESCE(discount_percentage, 0)) / 100) < 500 THEN
        FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 10) * 10
      -- Со скидкой от 500 ₸ — до сотен минус 10
      ELSE
        (FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 100) * 100) - 10
    END
  );

COMMENT ON COLUMN public.products.final_price IS
'Цена для покупателя. Без скидки — ровно price. Со скидкой — психологическое округление: от 500 ₸ до сотен минус 10 (на 90), дешевле — до десятков. Пересчитывается сама при изменении price или discount_percentage. Зеркало на клиенте — utils/bonusCalculator.ts (calculateFinalPrice).';

-- ── 4. Бонусы тех же товаров — от новой цены ────────────────────────────────────
UPDATE public.products p
   SET bonus_points_award = ROUND(p.final_price * 0.05)
  FROM _bonus_fix b
 WHERE p.id = b.id;

-- ── 5. Проверка результата ──────────────────────────────────────────────────────
DO $$
DECLARE
  v_left int;
BEGIN
  SELECT count(*) INTO v_left
    FROM public.products
   WHERE COALESCE(discount_percentage, 0) = 0 AND final_price <> price;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Осталось товаров без скидки с final_price <> price: %', v_left;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

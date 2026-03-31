-- ================================================================================
-- МИГРАЦИЯ: Психологическое округление цен (Стандарт "90 тенге") - 2026-03-31
-- ================================================================================
-- Проблема: Текущая система выдает "сырые" математические числа (15 302 ₸)
-- Решение: Округляем до сотен в меньшую сторону и вычитаем 10 тенге
-- 
-- Примеры:
-- 15 302 ₸ → 15 290 ₸
-- 15 050 ₸ → 14 990 ₸
-- 8 765 ₸ → 8 690 ₸
-- 
-- Формула: FLOOR(price_with_discount / 100) * 100 - 10
-- 
-- Исключение: Для товаров дешевле 500 ₸ округляем до 5 или 0 (чтобы не уйти в минус)
-- ================================================================================

-- 1. Удаляем старую generated column
ALTER TABLE public.products
DROP COLUMN IF EXISTS final_price;

-- 2. Создаем новую generated column с психологическим округлением
ALTER TABLE public.products
ADD COLUMN final_price NUMERIC
  GENERATED ALWAYS AS (
    CASE
      -- Для товаров дешевле 500 ₸: округляем до 5 или 0 (без -10)
      WHEN (price * (100 - COALESCE(discount_percentage, 0)) / 100) < 500 THEN
        FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 10) * 10
      
      -- Для товаров от 500 ₸: округляем до сотен и вычитаем 10
      ELSE
        (FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 100) * 100) - 10
    END
  ) STORED;

-- 3. Пересоздаем индексы по final_price
DROP INDEX IF EXISTS idx_products_active_category_final_price_asc;
DROP INDEX IF EXISTS idx_products_active_category_final_price_desc;

CREATE INDEX idx_products_active_category_final_price_asc
ON public.products (category_id, final_price ASC, name ASC)
WHERE is_active = TRUE;

CREATE INDEX idx_products_active_category_final_price_desc
ON public.products (category_id, final_price DESC, name ASC)
WHERE is_active = TRUE;

-- 4. Обновляем комментарий
COMMENT ON COLUMN public.products.final_price IS
'Цена со скидкой с психологическим округлением (всегда заканчивается на 90 для товаров от 500₸, на 0/5 для дешевых). Автоматически пересчитывается при изменении price или discount_percentage.';

-- 5. Принудительно обновляем bonus_points_award для всех товаров
-- (бонусы теперь рассчитываются от округленной цены)
UPDATE public.products
SET bonus_points_award = ROUND(final_price * 0.05)
WHERE is_active = true
  AND final_price > 0;

-- 6. Перезагрузка схемы PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ================================================================================
-- ПРОВЕРКА РЕЗУЛЬТАТОВ
-- ================================================================================

-- Проверяем примеры округления (убрали GROUP BY, так как final_price теперь generated column)
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.products
  WHERE is_active = true
    AND discount_percentage > 0
    AND final_price % 100 = 90;
  
  RAISE NOTICE 'Товаров со скидкой и округлением на 90: %', v_count;
  
  SELECT COUNT(*)
  INTO v_count
  FROM public.products
  WHERE is_active = true
    AND discount_percentage > 0
    AND final_price < 500;
  
  RAISE NOTICE 'Дешевых товаров со скидкой (< 500₸): %', v_count;
END $$;

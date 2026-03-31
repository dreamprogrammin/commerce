-- ================================================================================
-- ПРОВЕРКА: Психологическое округление цен
-- ================================================================================
-- Выполнить ПОСЛЕ применения миграции 20260331102800_add_psychological_price_rounding.sql
-- ================================================================================

-- 1. Проверяем примеры округленных цен
SELECT 
  name,
  price as "Базовая цена",
  discount_percentage as "Скидка %",
  ROUND(price * (100 - COALESCE(discount_percentage, 0)) / 100) as "До округления",
  final_price as "После округления",
  bonus_points_award as "Бонусы"
FROM public.products
WHERE is_active = true
  AND discount_percentage > 0
ORDER BY final_price DESC
LIMIT 10;

-- 2. Статистика по округлению
SELECT 
  'Товаров со скидкой (заканчиваются на 90)' as metric,
  COUNT(*) as count
FROM public.products
WHERE is_active = true
  AND discount_percentage > 0
  AND final_price >= 500
  AND final_price % 100 = 90

UNION ALL

SELECT 
  'Дешевых товаров со скидкой (< 500₸)' as metric,
  COUNT(*) as count
FROM public.products
WHERE is_active = true
  AND discount_percentage > 0
  AND final_price < 500

UNION ALL

SELECT 
  'Товаров без скидки' as metric,
  COUNT(*) as count
FROM public.products
WHERE is_active = true
  AND (discount_percentage IS NULL OR discount_percentage = 0);

-- 3. Проверяем, что бонусы рассчитаны от округленной цены
SELECT 
  name,
  final_price as "Округленная цена",
  bonus_points_award as "Бонусы",
  ROUND(final_price * 0.05) as "Ожидаемые бонусы (5%)",
  CASE 
    WHEN bonus_points_award = ROUND(final_price * 0.05) THEN '✅ OK'
    ELSE '❌ Несовпадение'
  END as "Статус"
FROM public.products
WHERE is_active = true
  AND discount_percentage > 0
ORDER BY final_price DESC
LIMIT 10;

-- 4. Примеры округления для разных ценовых диапазонов
SELECT 
  CASE 
    WHEN final_price < 500 THEN '< 500₸'
    WHEN final_price < 1000 THEN '500-1000₸'
    WHEN final_price < 5000 THEN '1000-5000₸'
    WHEN final_price < 10000 THEN '5000-10000₸'
    ELSE '> 10000₸'
  END as "Ценовой диапазон",
  COUNT(*) as "Количество товаров",
  MIN(final_price) as "Мин. цена",
  MAX(final_price) as "Макс. цена",
  ROUND(AVG(final_price)) as "Средняя цена"
FROM public.products
WHERE is_active = true
  AND discount_percentage > 0
GROUP BY 
  CASE 
    WHEN final_price < 500 THEN '< 500₸'
    WHEN final_price < 1000 THEN '500-1000₸'
    WHEN final_price < 5000 THEN '1000-5000₸'
    WHEN final_price < 10000 THEN '5000-10000₸'
    ELSE '> 10000₸'
  END
ORDER BY MIN(final_price);

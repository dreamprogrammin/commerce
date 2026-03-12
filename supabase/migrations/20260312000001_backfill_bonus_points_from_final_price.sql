-- Массовый пересчёт bonus_points_award для всех товаров.
-- Формула: ROUND(final_price * 0.05) — стандартные 5% от цены со скидкой.
-- final_price — generated column: price * (100 - COALESCE(discount_percentage, 0)) / 100

-- 1. Обновляем товары с нулевыми или отсутствующими бонусами
UPDATE public.products
SET bonus_points_award = ROUND(final_price * 0.05)
WHERE (bonus_points_award IS NULL OR bonus_points_award = 0)
  AND final_price > 0;

-- 2. Исправляем товары, у которых бонусы были посчитаны от полной цены (без скидки).
--    Признак: bonus_points_award = ROUND(price * 0.05) при наличии скидки,
--    а должно быть ROUND(final_price * 0.05).
UPDATE public.products
SET bonus_points_award = ROUND(final_price * 0.05)
WHERE discount_percentage > 0
  AND bonus_points_award = ROUND(price * 0.05)
  AND bonus_points_award != ROUND(final_price * 0.05);

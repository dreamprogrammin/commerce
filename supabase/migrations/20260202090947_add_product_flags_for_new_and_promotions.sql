-- =================================================================
-- ==                                                             ==
-- ==       ДОБАВЛЕНИЕ ФЛАГОВ ДЛЯ "НОВИНКИ" И "АКЦИИ"              ==
-- ==                                                             ==
-- =================================================================

-- 1. Добавляем флаг "Новинка" (is_new)
-- Этот флаг будет использоваться для отображения товара в разделе "Новинки"
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_new BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_new IS 'Флаг "Новинка" - товар отображается в разделе "Новинки"';

-- 2. Добавляем флаг "Акция" (is_on_promotion)
-- Этот флаг будет использоваться для отображения товара в разделе "Акции"
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_on_promotion BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.products.is_on_promotion IS 'Флаг "Акция" - товар отображается в разделе "Акции"';

-- 3. Создаем индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE is_new = TRUE;
CREATE INDEX IF NOT EXISTS idx_products_is_on_promotion ON public.products(is_on_promotion) WHERE is_on_promotion = TRUE;

-- 4. Помечаем несколько существующих товаров как новинки (для демонстрации)
-- Это можно убрать в продакшене
UPDATE public.products
SET is_new = TRUE
WHERE slug IN ('racing-car-lightning', 'space-shuttle-constructor', 'doll-princess-aurora')
  AND EXISTS (SELECT 1 FROM public.products WHERE slug IN ('racing-car-lightning', 'space-shuttle-constructor', 'doll-princess-aurora'));

-- 5. Помечаем несколько существующих товаров как акции (для демонстрации)
-- Это можно убрать в продакшене
UPDATE public.products
SET is_on_promotion = TRUE
WHERE slug IN ('fire-truck-hero', 'interactive-baby-doll', 'jenga-game')
  AND EXISTS (SELECT 1 FROM public.products WHERE slug IN ('fire-truck-hero', 'interactive-baby-doll', 'jenga-game'));

-- Финальное сообщение
SELECT 'Флаги "Новинки" и "Акции" успешно добавлены!' AS status;

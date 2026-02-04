-- ============================================================================
-- Устанавливаем флаг is_on_promotion для товаров со скидкой
-- ============================================================================

-- Обновляем существующие товары: если есть скидка, то is_on_promotion = true
UPDATE public.products
SET is_on_promotion = TRUE
WHERE discount_percentage > 0
  AND discount_percentage <= 100
  AND is_active = TRUE
  AND is_on_promotion = FALSE;

-- Создаём триггер, который автоматически устанавливает is_on_promotion при изменении discount_percentage
CREATE OR REPLACE FUNCTION public.sync_promotion_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Если есть скидка, устанавливаем флаг акции
    IF NEW.discount_percentage > 0 AND NEW.discount_percentage <= 100 THEN
        NEW.is_on_promotion := TRUE;
    ELSE
        -- Если скидки нет, убираем флаг акции
        NEW.is_on_promotion := FALSE;
    END IF;

    RETURN NEW;
END;
$$;

-- Удаляем старый триггер, если существует
DROP TRIGGER IF EXISTS trigger_sync_promotion_flag ON public.products;

-- Создаём триггер на INSERT и UPDATE
CREATE TRIGGER trigger_sync_promotion_flag
    BEFORE INSERT OR UPDATE OF discount_percentage
    ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_promotion_flag();

COMMENT ON FUNCTION public.sync_promotion_flag() IS
'Автоматически синхронизирует флаг is_on_promotion с наличием скидки (discount_percentage > 0)';

-- Выводим статистику
DO $$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count FROM public.products WHERE is_on_promotion = TRUE;
    RAISE NOTICE '✅ Установлен флаг is_on_promotion для % товаров', v_count;
END $$;

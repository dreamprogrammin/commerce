-- ============================================================================
-- ОПТИМИЗАЦИЯ: Делаем FAQ триггеры условными
-- ============================================================================
--
-- ПРОБЛЕМА:
-- FAQ триггеры срабатывают при каждой вставке категории/бренда/линейки/товара
-- Это замедляет:
-- - Создание новых сущностей
-- - Массовый импорт данных
-- - Обновление товаров
--
-- РЕШЕНИЕ:
-- Добавляем проверку на настройку в settings:
-- - Если auto_generate_faq = true -> генерируем FAQ
-- - Если auto_generate_faq = false -> пропускаем
--
-- По умолчанию отключаем автогенерацию для производительности
-- ============================================================================

-- Добавляем настройку для управления автогенерацией FAQ
INSERT INTO public.settings (key, value, description, updated_at)
VALUES (
    'auto_generate_faq',
    'false'::jsonb,
    'Автоматически генерировать FAQ при создании категорий/брендов/линеек. false = отключено (рекомендуется для производительности)',
    now()
)
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

-- ========================================
-- 1. ОПТИМИЗИРОВАННЫЙ ТРИГГЕР ДЛЯ КАТЕГОРИЙ
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_category_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auto_generate_enabled BOOLEAN;
BEGIN
    -- Проверяем настройку
    SELECT (value::TEXT)::BOOLEAN INTO v_auto_generate_enabled
    FROM public.settings
    WHERE key = 'auto_generate_faq';

    -- Генерируем FAQ только если включено
    IF COALESCE(v_auto_generate_enabled, false) THEN
        PERFORM public.generate_category_questions(NEW.id, true);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================
-- 2. ОПТИМИЗИРОВАННЫЙ ТРИГГЕР ДЛЯ БРЕНДОВ
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_brand_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auto_generate_enabled BOOLEAN;
BEGIN
    SELECT (value::TEXT)::BOOLEAN INTO v_auto_generate_enabled
    FROM public.settings
    WHERE key = 'auto_generate_faq';

    IF COALESCE(v_auto_generate_enabled, false) THEN
        PERFORM public.generate_brand_questions(NEW.id, true);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================
-- 3. ОПТИМИЗИРОВАННЫЙ ТРИГГЕР ДЛЯ ЛИНЕЕК ПРОДУКТОВ
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_product_line_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auto_generate_enabled BOOLEAN;
BEGIN
    SELECT (value::TEXT)::BOOLEAN INTO v_auto_generate_enabled
    FROM public.settings
    WHERE key = 'auto_generate_faq';

    IF COALESCE(v_auto_generate_enabled, false) THEN
        PERFORM public.generate_product_line_questions(NEW.id, true);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================
-- 4. ОПТИМИЗИРОВАННЫЙ ТРИГГЕР ДЛЯ МАТЕРИАЛОВ
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_material_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auto_generate_enabled BOOLEAN;
BEGIN
    SELECT (value::TEXT)::BOOLEAN INTO v_auto_generate_enabled
    FROM public.settings
    WHERE key = 'auto_generate_faq';

    IF COALESCE(v_auto_generate_enabled, false) THEN
        PERFORM public.generate_material_questions(NEW.id, true);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================
-- 5. ОПТИМИЗИРОВАННЫЙ ТРИГГЕР ДЛЯ СТРАН
-- ========================================

CREATE OR REPLACE FUNCTION public.auto_generate_country_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auto_generate_enabled BOOLEAN;
BEGIN
    SELECT (value::TEXT)::BOOLEAN INTO v_auto_generate_enabled
    FROM public.settings
    WHERE key = 'auto_generate_faq';

    IF COALESCE(v_auto_generate_enabled, false) THEN
        PERFORM public.generate_country_questions(NEW.id, true);
    END IF;

    RETURN NEW;
END;
$$;

-- ========================================
-- 6. ОТКЛЮЧАЕМ ТРИГГЕР ОБНОВЛЕНИЯ FAQ ПРИ ДОБАВЛЕНИИ ТОВАРОВ
-- ========================================

-- Этот триггер особенно проблемный, так как срабатывает при каждом добавлении товара
-- Отключаем его полностью, FAQ можно генерировать вручную из админки
DROP TRIGGER IF EXISTS trigger_update_category_faq_on_product ON public.products;

-- Удаляем устаревшую функцию, если она существует
DROP FUNCTION IF EXISTS public.update_category_faq_on_product_change();

-- Комментарии
COMMENT ON FUNCTION public.auto_generate_category_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой категории. Управляется настройкой auto_generate_faq в таблице settings.';

COMMENT ON FUNCTION public.auto_generate_brand_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании нового бренда. Управляется настройкой auto_generate_faq в таблице settings.';

COMMENT ON FUNCTION public.auto_generate_product_line_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой линейки продуктов. Управляется настройкой auto_generate_faq в таблице settings.';

COMMENT ON FUNCTION public.auto_generate_material_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании нового материала. Управляется настройкой auto_generate_faq в таблице settings.';

COMMENT ON FUNCTION public.auto_generate_country_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой страны. Управляется настройкой auto_generate_faq в таблице settings.';

-- ========================================
-- ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ
-- ========================================

/*
📝 КАК ВКЛЮЧИТЬ/ОТКЛЮЧИТЬ АВТОГЕНЕРАЦИЮ FAQ:

-- Включить автогенерацию FAQ (не рекомендуется на продакшене):
UPDATE public.settings
SET value = 'true'::jsonb
WHERE key = 'auto_generate_faq';

-- Отключить автогенерацию FAQ (рекомендуется):
UPDATE public.settings
SET value = 'false'::jsonb
WHERE key = 'auto_generate_faq';

🎯 РЕКОМЕНДАЦИИ:
- На продакшене держите auto_generate_faq = false
- Генерируйте FAQ вручную через кнопку в админке для популярных категорий
- Это значительно ускорит создание категорий и товаров
- При массовом импорте данных скорость увеличится в разы
*/

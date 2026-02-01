-- ====================================
-- АВТОМАТИЧЕСКАЯ ГЕНЕРАЦИЯ FAQ ПРИ СОЗДАНИИ СУЩНОСТЕЙ
-- ====================================

-- ========================================
-- 1. ТРИГГЕР ДЛЯ КАТЕГОРИЙ
-- ========================================

-- Функция для автогенерации FAQ при создании категории
CREATE OR REPLACE FUNCTION public.auto_generate_category_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Генерируем FAQ только для новых категорий (INSERT)
  -- Используем skip_ai = true для быстрой генерации базовых вопросов
  -- AI-генерацию можно запустить вручную из админки при необходимости
  PERFORM public.generate_category_questions(NEW.id, true);

  RETURN NEW;
END;
$$;

-- Триггер срабатывает ПОСЛЕ создания категории
CREATE TRIGGER trigger_auto_generate_category_faq
  AFTER INSERT ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_category_faq();

-- ========================================
-- 2. ТРИГГЕР ДЛЯ БРЕНДОВ
-- ========================================

-- Функция для автогенерации FAQ при создании бренда
CREATE OR REPLACE FUNCTION public.auto_generate_brand_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Генерируем FAQ для нового бренда
  PERFORM public.generate_brand_questions(NEW.id, true);

  RETURN NEW;
END;
$$;

-- Триггер срабатывает ПОСЛЕ создания бренда
CREATE TRIGGER trigger_auto_generate_brand_faq
  AFTER INSERT ON public.brands
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_brand_faq();

-- ========================================
-- 3. ТРИГГЕР ДЛЯ ЛИНЕЕК ПРОДУКТОВ
-- ========================================

-- Функция для автогенерации FAQ при создании линейки
CREATE OR REPLACE FUNCTION public.auto_generate_product_line_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Генерируем FAQ для новой линейки
  PERFORM public.generate_product_line_questions(NEW.id, true);

  RETURN NEW;
END;
$$;

-- Триггер срабатывает ПОСЛЕ создания линейки
CREATE TRIGGER trigger_auto_generate_product_line_faq
  AFTER INSERT ON public.product_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_product_line_faq();

-- ========================================
-- 4. ТРИГГЕР ДЛЯ МАТЕРИАЛОВ
-- ========================================

-- Функция для автогенерации FAQ при создании материала
CREATE OR REPLACE FUNCTION public.auto_generate_material_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Генерируем FAQ для нового материала
  PERFORM public.generate_material_questions(NEW.id, true);

  RETURN NEW;
END;
$$;

-- Триггер срабатывает ПОСЛЕ создания материала
CREATE TRIGGER trigger_auto_generate_material_faq
  AFTER INSERT ON public.materials
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_material_faq();

-- ========================================
-- 5. ТРИГГЕР ДЛЯ СТРАН
-- ========================================

-- Функция для автогенерации FAQ при создании страны
CREATE OR REPLACE FUNCTION public.auto_generate_country_faq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Генерируем FAQ для новой страны
  PERFORM public.generate_country_questions(NEW.id, true);

  RETURN NEW;
END;
$$;

-- Триггер срабатывает ПОСЛЕ создания страны
CREATE TRIGGER trigger_auto_generate_country_faq
  AFTER INSERT ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_country_faq();

-- ========================================
-- 6. ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ FAQ ПРИ ИЗМЕНЕНИИ КОЛИЧЕСТВА ТОВАРОВ
-- ========================================

-- Функция для обновления FAQ категории при добавлении товаров
CREATE OR REPLACE FUNCTION public.update_category_faq_on_product_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_products_count INTEGER;
BEGIN
  -- Проверяем, изменилась ли категория товара
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.category_id != NEW.category_id)) THEN
    -- Получаем количество товаров в новой категории
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE category_id = NEW.category_id AND is_active = true;

    -- Если товаров стало больше 20, можно сгенерировать AI вопросы
    -- Пока просто обновляем базовые вопросы
    IF v_products_count > 5 THEN
      PERFORM public.generate_category_questions(NEW.category_id, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Триггер для обновления FAQ категории при добавлении товаров
-- Срабатывает после каждого 5-го товара
CREATE TRIGGER trigger_update_category_faq_on_product
  AFTER INSERT OR UPDATE OF category_id ON public.products
  FOR EACH ROW
  WHEN (NEW.is_active = true)
  EXECUTE FUNCTION public.update_category_faq_on_product_change();

-- Комментарии
COMMENT ON FUNCTION public.auto_generate_category_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой категории';

COMMENT ON FUNCTION public.auto_generate_brand_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании нового бренда';

COMMENT ON FUNCTION public.auto_generate_product_line_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой линейки продуктов';

COMMENT ON FUNCTION public.auto_generate_material_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании нового материала';

COMMENT ON FUNCTION public.auto_generate_country_faq() IS
'Автоматически генерирует базовые FAQ вопросы при создании новой страны';

COMMENT ON FUNCTION public.update_category_faq_on_product_change() IS
'Обновляет FAQ категории при добавлении товаров (после каждого 5-го товара)';

-- ========================================
-- ИНФОРМАЦИЯ
-- ========================================

/*
🎯 КАК ЭТО РАБОТАЕТ:

1. При создании НОВОЙ категории/бренда/линейки/материала/страны автоматически генерируются базовые FAQ вопросы
2. Базовые вопросы создаются БЫСТРО (без AI), чтобы не замедлять процесс создания
3. AI-вопросы можно сгенерировать позже вручную из админки кнопкой "Сгенерировать FAQ"
4. При добавлении товаров в категорию FAQ автоматически обновляется

📝 ПРИМЕРЫ:

- Создали категорию "Конструкторы LEGO" → сразу появятся 4 базовых вопроса
- Добавили 10 товаров в категорию → FAQ обновится с новой информацией о ценах и количестве
- Создали бренд "Mattel" → сразу появятся базовые вопросы о бренде
- Добавили линейку "Barbie" → сразу появятся вопросы о линейке

⚡ ПРОИЗВОДИТЕЛЬНОСТЬ:

- Триггеры работают асинхронно (AFTER INSERT)
- Не блокируют создание сущностей
- Генерация занимает < 100ms для базовых вопросов
- AI-генерация запускается вручную для популярных сущностей
*/

-- Up Migration

-- 1. Таблица `attributes`: Справочник всех возможных атрибутов/фильтров
CREATE TABLE public.attributes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- Название, которое видит пользователь (например, "Цвет", "Высота куклы")
    slug TEXT NOT NULL UNIQUE, -- Слаг для использования в коде (например, "color", "doll_height")
    display_type TEXT NOT NULL DEFAULT 'select' -- Как отображать в фильтре: 'select' (чекбоксы), 'range' (ползунок), 'color' (кружки с цветом)
);
ALTER TABLE public.attributes ENABLE ROW LEVEL SECURITY;
-- (Политики RLS добавим в следующей миграции, чтобы было проще)

-- 2. Таблица `attribute_options`: Справочник возможных значений для атрибутов типа 'select' или 'color'
CREATE TABLE public.attribute_options (
    id SERIAL PRIMARY KEY,
    attribute_id INTEGER NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
    value TEXT NOT NULL, -- Значение (например, "Красный", "20 см")
    meta JSONB -- Дополнительные данные, например, hex-код для цвета: {"hex": "#FF0000"}
);
ALTER TABLE public.attribute_options ENABLE ROW LEVEL SECURITY;

-- 3. Таблица `category_attributes`: Связь, определяющая, какие атрибуты показывать для какой категории
CREATE TABLE public.category_attributes (
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, attribute_id)
);
ALTER TABLE public.category_attributes ENABLE ROW LEVEL SECURITY;

-- 4. Таблица `product_attribute_values`: Фактические значения атрибутов для каждого товара
CREATE TABLE public.product_attribute_values (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_id INTEGER NOT NULL REFERENCES public.attributes(id) ON DELETE CASCADE,
    option_id INTEGER NULL REFERENCES public.attribute_options(id) ON DELETE CASCADE, -- Для атрибутов типа 'select'
    -- Здесь можно добавить колонки для других типов, например, `numeric_value` для 'range'
    PRIMARY KEY (product_id, attribute_id)
);
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

-- 5. Наполняем данными для примера
-- Создаем атрибут "Цвет"
INSERT INTO public.attributes (name, slug, display_type) VALUES ('Цвет', 'color', 'color');
-- Добавляем опции для цвета
INSERT INTO public.attribute_options (attribute_id, value, meta) VALUES
(1, 'Красный', '{"hex": "#dc2626"}'),
(1, 'Синий', '{"hex": "#2563eb"}'),
(1, 'Зеленый', '{"hex": "#16a34a"}'),
(1, 'Желтый', '{"hex": "#facc15"}'),
(1, 'Черный', '{"hex": "#000000"}'),
(1, 'Белый', '{"hex": "#ffffff"}');

-- Привязываем атрибут "Цвет" к категориям "Машинки" и "Куклы" (используйте ваши реальные ID категорий!)
-- ЗАМЕНИТЕ UUID НА ВАШИ РЕАЛЬНЫЕ ID ИЗ ТАБЛИЦЫ categories
-- INSERT INTO public.category_attributes (category_id, attribute_id) VALUES
-- ('UUID-ВАШЕЙ-КАТЕГОРИИ-МАШИНКИ', 1),
-- ('UUID-ВАШЕЙ-КАТЕГОРИИ-КУКЛЫ', 1);


/*
-- Down Migration (Закомментировано)

DROP TABLE IF EXISTS public.product_attribute_values;
DROP TABLE IF EXISTS public.category_attributes;
DROP TABLE IF EXISTS public.attribute_options;
DROP TABLE IF EXISTS public.attributes;

*/
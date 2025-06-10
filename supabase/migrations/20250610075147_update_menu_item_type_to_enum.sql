ALTER TABLE public.menu_items
    DROP CONSTRAINT IF EXISTS menu_items_item_type_check;

-- 2. Теперь, когда ничего не мешает, создаем ENUM.
--    ENUM сам по себе является более строгим ограничением, чем CHECK, поэтому старое ограничение больше не нужно.
CREATE TYPE public.menu_item_type_enum AS ENUM ('link', 'trigger', 'trigger_and_link');

-- 3. И спокойно меняем тип колонки, указывая, как преобразовать старые текстовые значения в новый тип.
ALTER TABLE public.menu_items
    ALTER COLUMN item_type TYPE public.menu_item_type_enum
    USING (item_type::public.menu_item_type_enum);
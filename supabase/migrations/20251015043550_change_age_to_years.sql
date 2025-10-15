-- 1. Переименовываем колонки возраста в 'products'
ALTER TABLE public.products RENAME COLUMN min_age TO min_age_years;
ALTER TABLE public.products RENAME COLUMN max_age TO max_age_years;

-- 2. Создаем новую таблицу 'materials'
CREATE TABLE public.materials (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.materials FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for admins" ON public.materials FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Enable update for admins" ON public.materials FOR UPDATE USING (public.is_admin());
CREATE POLICY "Enable delete for admins" ON public.materials FOR DELETE USING (public.is_admin());

-- 3. Наполняем таблицу 'materials' базовыми значениями
INSERT INTO public.materials (name) VALUES
('Пластик'), ('Дерево'), ('Текстиль'), ('Металл'), ('Резина'), ('Силикон');

-- 4. Добавляем в 'products' колонку для связи с материалом
ALTER TABLE public.products ADD COLUMN material_id INTEGER NULL REFERENCES public.materials(id);
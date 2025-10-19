-- Up Migration

-- Политики для `attributes`
CREATE POLICY "Allow public read access for attributes" ON public.attributes FOR SELECT USING (TRUE);
CREATE POLICY "Allow admin full access for attributes" ON public.attributes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Политики для `attribute_options`
CREATE POLICY "Allow public read access for attribute_options" ON public.attribute_options FOR SELECT USING (TRUE);
CREATE POLICY "Allow admin full access for attribute_options" ON public.attribute_options FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Политики для `category_attributes`
CREATE POLICY "Allow public read access for category_attributes" ON public.category_attributes FOR SELECT USING (TRUE);
CREATE POLICY "Allow admin full access for category_attributes" ON public.category_attributes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Политики для `product_attribute_values`
CREATE POLICY "Allow public read access for product_attribute_values" ON public.product_attribute_values FOR SELECT USING (TRUE);
CREATE POLICY "Allow admin full access for product_attribute_values" ON public.product_attribute_values FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
-- Down Migration (Закомментировано)

DROP POLICY IF EXISTS "Allow public read access for attributes" ON public.attributes;
DROP POLICY IF EXISTS "Allow admin full access for attributes" ON public.attributes;
-- ... и так далее для всех таблиц ...

*/
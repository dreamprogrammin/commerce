-- Убеждаемся, что RLS для storage.objects включена
-- (эта команда может вызывать ошибку "must be owner", если выполняется не от имени владельца.
-- Supabase обычно включает RLS для storage.objects по умолчанию, когда вы начинаете работать с политиками бакетов.
-- Если вы уверены, что RLS уже включена (проверьте в UI), эту строку можно закомментировать или удалить из миграции,
-- чтобы избежать потенциальной ошибки при db reset/push, если пользователь миграции не владелец storage.objects)
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Политика: Публичное чтение для бакета 'menu-item-images'
CREATE POLICY "Allow public read for menu item images"
    ON storage.objects FOR SELECT TO public USING (bucket_id = 'menu-item-images');

-- Политика: Админы могут загружать в 'menu-item-images'
DROP POLICY IF EXISTS "Admins can upload menu item images" ON storage.objects; -- Замените на точное имя вашей политики из UI
CREATE POLICY "Admins can upload menu item images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK ((bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')));

-- Политика: Админы могут обновлять в 'menu-item-images'
DROP POLICY IF EXISTS "Admins can update menu item images" ON storage.objects; -- Замените на точное имя вашей политики из UI
CREATE POLICY "Admins can update menu item images"
    ON storage.objects FOR UPDATE TO authenticated
    USING ((bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')))
    WITH CHECK ((bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')));

-- Политика: Админы могут удалять из 'menu-item-images'
DROP POLICY IF EXISTS "Admins can delete menu item images" ON storage.objects; -- Замените на точное имя вашей политики из UI
CREATE POLICY "Admins can delete menu item images"
    ON storage.objects FOR DELETE TO authenticated
    USING ((bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')));

-- Убедитесь, что функция current_user_has_role_internal существует и права на нее выданы
-- (это должно быть в одной из предыдущих миграций)
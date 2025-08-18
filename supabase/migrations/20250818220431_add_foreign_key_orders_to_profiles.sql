-- Добавляем внешний ключ от таблицы `orders` к таблице `profiles`.
-- Это позволит Supabase автоматически "джойнить" данные.
ALTER TABLE public.orders
ADD CONSTRAINT orders_user_id_fkey_to_profiles
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE SET NULL;
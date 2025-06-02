alter table "public"."profiles" add column "role" text not null default 'user'::text;

alter table "public"."profiles" add column "updated_at" timestamp with time zone not null default now();

CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text, 'editor'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), -- Пытаемся взять полное имя
    NULL, -- Предполагаем, что last_name не извлекается отдельно или не используется
    NEW.phone,
    'user'     -- Роль по умолчанию
  );
  -- Если у вас есть отдельные поля для first_name и last_name в raw_user_meta_data от OAuth:
  -- first_name: COALESCE(NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'first_name'),
  -- last_name: COALESCE(NEW.raw_user_meta_data->>'family_name', NEW.raw_user_meta_data->>'last_name'),
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Ошибка в триггере handle_new_user_profile_creation: SQLSTATE: %, SQLERRM: %', SQLSTATE, SQLERRM;
    RETURN NEW; -- Важно вернуть NEW, чтобы не прервать основную операцию INSERT в auth.users
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();



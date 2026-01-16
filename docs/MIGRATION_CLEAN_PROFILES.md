# Миграция: Очистка логики Profiles и Auth

## Дата создания

2025-12-24

## Файл миграции

`20251224100816_clean_profiles_and_auth_logic.sql`

## Цель миграции

Эта миграция создана для синхронизации локальной и удаленной БД путем удаления всей старой логики profiles и авторизации, накопившейся в предыдущих миграциях, и создания единой чистой системы.

## Что делает миграция

### 1. Удаление старых триггеров

Удаляет все триггеры, связанные с profiles и авторизацией:

- `on_auth_user_created` - старый триггер создания профиля
- `on_profile_created_grant_bonus` - триггер выдачи приветственного бонуса
- `on_first_order_grant_welcome_bonus` - триггер выдачи бонуса при первом заказе
- `trigger_protect_profile_role_update` - триггер защиты роли

### 2. Удаление старых функций

Удаляет все функции, связанные с profiles и авторизацией:

- `handle_new_user()` - старые версии функции создания профиля
- `handle_new_user_profile_creation()` - старая функция создания профиля
- `grant_welcome_bonus()` - функция выдачи приветственного бонуса
- `grant_welcome_bonus_on_first_order()` - функция выдачи бонуса при первом заказе
- `merge_anon_user_into_real_user()` - функция слияния анонимного пользователя
- `protect_profile_role_update()` - функция защиты роли

### 3. Проверка структуры таблицы profiles

Миграция проверяет, что таблица `profiles` имеет правильную структуру:

- `active_bonus_balance` - активные бонусы
- `pending_bonus_balance` - ожидающие бонусы
- `has_received_welcome_bonus` - флаг получения приветственного бонуса

Если старая колонка `bonus_balance` существует, она удаляется.

### 4. Создание новой функции `handle_new_user()`

Создает новую чистую функцию для автоматического создания профиля при регистрации:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
BEGIN
  -- Извлекаем имя из метаданных или используем email
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Создаем профиль для нового пользователя
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    active_bonus_balance,
    pending_bonus_balance,
    has_received_welcome_bonus
  )
  VALUES (
    NEW.id,
    v_first_name,
    COALESCE(NEW.raw_user_meta_data->>'last_name', NULL),
    NEW.phone,
    'user',
    0,
    0,
    FALSE
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;
```

**Особенности:**

- Автоматически извлекает имя пользователя из метаданных Google OAuth
- Если имя не найдено, использует часть email до @
- Создает профиль с нулевыми балансами бонусов
- Устанавливает роль `user` по умолчанию
- Использует `ON CONFLICT DO NOTHING` для безопасности

### 5. Создание триггера `on_auth_user_created`

Создает триггер, который автоматически вызывает функцию `handle_new_user()` при создании нового пользователя в `auth.users`.

### 6. Создание функции защиты роли `protect_profile_role_update()`

Создает функцию для защиты поля `role` от несанкционированного изменения:

```sql
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Разрешаем изменение роли только если текущий пользователь - админ
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT public.current_user_has_role_internal('admin') THEN
      RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

**Особенности:**

- Проверяет, что роль изменяется только админом
- Использует функцию `current_user_has_role_internal()` для проверки прав
- Выбрасывает исключение при попытке несанкционированного изменения роли

### 7. Создание триггера `trigger_protect_profile_role_update`

Создает триггер, который автоматически вызывает функцию `protect_profile_role_update()` при попытке изменения роли пользователя.

### 8. Создание профилей для существующих пользователей

Автоматически создает профили для всех пользователей в `auth.users`, у которых еще нет профиля:

```sql
INSERT INTO public.profiles (
  id,
  first_name,
  last_name,
  phone,
  role,
  active_bonus_balance,
  pending_bonus_balance,
  has_received_welcome_bonus
)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'first_name',
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    split_part(u.email, '@', 1)
  ),
  COALESCE(u.raw_user_meta_data->>'last_name', NULL),
  u.phone,
  'user',
  0,
  0,
  FALSE
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

### 9. Обновление RLS политик

Удаляет старые политики и создает новые чистые политики:

**Политики для пользователей:**

- `Users can view own profile` - пользователь может читать свой профиль
- `Users can update own profile` - пользователь может обновлять свой профиль

**Политики для админов:**

- `Admins can view all profiles` - админы могут видеть все профили
- `Admins can update all profiles` - админы могут обновлять все профили

**Системная политика:**

- `Service role can insert profiles` - система может создавать профили через триггер

### 10. Добавление комментариев

Добавляет подробные комментарии к таблице и колонкам для документирования системы.

### 11. Статистика и проверка

В конце миграции выводится статистика:

- Всего пользователей в `auth.users`
- Пользователей с профилями
- Пользователей без профилей

Если обнаружены пользователи без профилей, выводится предупреждение.

## Что удалено из старой логики

### Удаленные функции и логика:

1. **Анонимные пользователи**
   - Функция `merge_anon_user_into_real_user()` - слияние анонимных пользователей удалена
   - Логика создания анонимных сессий удалена

2. **Приветственные бонусы при регистрации**
   - Функция `grant_welcome_bonus()` - выдача 1000 бонусов при регистрации
   - Триггер `on_profile_created_grant_bonus` - автоматическая выдача бонусов

3. **Приветственные бонусы при первом заказе**
   - Функция `grant_welcome_bonus_on_first_order()` - выдача бонусов при первом заказе
   - Триггер `on_first_order_grant_welcome_bonus` - автоматическая выдача бонусов

4. **Старые версии функций создания профиля**
   - Функция `handle_new_user_profile_creation()` - старая версия создания профиля

## Что осталось

### Текущая логика после миграции:

1. **Автоматическое создание профиля**
   - При регистрации через Google OAuth автоматически создается профиль
   - Профиль создается с нулевыми балансами бонусов
   - Имя берется из метаданных Google или из email

2. **Защита роли пользователя**
   - Роль может изменять только админ
   - Триггер защищает от несанкционированного изменения роли

3. **RLS политики**
   - Пользователи могут читать и обновлять только свой профиль
   - Админы могут видеть и обновлять все профили
   - Система может создавать профили через триггер

4. **Бонусная система (структура)**
   - `active_bonus_balance` - активные бонусы
   - `pending_bonus_balance` - ожидающие бонусы
   - `has_received_welcome_bonus` - флаг получения приветственного бонуса
   - **Логика начисления и активации бонусов находится в других миграциях**

## Что НЕ затронуто

Миграция **НЕ** удаляет и **НЕ** изменяет следующую логику:

1. **Бонусная система активации**
   - Функция `activate_pending_bonuses()` - активация ожидающих бонусов
   - Функция `recalculate_pending_balances()` - пересчет балансов
   - Эти функции находятся в миграции `20251223022921_fix_bonus_activation_system_safe.sql`

2. **Логика заказов**
   - Функция `create_order()` - создание заказов
   - Гостевые заказы
   - Начисление бонусов за заказы

3. **Другие таблицы**
   - `orders` - заказы
   - `order_items` - элементы заказов
   - `bonuses` - история бонусов (если существует)
   - `bonus_activation_skipped` - лог пропущенных активаций

## Как запустить миграцию

### Для локальной БД:

```bash
# Запустить локальную Supabase
supabase start

# Применить миграцию
supabase db reset

# Или применить только новую миграцию
supabase migration up
```

### Для удаленной БД:

```bash
# Применить миграции на продакшн
supabase db push
```

## Проверка после миграции

После применения миграции проверьте:

1. **Существующие пользователи имеют профили**

```sql
SELECT
  COUNT(*) as total_users,
  COUNT(p.id) as users_with_profiles
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;
```

2. **Триггер работает**
   Зарегистрируйте нового пользователя через Google OAuth и проверьте, что профиль создался автоматически.

3. **Защита роли работает**
   Попробуйте изменить роль обычного пользователя (должна выдать ошибку):

```sql
-- Это должно выдать ошибку (если вы не админ)
UPDATE public.profiles
SET role = 'admin'
WHERE id = '<your-user-id>';
```

4. **RLS политики работают**
   Проверьте, что пользователь видит только свой профиль:

```sql
-- Как обычный пользователь
SELECT * FROM public.profiles;
-- Должен вернуть только ваш профиль
```

## Возможные проблемы

### Проблема: Пользователи без профилей после миграции

**Решение:**
Запустите повторно блок создания профилей:

```sql
INSERT INTO public.profiles (...)
SELECT ... FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
```

### Проблема: Триггер не создается из-за прав

**Решение:**
Убедитесь, что у пользователя есть права на создание триггеров в схеме `auth`:

```sql
GRANT ALL ON SCHEMA auth TO postgres;
```

### Проблема: Конфликт с удаленной БД

**Решение:**

1. Сначала примените миграцию на локальной БД
2. Проверьте, что все работает корректно
3. Затем примените на удаленной БД

## Связанные миграции

Эта миграция заменяет логику из следующих миграций:

- `20250804104226__initialize_project.sql` - инициализация проекта
- `20250821150308_add_user_merge_rpc.sql` - слияние анонимных пользователей
- `20250822093702_setup_advanced_bonus_system.sql` - расширенная бонусная система
- `20250823073922_secure_welcome_bonus_logic.sql` - защита приветственных бонусов
- `20251217094837_migration_update_user_registration.sql` - обновление регистрации
- `20251222100237_fix_profile_v1.sql` - исправление профилей
- `20251223041438_create_profile_on_signup.sql` - создание профиля при регистрации

## Важно!

После применения этой миграции:

- **НЕ** запускайте старые миграции, которые создают удаленные триггеры/функции
- **Обновите** документацию проекта, если в ней описана старая логика
- **Проверьте** фронтенд-код, который мог полагаться на удаленные функции (например, `merge_anon_user_into_real_user`)

## Автор

Claude Sonnet 4.5

## Дата

2025-12-24

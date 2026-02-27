# Фикс: Google OAuth — ошибка 500 при авторизации без имени пользователя

## Дата

2026-02-27

## Проблема

При авторизации через Google на мобильных устройствах (Android) страница профиля
зависала в состоянии загрузки, после чего приложение падало с ошибкой 500.

### Root Cause

1. **Триггер `handle_new_user()`** — Google не всегда передаёт `full_name`/`name`
   в `raw_user_meta_data`. Если все поля имени пустые/null, в старой версии функции
   переменная `v_first_name` становилась `NULL` или пустой строкой. В некоторых сценариях
   это приводило к неожиданным ошибкам внутри транзакции OAuth, блокируя весь поток
   авторизации (Supabase callback возвращал 500).

2. **Нет EXCEPTION handler** — любое исключение в теле триггера откатывало транзакцию
   `INSERT INTO auth.users`, что делало OAuth полностью нерабочим.

3. **Гонка данных на клиенте** — если триггер не создал профиль, цикл повторных попыток
   в `profileStore.loadProfile()` завершался с `profile = null`, но не было механизма
   для создания профиля «на лету».

4. **Middleware ждал слишком мало** — при OAuth-редиректе Supabase асинхронно обменивает
   code на токен. 100 мс была недостаточна, middleware мог перенаправить на главную
   до завершения обмена кодом.

## Что исправлено

### 1. Миграция `20260227000001_fix_google_oauth_profile_creation.sql`

**`handle_new_user()`** — полностью обновлена:

```sql
v_first_name := COALESCE(
  NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), ''),
  NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name',  '')), ''),
  NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'name',       '')), ''),
  NULLIF(TRIM(COALESCE(split_part(COALESCE(NEW.email, ''), '@', 1), '')), ''),
  'Гость'  -- финальный fallback
);
```

- `NULLIF(TRIM(...), '')` — обрабатывает и `NULL`, и пустую строку `''`
- Цепочка COALESCE: first_name → full_name → name → email-prefix → 'Гость'
- `EXCEPTION WHEN OTHERS THEN RAISE WARNING ... RETURN NEW;` — **критично**: гарантирует,
  что авторизация ВСЕГДА завершается, даже если создание профиля упало с ошибкой

**Новая RPC `ensure_profile_exists()`** — SECURITY DEFINER fallback для клиента:
- Вызывается из `profileStore` после всех retry-попыток
- Создаёт профиль с теми же fallback-правилами
- Идемпотентна: возвращает существующий профиль, если он уже есть
- `GRANT EXECUTE ON ... TO authenticated`

**Бэкфилл** — миграция создаёт профили для пользователей, у которых их нет,
и исправляет пустые `first_name` в существующих профилях.

### 2. `stores/core/profileStore.ts`

После того как все 5 retry-попыток не нашли профиль:

```typescript
const { error: ensureError } = await supabase.rpc('ensure_profile_exists')
if (!ensureError) {
  // Re-fetch profile
  const { data: newProfile } = await supabase
    .from('profiles').select('*').eq('id', userId).maybeSingle()
  if (newProfile) { profile.value = newProfile; return true }
}
// Если все попытки провалились — toast + profile = null
toast.error('Профиль не найден', { description: 'Попробуйте выйти и войти снова.' })
```

### 3. `middleware/auth.global.ts`

Для защищённых маршрутов (/notifications и др.) при ожидании сессии:

```typescript
const isOAuthCallback = !!(to.query.code || to.query.access_token || to.hash?.includes('access_token'))
const maxWaitMs = isOAuthCallback ? 3000 : 300  // было: 100 мс

let waited = 0
while (!user.value && waited < maxWaitMs) {
  await new Promise(resolve => setTimeout(resolve, 100))
  waited += 100
}
```

## После применения

Запустите обновление TypeScript-типов:

```bash
supabase gen types typescript --local > types/supabase.ts
```

## Тест

1. Создайте Google-аккаунт с именем, которое не передаётся (или вручную передайте пустой `name` в тесте).
2. Авторизуйтесь через Google на мобильном устройстве.
3. Убедитесь, что:
   - Нет ошибки 500 от Supabase callback
   - Страница `/profile` загружается корректно
   - В шапке отображается имя 'Гость' или часть email (не пустая строка)
   - В `public.profiles` создана строка с `first_name = 'Гость'` или email-prefix

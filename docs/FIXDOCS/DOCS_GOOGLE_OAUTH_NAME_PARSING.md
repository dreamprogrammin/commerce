# FEATURE: Умный парсинг имени и фамилии из Google OAuth

**Дата:** 2026-03-01
**Статус:** Реализовано

---

## Описание задачи

При регистрации через Google OAuth поля `first_name` и `last_name` в `public.profiles` должны заполняться автоматически — без ручного ввода пользователем. После входа пользователь видит своё имя в шапке ("Привет, Александр!") и заполненные поля в настройках профиля.

---

## Проблема (что было раньше)

Google передаёт имя одной строкой в поле `full_name` или `name` в объекте `raw_user_meta_data`. Например:

```json
{
  "full_name": "Иван Иванов",
  "name": "Иван Иванов",
  "avatar_url": "https://lh3.googleusercontent.com/..."
}
```

Предыдущий триггер `handle_new_user()` использовал `full_name` целиком как значение для `first_name`:

```sql
v_first_name := COALESCE(
  NULLIF(TRIM(raw_user_meta_data->>'first_name'), ''),
  NULLIF(TRIM(raw_user_meta_data->>'full_name'), ''),  -- ← "Иван Иванов" → first_name
  ...
);
```

**Результат:** `first_name = "Иван Иванов"`, `last_name = NULL`.
В шапке выводилось "Привет, Иван Иванов!" вместо "Привет, Иван!".

---

## Решение

### Приоритетная цепочка извлечения имени

```
1. raw_user_meta_data->>'first_name'  (явное поле — некоторые провайдеры)
   ↓ нет
2. split_part(full_name / name, ' ', 1)  → first_name
   substring(full_name FROM pos+1)       → last_name
   ↓ нет full_name/name
3. email prefix (часть до @)
   ↓ нет email
4. 'Гость' (финальный fallback)
```

### Примеры парсинга

| `raw_user_meta_data` | `first_name` | `last_name` |
|----------------------|--------------|-------------|
| `full_name: "Иван Иванов"` | `Иван` | `Иванов` |
| `full_name: "Мария Иванова-Петрова"` | `Мария` | `Иванова-Петрова` |
| `full_name: "Madonna"` (одно слово) | `Madonna` | `NULL` |
| `first_name: "Алексей"`, `last_name: "Смирнов"` | `Алексей` | `Смирнов` |
| только email: `user@gmail.com` | `user` | `NULL` |
| нет данных | `Гость` | `NULL` |

---

## Что было изменено

### Новая миграция: `20260301000002_smart_name_parsing_from_oauth.sql`

#### Шаг 1 — Обновление `handle_new_user()`

```sql
-- Пробуем явные поля first_name / last_name
v_first_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
v_last_name  := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name',  '')), '');

-- Если нет — разбиваем full_name / name
IF v_first_name IS NULL THEN
  v_full_name := NULLIF(TRIM(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name', ''
  )), '');

  IF v_full_name IS NOT NULL THEN
    IF position(' ' IN v_full_name) > 0 THEN
      v_first_name := split_part(v_full_name, ' ', 1);
      v_last_name  := NULLIF(TRIM(substring(v_full_name FROM position(' ' IN v_full_name) + 1)), '');
    ELSE
      v_first_name := v_full_name;
    END IF;
  END IF;
END IF;

-- Финальный фолбэк
IF v_first_name IS NULL THEN
  v_first_name := COALESCE(
    NULLIF(TRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'Гость'
  );
END IF;
```

`substring(v_full_name FROM pos + 1)` вместо `split_part(v_full_name, ' ', 2)` — намеренно: `split_part` вернёт пустую строку если второго слова нет, а substring даёт нам всё **после первого пробела**, что корректно обрабатывает двойные фамилии ("Иванова-Петрова", "Де ла Круз").

#### Шаг 2 — Обновление `ensure_profile_exists()`

Та же логика применена к клиентскому фоллбэку, чтобы поведение было идентичным при любом сценарии создания профиля.

#### Шаг 3 — Бэкфилл существующих пользователей

```sql
-- Обновляем только тех, у кого first_name = 'Гость', NULL или ''
-- И у кого есть данные в auth.users.raw_user_meta_data
-- Пользователи с реальными именами НЕ затрагиваются
UPDATE public.profiles p
SET first_name = ..., last_name = ...
FROM parsed_names
WHERE p.id = parsed_names.id
  AND (p.first_name IS NULL OR TRIM(p.first_name) = '' OR p.first_name = 'Гость')
  AND parsed_names.new_first_name != 'Гость';
```

Бэкфилл **безопасен**: не трогает пользователей с уже заполненными именами, не заменяет реальные данные на 'Гость'.

---

## Как это отобразится на фронтенде

Никаких изменений фронтенда не требуется. `profileStore.fullName` уже вычисляет:

```typescript
// stores/core/profileStore.ts
const fullName = computed(() => {
  const firstName = profile.value.first_name || ''
  const lastName  = profile.value.last_name  || ''
  return `${firstName} ${lastName}`.trim() || user.value?.email || 'Пользователь'
})
```

После миграции:
- В шапке: "Привет, Иван!" (вместо "Привет, Иван Иванов!")
- В настройках профиля поля "Имя" и "Фамилия" уже заполнены

---

## Критерии приёмки

| # | Сценарий | Ожидаемое поведение |
|---|----------|---------------------|
| 1 | Новый пользователь входит через Google (`full_name = "Иван Иванов"`) | `first_name = "Иван"`, `last_name = "Иванов"` |
| 2 | Пользователь с двойной фамилией (`full_name = "Мария Иванова-Петрова"`) | `first_name = "Мария"`, `last_name = "Иванова-Петрова"` |
| 3 | Существующий пользователь с `first_name = "Гость"` | После миграции — реальное имя из Google |
| 4 | Пользователь с уже заполненным именем | Не изменяется |
| 5 | Шапка сайта | Отображает только первое имя "Привет, Иван!" |
| 6 | Страница настроек профиля | Поля "Имя" и "Фамилия" заполнены сразу после входа |

---

## Деплой-чеклист

- [ ] Применить миграцию: `supabase db push` (или SQL Editor в Supabase Dashboard)
- [ ] Убедиться, что бэкфилл выполнился — проверить в Studio: `SELECT id, first_name, last_name FROM profiles WHERE first_name = 'Гость'`

---

## Изменённые файлы

| Файл | Тип изменения |
|------|---------------|
| `supabase/migrations/20260301000002_smart_name_parsing_from_oauth.sql` | Новая миграция: умный парсинг имени в `handle_new_user` и `ensure_profile_exists`, бэкфилл |

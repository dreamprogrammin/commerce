# FIX: Ошибка 42703 — колонка avatar_url отсутствует в profiles

**Дата:** 2026-03-01
**Статус:** Исправлено

---

## Симптомы

- При открытии страницы товара с отзывами Supabase возвращал HTTP 400/500
- Тело ответа: `{"code": "42703", "message": "column profiles_1.avatar_url does not exist"}`
- Отзывы не загружались совсем — вся секция была пустой

---

## Причина (Root Cause)

### Несоответствие схемы БД и frontend-запроса

**Файл:** `stores/publicStore/reviewsStore.ts`

```typescript
const REVIEW_SELECT = '..., profiles!product_reviews_profile_id_fkey(first_name, last_name, avatar_url), ...'
```

`reviewsStore` запрашивал `avatar_url` через PostgREST JOIN к таблице `public.profiles`, но этой колонки в таблице не существовало.

### Почему колонка отсутствовала

| Миграция | Описание | Результат |
|----------|----------|-----------|
| `20250804104226__initialize_project.sql` | Создаёт `profiles` с `first_name, last_name, phone, role, ...` | Без `avatar_url` |
| `20260203054051_master_schema_consolidation.sql` | `CREATE TABLE IF NOT EXISTS profiles (...avatar_url TEXT...)` | **Игнорируется** — таблица уже существует |
| `20260227000001_fix_google_oauth_profile_creation.sql` | Пересоздаёт `handle_new_user()`, но не добавляет `avatar_url` в INSERT | `avatar_url` не сохраняется при регистрации |

`CREATE TABLE IF NOT EXISTS` **не добавляет новые колонки в существующую таблицу** — это DDL-ловушка. Нужен явный `ALTER TABLE ... ADD COLUMN`.

---

## Что было исправлено (Вариант А — добавление в БД)

Поскольку `ReviewCard.vue` уже рендерит аватарки (`review.profiles?.avatar_url`), выбран Вариант А — полноценная поддержка аватарок.

### Новая миграция: `20260301000001_add_avatar_url_to_profiles.sql`

#### Шаг 1 — Добавление колонки
```sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

#### Шаг 2 — Обновление `handle_new_user()`
Google OAuth передаёт URL аватарки в `raw_user_meta_data` как `avatar_url` или `picture`:
```sql
v_avatar_url := COALESCE(
  NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
  NULLIF(TRIM(NEW.raw_user_meta_data->>'picture'),    '')
);
```
При регистрации через Google — аватарка сразу сохраняется в `profiles`.

`ON CONFLICT (id) DO UPDATE SET avatar_url = ...` — обновляет аватарку при повторном входе, если она изменилась.

#### Шаг 3 — Обновление `ensure_profile_exists()` (client-side fallback)
Та же логика извлечения `avatar_url` из `raw_user_meta_data` + дополнительная проверка: если профиль уже есть, но `avatar_url IS NULL` — пробует заполнить из `auth.users`.

#### Шаг 4 — Бэкфилл существующих пользователей
```sql
UPDATE public.profiles p
SET avatar_url = COALESCE(
  NULLIF(TRIM(u.raw_user_meta_data->>'avatar_url'), ''),
  NULLIF(TRIM(u.raw_user_meta_data->>'picture'),    '')
)
FROM auth.users u
WHERE p.id = u.id AND p.avatar_url IS NULL AND ...
```
Заполняет `avatar_url` для всех уже существующих пользователей без потери данных.

#### Шаг 5 — Перезагрузка схемы PostgREST
```sql
NOTIFY pgrst, 'reload schema';
```

### Обновление TypeScript-типов: `types/supabase.ts`

Добавлен `avatar_url: string | null` в `Row`, `Insert`, `Update` секции таблицы `profiles`. Вручную — поскольку генерация типов требует подключения к Supabase.

```typescript
// profiles.Row (было):
active_bonus_balance: number
created_at: string
first_name: string | null
...

// profiles.Row (стало):
active_bonus_balance: number
avatar_url: string | null   // ← добавлено
created_at: string
first_name: string | null
...
```

---

## Что НЕ менялось

- `stores/publicStore/reviewsStore.ts` — `REVIEW_SELECT` корректен, изменений не требует
- `components/product/ReviewCard.vue` — рендеринг `review.profiles?.avatar_url` корректен, изменений не требует

---

## Критерии приёмки

| # | Сценарий | Ожидаемое поведение |
|---|----------|---------------------|
| 1 | Открытие страницы товара с отзывами | Отзывы загружаются без ошибки 42703 |
| 2 | Авторизация через Google | Аватарка из Google-аккаунта сохраняется в `profiles.avatar_url` |
| 3 | Отзыв от Google-пользователя | Рядом с отзывом отображается круглая аватарка из Google |
| 4 | Отзыв от пользователя без аватарки | Отображается иконка-заглушка (`lucide:user`) |
| 5 | Существующие пользователи | После применения миграции их аватарки заполняются автоматически |

---

## Деплой-чеклист

- [ ] Применить миграцию в Supabase: `supabase db push` или через Dashboard → SQL Editor
- [ ] Проверить, что `NOTIFY pgrst, 'reload schema'` отработал (или перезапустить PostgREST)
- [ ] Опционально: регенерировать типы `supabase gen types typescript --local > types/supabase.ts`

---

## Изменённые файлы

| Файл | Тип изменения |
|------|---------------|
| `supabase/migrations/20260301000001_add_avatar_url_to_profiles.sql` | Новая миграция: ADD COLUMN, обновление триггеров, бэкфилл |
| `types/supabase.ts` | Добавлен `avatar_url: string \| null` в profiles Row/Insert/Update |

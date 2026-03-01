# Отчёт по исправлениям и доработкам — Сессия 2026-03-01

**Проект:** Uhti Commerce (uhti.kz)
**Дата сессии:** 2026-03-01
**Статус:** Все задачи выполнены

---

## Сводная таблица

| # | Тип | Задача | Затронутые файлы | Статус |
|---|-----|--------|-----------------|--------|
| 1 | Bugfix | Wishlist: Optimistic UI + Login Modal | `wishlistStore.ts`, `WishlistButton.vue` | ✅ |
| 2 | Bugfix | Wishlist: Глобальная инициализация + ошибка 23505 | `wishlistStore.ts`, `app.vue` | ✅ |
| 3 | Bugfix | Отзывы: ошибка 42703 — `avatar_url` не существует | миграция, `types/supabase.ts` | ✅ |
| 4 | Feature | Google OAuth: умный парсинг `first_name` / `last_name` | миграция | ✅ |
| 5 | Bugfix | SEO FAQ: "0 товаров" и форматирование цен в фильтре | миграция, 3 компонента | ✅ |

---

## 1. Wishlist — Optimistic UI + Login Modal

**Тип:** Bugfix
**Документ:** `DOCS_WISHLIST_REACTIVITY_FIX.md`

### Симптомы
- Сердечко на карточке товара не закрашивалось при клике — UI реагировал только после посещения `/profile/wishlist`
- Гость при клике видел `toast` вместо модального окна входа

### Root Cause
`toggleWishlist` не обновлял локальный стейт немедленно. После запроса к БД вызывался `fetchWishlistProducts()` — второй сетевой round-trip. Итого: 2 запроса до первого обновления UI.

### Исправление
| Файл | Изменение |
|------|-----------|
| `stores/publicStore/wishlistStore.ts` | Optimistic update: `wishlistProductIds` меняется **до** запроса к БД. Rollback при ошибке. Удалён вызов `fetchWishlistProducts()` после toggle |
| `components/product/WishlistButton.vue` | `toast.info()` → `modalStore.openLoginModal()` для неавторизованных |

---

## 2. Wishlist — Глобальная инициализация + ошибка 23505

**Тип:** Bugfix
**Документ:** `DOCS_WISHLIST_REACTIVITY_FIX.md` (обновлено)

### Симптомы
- При первом заходе в каталог сердечки не закрашены даже у авторизованного пользователя
- Клик на «пустое» сердечко уже добавленного товара → `23505 duplicate key value violates unique constraint "wishlist_pkey"`

### Root Cause
`wishlistProductIds` заполнялся только при явном вызове `fetchWishlistProducts()` со страницы. Глобального watcher'а не было. При пустом массиве `toggleWishlist` не знал, что товар уже в избранном, и делал повторный INSERT.

### Исправление
| Файл | Изменение |
|------|-----------|
| `stores/publicStore/wishlistStore.ts` | Добавлен `fetchWishlistIds()` — лёгкий запрос только ID без загрузки полных данных товаров. В `toggleWishlist`: `if (error && error.code !== '23505') throw error` |
| `app.vue` | `watch(useSupabaseUser(), ..., { immediate: true })` — загружает IDs при логине, очищает при выходе |

---

## 3. Отзывы — ошибка 42703 (`avatar_url` не существует)

**Тип:** Bugfix
**Документ:** `DOCS_AVATAR_URL_42703_FIX.md`

### Симптомы
- Страница товара с отзывами возвращала HTTP 400/500
- `{"code": "42703", "message": "column profiles_1.avatar_url does not exist"}`
- Секция отзывов полностью не загружалась

### Root Cause
`reviewsStore.ts` запрашивал `profiles(first_name, last_name, avatar_url)` через PostgREST JOIN, но колонки `avatar_url` в таблице `profiles` не существовало. **DDL-ловушка:** миграция использовала `CREATE TABLE IF NOT EXISTS` (которая игнорируется для существующей таблицы) вместо `ALTER TABLE ... ADD COLUMN`.

### Исправление
| Файл | Изменение |
|------|-----------|
| `20260301000001_add_avatar_url_to_profiles.sql` | `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT`; обновлён `handle_new_user()` — сохраняет `avatar_url`/`picture` из Google OAuth; бэкфилл существующих пользователей; `NOTIFY pgrst, 'reload schema'` |
| `types/supabase.ts` | `avatar_url: string \| null` добавлен в profiles `Row`, `Insert`, `Update` |

---

## 4. Google OAuth — умный парсинг имени и фамилии

**Тип:** Feature
**Документ:** `DOCS_GOOGLE_OAUTH_NAME_PARSING.md`

### Проблема
Google передаёт имя одной строкой `full_name = "Иван Иванов"`. Старый триггер записывал всю строку в `first_name` → в шапке отображалось "Привет, Иван Иванов!" вместо "Привет, Иван!". Поля профиля не заполнялись автоматически.

### Логика разбивки имени (приоритет)
```
explicit first_name → split(full_name / name, ' ', первый пробел) → email_prefix → 'Гость'
```

`substring(str FROM pos+1)` вместо `split_part(..., 2)` — корректно обрабатывает двойные фамилии ("Иванова-Петрова", "Де ла Круз").

### Исправление
| Файл | Изменение |
|------|-----------|
| `20260301000002_smart_name_parsing_from_oauth.sql` | Пересозданы `handle_new_user()` и `ensure_profile_exists()` с умным split по первому пробелу; бэкфилл для профилей с `first_name = 'Гость'` или пустыми именами |

---

## 5. SEO FAQ + Фильтр цен

**Тип:** Bugfix (2 независимые проблемы)
**Документ:** `DOCS_FAQ_PRICE_FIX.md`

### 5a. FAQ "В категории представлено 0 товаров"

**Симптом:** В Schema.org разметке `FAQPage` выводился stale текст "0 игрушек от 0 брендов", который индексировался поисковиками.

**Root Cause:** Функция `generate_category_questions()` бакала `v_products_count` прямо в строку `answer_text` при генерации FAQ. Если функция вызывалась до публикации товаров — число "0" навсегда оседало в БД.

**Исправление:**

| Файл | Изменение |
|------|-----------|
| `20260301000003_fix_faq_static_product_count.sql` | Пересоздана `generate_category_questions()`: Вопрос 1 использует **статичный** SEO-текст без счётчика. UPDATE всех существующих строк с паттерном `\d+ игрушек от` |

**Новый текст:**
> "В данной категории представлен широкий ассортимент товаров. Воспользуйтесь удобными фильтрами по цене и характеристикам, чтобы подобрать идеальный вариант."

### 5b. Фильтр цен: float + неправильная локаль

**Симптомы:** `9561.3 ₸` вместо `9 562 ₸`, разделитель тысяч `9,561` вместо `9 561`.

**Root Cause:** PostgreSQL `NUMERIC` → JS float без округления. `.toLocaleString()` без явной локали даёт `en-US` формат на серверах.

**Исправление:**

| Файл | Изменение |
|------|-----------|
| `pages/catalog/[...slug].vue` | `Math.floor(Number(...))` / `Math.ceil(Number(...))` для priceMin/priceMax |
| `components/global/DynamicFilters.vue` | `Intl.NumberFormat('ru-RU').format()` вместо `.toLocaleString()` |
| `components/global/DynamicFiltersMobile.vue` | Аналогично desktop-версии |

---

## Все изменённые файлы сессии

### TypeScript / Vue

| Файл | Изменения |
|------|-----------|
| `stores/publicStore/wishlistStore.ts` | Optimistic update, rollback, `fetchWishlistIds()`, игнор 23505 |
| `components/product/WishlistButton.vue` | `openLoginModal()` вместо `toast.info()` |
| `app.vue` | Глобальный watcher wishlist IDs |
| `types/supabase.ts` | `avatar_url` в profiles Row/Insert/Update |
| `pages/catalog/[...slug].vue` | `Math.floor`/`Math.ceil` для priceRange |
| `components/global/DynamicFilters.vue` | `Intl.NumberFormat('ru-RU')` |
| `components/global/DynamicFiltersMobile.vue` | `Intl.NumberFormat('ru-RU')` |

### SQL Миграции

| Файл | Содержание |
|------|-----------|
| `20260301000001_add_avatar_url_to_profiles.sql` | ADD COLUMN avatar_url, обновление триггеров, бэкфилл |
| `20260301000002_smart_name_parsing_from_oauth.sql` | Умный split full_name в триггерах, бэкфилл 'Гость' профилей |
| `20260301000003_fix_faq_static_product_count.sql` | Статичный FAQ текст, UPDATE stale строк в БД |

---

## Деплой-чеклист (production)

```bash
# 1. Применить все три новые миграции
supabase db push

# 2. Проверить что FAQ исправлен
# SELECT count(*) FROM category_questions WHERE answer_text ~ '\d+ игрушек от';
# → должно вернуть 0

# 3. Проверить avatar_url
# SELECT count(*) FROM profiles WHERE avatar_url IS NOT NULL;
# → должны появиться строки для Google-пользователей

# 4. Опционально — регенерировать типы
supabase gen types typescript --local > types/supabase.ts
```

---

## Метрики сессии

| Метрика | Значение |
|---------|---------|
| Закрыто багов | 6 |
| Реализовано фич | 1 |
| Изменено TS/Vue файлов | 7 |
| Создано SQL миграций | 3 |
| Создано документов | 5 |
| Строк кода изменено | ~120 |
| Строк SQL написано | ~300 |

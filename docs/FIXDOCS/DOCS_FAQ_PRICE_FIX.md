# FIX: SEO FAQ (0 товаров) и форматирование цен в фильтре

**Дата:** 2026-03-01
**Статус:** Исправлено

---

## Проблемы

### Проблема 1 — FAQ Schema.org: "В категории представлено 0 товаров"

На страницах категорий в Schema.org разметке (`FAQPage`) появлялся текст "В категории представлено 0 игрушек от 0 брендов." Это попадало в поисковые системы и портило SEO.

### Проблема 2 — Фильтр цен: дробные числа и некорректная локаль

- Слайдер цен отображал `9561.3 ₸` вместо `9 562 ₸`
- Разделитель тысяч использовал `en-US` формат (`9,561`) вместо `ru-RU` (`9 561`)
- Компонент `Slider` получал float вместо integer, что могло вызывать сдвиги бегунка

---

## Причины (Root Cause)

### FAQ — stale count в БД

Функция `generate_category_questions()` вычисляла `v_products_count` в момент вызова и бакала число прямо в строку `answer_text`:

```sql
-- Старый код (проблема):
'В категории "' || v_category_name || '" представлено ' || v_products_count || ' игрушек от ведущих производителей.'
```

Текст записывается в колонку `category_questions.answer_text` и **не обновляется** при изменении каталога. Если функция вызывалась до публикации товаров, в БД навсегда оставалось "0 игрушек".

### Цены — float из PostgreSQL

Поле `price` в PostgreSQL имеет тип `NUMERIC`. `supabase-js` возвращает его как JavaScript `number`, но RPC функции могут вернуть строку или float. В `pages/catalog/[...slug].vue`:

```typescript
// Было (без округления):
const priceMin = priceRangeData.min_price  // → 9561.3
const priceMax = priceRangeData.max_price  // → 49999.7
priceRange.value = { min: priceMin, max: priceMax }
```

### Цены — системная локаль в `.toLocaleString()`

```typescript
// Было — локаль зависит от окружения (может быть en-US):
{{ Math.round(localPrice[0]).toLocaleString() }} ₸
// Результат: "9,561 ₸" (en-US)
```

---

## Что было исправлено

### 1. `pages/catalog/[...slug].vue` — округление прайс-рейнджа

```typescript
// Стало:
const priceMin = Math.floor(Number(priceRangeData.min_price))
const priceMax = Math.ceil(Number(priceRangeData.max_price))
priceRange.value = { min: priceMin, max: priceMax }
```

- `Math.floor` для минимума → слайдер начинается не выше реального минимума
- `Math.ceil` для максимума → слайдер покрывает весь реальный диапазон
- `Number()` обёртка — защита от строки вместо числа из RPC

### 2. `components/global/DynamicFilters.vue` — явная локаль `ru-RU`

```typescript
// Было:
{{ Math.round(localPrice[0]).toLocaleString() }} ₸

// Стало:
{{ new Intl.NumberFormat('ru-RU').format(Math.round(localPrice[0])) }} ₸
```

Аналогично для `localPrice[1]`. `ru-RU` гарантирует пробел как разделитель тысяч на любом сервере/клиенте.

### 3. `components/global/DynamicFiltersMobile.vue` — та же правка

Идентичное исправление в мобильном компоненте фильтров.

### 4. SQL миграция: `20260301000003_fix_faq_static_product_count.sql`

#### Шаг 1 — Пересоздание `generate_category_questions()`

Вопрос 1 теперь использует **статичный SEO-текст**:

```sql
-- Было:
'В категории "' || v_category_name || '" представлено ' || v_products_count || ' игрушек'

-- Стало (с описанием категории):
v_category_description || ' В данной категории представлен широкий ассортимент товаров. '
  || 'Воспользуйтесь удобными фильтрами по цене и характеристикам, '
  || 'чтобы подобрать идеальный вариант.'

-- Стало (без описания):
'В категории "' || v_category_name || '" представлен широкий ассортимент товаров. '
  || 'Воспользуйтесь удобными фильтрами по цене и характеристикам, '
  || 'чтобы подобрать идеальный вариант.'
```

Счётчики брендов в Вопросе 2 и цены в Вопросе 3 **оставлены** — они актуальны и SEO-полезны.

#### Шаг 2 — UPDATE существующих строк

```sql
UPDATE public.category_questions cq
SET answer_text = -- статичный текст
FROM public.categories c
WHERE cq.category_id = c.id
  AND cq.is_auto_generated = true
  AND (
    cq.answer_text ~ '\d+ игрушек от'
    OR cq.answer_text ~ 'представлено \d+ игрушек'
    OR cq.answer_text ~ 'представлено 0 игрушек'
  );
```

Паттерны регулярных выражений отлавливают все три варианта старого текста (с `0`, со стальными числами, со счётчиком брендов).

---

## Критерии приёмки

| # | Сценарий | Ожидаемое поведение |
|---|----------|---------------------|
| 1 | Страница категории → Schema.org source | FAQ-ответ не содержит числа товаров, только статичный текст |
| 2 | Слайдер цен при загрузке страницы | Показывает целые числа: `9 000 ₸ — 50 000 ₸` |
| 3 | Перемещение бегунка слайдера | Показывает `9 561 ₸` (пробел, не запятая) |
| 4 | Мобильный фильтр | То же форматирование |
| 5 | Slider не "прыгает" при инициализации | min/max — целые числа, step=100 делит их без остатка |

---

## Деплой-чеклист

- [ ] Применить миграцию: `supabase db push`
- [ ] Проверить UPDATE: `SELECT count(*) FROM category_questions WHERE answer_text ~ '\d+ игрушек от'` — должен вернуть 0

---

## Изменённые файлы

| Файл | Тип изменения |
|------|---------------|
| `pages/catalog/[...slug].vue` | `Math.floor`/`Math.ceil` + `Number()` для priceMin/priceMax |
| `components/global/DynamicFilters.vue` | `Intl.NumberFormat('ru-RU')` вместо `.toLocaleString()` |
| `components/global/DynamicFiltersMobile.vue` | `Intl.NumberFormat('ru-RU')` вместо `.toLocaleString()` |
| `supabase/migrations/20260301000003_fix_faq_static_product_count.sql` | Новая миграция: статичный текст в FAQ, UPDATE существующих строк |

# Аудит системы ценообразования - 2026-04-03

## 🐛 Обнаруженная проблема

**Симптом:** На странице каталога товар с скидкой показывает одинаковую цену дважды:

```
Mattel Hot Wheels Track Builder HNN38
36 990 ₸  (перечеркнуто)
36 990 ₸  (основная цена)
```

**Ожидалось:**

```
Mattel Hot Wheels Track Builder HNN38
36 990 ₸  (перечеркнуто - оригинальная цена)
25 890 ₸  (основная цена - цена со скидкой 30%)
```

---

## 🔍 Причина проблемы

### Архитектура ценообразования (как должно быть)

Согласно документации `/docs/PSYCHOLOGICAL_PRICE_ROUNDING.md`, система использует **единый источник правды** для цен:

1. **База данных (PostgreSQL):**
   - Колонка `products.price` - оригинальная цена
   - Колонка `products.discount_percentage` - процент скидки
   - **Generated column** `products.final_price` - автоматически рассчитывается с психологическим округлением

2. **Frontend:**
   - Должен просто отображать `final_price` из базы
   - Никаких расчетов на фронте

### Что пошло не так

**Проблема:** RPC функция `get_filtered_products()` не возвращала поле `final_price`

**Файл:** `supabase/migrations/20260402000001_add_rating_to_get_filtered_products.sql`

**RETURNS TABLE содержал:**

```sql
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC,
    category_id UUID, bonus_points_award INT, stock_quantity INT,
    -- ... другие поля ...
    discount_percentage NUMERIC,
    -- ❌ ОТСУТСТВУЕТ: final_price NUMERIC
    avg_rating NUMERIC,
    review_count INT,
    product_images JSON,
    brand_name TEXT,
    brand_slug TEXT
)
```

**SELECT запрос содержал:**

```sql
SELECT
    p.id, p.name, p.slug, p.description, p.price, p.category_id,
    p.bonus_points_award, p.stock_quantity,
    -- ... другие поля ...
    p.discount_percentage, p.created_at, p.updated_at,
    -- ❌ ОТСУТСТВУЕТ: p.final_price
    p.avg_rating,
    p.review_count,
    b.name AS brand_name,
    b.slug AS brand_slug
FROM public.products p
```

**Результат:** Frontend получал только `price` и `discount_percentage`, но не получал готовую `final_price` из базы.

---

## ✅ Решение

### 1. Откат костыля на фронте

**Файл:** `components/global/ProductCard.vue`

**Было (костыль):**

```typescript
const finalPrice = props.product.final_price
  ? Number(props.product.final_price)
  : Math.round(originalPrice * (1 - discountPercent / 100)); // ❌ Расчет на фронте
```

**Стало (правильно):**

```typescript
const finalPrice = props.product.final_price
  ? Number(props.product.final_price)
  : originalPrice; // ✅ Просто берем из базы
```

### 2. Добавление `final_price` в RPC функцию

**Файл:** `supabase/migrations/20260403120012_fix_catalog_prices_add_final_price.sql`

**Изменения:**

1. **RETURNS TABLE:**

```sql
RETURNS TABLE (
    -- ... существующие поля ...
    discount_percentage NUMERIC,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    -- ✅ ДОБАВЛЕНО: final_price
    final_price NUMERIC,
    avg_rating NUMERIC,
    review_count INT,
    -- ... остальные поля ...
)
```

2. **SELECT в CTE:**

```sql
SELECT
    p.id, p.name, p.slug, p.description, p.price,
    -- ... другие поля ...
    p.discount_percentage, p.created_at, p.updated_at,
    -- ✅ ДОБАВЛЕНО: final_price (generated column)
    p.final_price,
    p.avg_rating,
    p.review_count,
    b.name AS brand_name,
    b.slug AS brand_slug
FROM public.products p
```

3. **Финальный SELECT:**

```sql
SELECT
    fp.id, fp.name, fp.slug, fp.description, fp.price,
    -- ... другие поля ...
    fp.discount_percentage, fp.created_at, fp.updated_at,
    -- ✅ ДОБАВЛЕНО: final_price
    fp.final_price,
    fp.avg_rating,
    fp.review_count,
    -- ... остальные поля ...
FROM filtered_products fp
```

---

## 📊 Проверка работы системы

### Шаг 1: Применить миграцию

```bash
# Локально (если Docker запущен)
supabase db reset

# На production
# Применить через Supabase Studio → SQL Editor
# Скопировать содержимое файла:
# supabase/migrations/20260403104700_add_final_price_to_get_filtered_products.sql
```

### Шаг 2: Проверить данные в базе

```sql
-- Проверить, что final_price рассчитывается правильно
SELECT
  name,
  price as original_price,
  discount_percentage,
  final_price,
  (price - final_price) as discount_amount
FROM products
WHERE discount_percentage > 0
  AND is_active = true
ORDER BY price DESC
LIMIT 10;
```

**Ожидаемый результат для Hot Wheels (цена 36 990 ₸, скидка 30%):**

```
name                          | original_price | discount_percentage | final_price | discount_amount
------------------------------|----------------|---------------------|-------------|----------------
Hot Wheels Track Builder...   | 36990          | 30                  | 25890       | 11100
```

### Шаг 3: Проверить RPC функцию

```sql
-- Проверить, что RPC возвращает final_price
SELECT
  name,
  price,
  discount_percentage,
  final_price
FROM get_filtered_products(
  p_category_slug := 'all',
  p_page_number := 1,
  p_page_size := 5
)
WHERE discount_percentage > 0;
```

### Шаг 4: Проверить на сайте

1. Открыть страницу каталога с товарами со скидкой
2. Убедиться, что перечеркнутая цена ≠ основная цена
3. Проверить, что цена со скидкой заканчивается на **90** (психологическое округление)

---

## 🎯 Выводы и рекомендации

### Что было сделано правильно

✅ **Единый источник правды в базе данных**

- Generated column `final_price` автоматически пересчитывается при изменении `price` или `discount_percentage`
- Психологическое округление применяется на уровне базы данных
- Бонусы рассчитываются от округленной цены

✅ **Документация**

- Подробная документация в `/docs/PSYCHOLOGICAL_PRICE_ROUNDING.md`
- Миграция с комментариями и примерами

### Что пошло не так

❌ **Забыли добавить `final_price` в RPC функцию**

- При добавлении новых полей (`avg_rating`, `review_count`) забыли про `final_price`
- Это привело к тому, что фронт не получал готовую цену со скидкой

❌ **Попытка исправить на фронте (костыль)**

- Вместо исправления RPC функции, была попытка рассчитать цену на фронте
- Это нарушает принцип единого источника правды

### Рекомендации на будущее

1. **Чеклист при изменении RPC функций:**
   - [ ] Все generated columns включены в SELECT?
   - [ ] Все поля из RETURNS TABLE присутствуют в SELECT?
   - [ ] Тесты обновлены?

2. **Автоматизация:**
   - Создать SQL тест, который проверяет, что все поля из `products` возвращаются в RPC
   - Добавить TypeScript типы, которые автоматически генерируются из схемы базы

3. **Code Review:**
   - При изменении RPC функций обязательно проверять, что все критичные поля включены
   - Особое внимание на generated columns (`final_price`, `avg_rating`, etc.)

---

## 📚 Связанные файлы

- `/docs/PSYCHOLOGICAL_PRICE_ROUNDING.md` - Документация по психологическому округлению
- `/supabase/migrations/20260331102800_add_psychological_price_rounding.sql` - Создание `final_price`
- `/supabase/migrations/20260403104700_add_final_price_to_get_filtered_products.sql` - Исправление RPC
- `/components/global/ProductCard.vue` - Компонент карточки товара
- `/utils/bonusCalculator.ts` - Утилиты для расчета цен (используются только в админке)

---

**Дата аудита:** 2026-04-03  
**Статус:** ✅ Исправлено  
**Автор:** Uhti Commerce Team

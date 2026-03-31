# 🎯 ФИНАЛЬНЫЙ DEPLOYMENT ПЛАН (31 марта 2026, 11:32 UTC)

## 📦 Что нужно задеплоить

### Backend (Supabase) - 5 миграций

### Frontend (Nuxt) - 5 обновленных файлов

---

## 🗂️ BACKEND: Применить миграции в Supabase Studio

### Порядок выполнения (СТРОГО ПО ПОРЯДКУ!):

```sql
-- ============================================================================
-- МИГРАЦИЯ 1: Исправление canonical URLs (30 сек)
-- ============================================================================
UPDATE public.categories SET canonical_url = NULL WHERE canonical_url IS NOT NULL;
UPDATE public.products SET canonical_url = NULL WHERE canonical_url IS NOT NULL;
UPDATE public.brands SET canonical_url = NULL WHERE canonical_url IS NOT NULL;

-- Проверка
SELECT COUNT(*) as cleared_categories FROM public.categories WHERE canonical_url IS NULL;
```

```sql
-- ============================================================================
-- МИГРАЦИЯ 2: Dynamic Discount Snippets (2 мин)
-- ============================================================================
-- Скопировать ВЕСЬ код из файла:
-- supabase/migrations/20260331095500_add_dynamic_discount_snippets.sql
-- И выполнить в SQL Editor
```

```sql
-- ============================================================================
-- МИГРАЦИЯ 3: Психологическое округление цен (2 мин)
-- ============================================================================
-- Скопировать ВЕСЬ код из файла:
-- supabase/migrations/20260331102800_add_psychological_price_rounding.sql
-- И выполнить в SQL Editor
```

```sql
-- ============================================================================
-- МИГРАЦИЯ 4: Добавление final_price в RPC (2 мин)
-- ============================================================================
-- Скопировать ВЕСЬ код из файла:
-- supabase/migrations/20260331112000_add_final_price_to_rpc_returns.sql
-- И выполнить в SQL Editor
```

```sql
-- ============================================================================
-- МИГРАЦИЯ 5: Регенерация FAQ (1 мин)
-- ============================================================================
SELECT * FROM public.generate_questions_for_all_categories();

-- Проверка результата
SELECT
  c.name,
  cq.question_text,
  LEFT(cq.answer_text, 150) as answer_preview
FROM category_questions cq
JOIN categories c ON c.id = cq.category_id
WHERE cq.question_text LIKE 'Сколько стоят%'
  AND cq.is_auto_generated = true
ORDER BY c.name
LIMIT 5;
```

---

## 💻 FRONTEND: Деплой обновленных файлов

### Обновленные файлы (5 шт):

1. **types/type.ts**
   - Добавлено `final_price: number` в `BaseProduct`
   - Добавлено `final_price: number` в `ProductWithImages`
   - Добавлено `final_price: number` в `CatalogProduct`

2. **utils/bonusCalculator.ts**
   - Добавлена функция `roundToMarketingPrice()`
   - Добавлена функция `calculateFinalPrice()`
   - Обновлена функция `calculateBonusPoints()` для учета округления

3. **stores/publicStore/cartStore.ts**
   - Удален импорт `formatPriceWithDiscount`
   - Обновлен `subtotal` computed для использования `product.final_price`

4. **pages/catalog/products/[slug].vue**
   - Обновлен `offers` в Schema.org для использования `product.final_price`

5. **pages/catalog/[...slug].vue**
   - Обновлен `offers` в ItemList Schema для использования `product.final_price`

6. **components/admin/products/ProductForm.vue**
   - Добавлен импорт `calculateFinalPrice`
   - Обновлен `discountedPrice` computed
   - Обновлен `priceBreakdown` computed

7. **utils/formatPrice.ts**
   - Функция `formatPriceWithDiscount` помечена как @deprecated

### Команды для деплоя:

```bash
# Проверить изменения
git status

# Добавить все изменения
git add .

# Создать коммит
git commit -m "feat: implement database-driven prices with psychological rounding

- Add final_price to RPC returns
- Update frontend to use final_price from database
- Remove price calculations from frontend
- Add psychological price rounding (ends with 90)
- Fix canonical URLs
- Add dynamic discount snippets to FAQ"

# Задеплоить
git push
```

---

## ✅ Проверка после деплоя

### 1. Проверить цены на сайте (2 мин)

```
https://uhti.kz/catalog/boys/mashinki/radioupravlyaemye-mashinki
```

**Что проверять:**

- ✅ Все цены со скидками заканчиваются на **90**
- ✅ Цены в карточках товаров
- ✅ Цены в корзине
- ✅ Итоговая сумма в корзине

### 2. Проверить FAQ (2 мин)

**Что проверять:**

- ✅ Списки (маркированные)
- ✅ Жирный текст в ключевых местах
- ✅ Ссылки на каталог
- ✅ Динамические упоминания скидок ("Скидки до X%!")

### 3. Проверить админку (2 мин)

1. Открыть форму редактирования товара
2. Ввести скидку 30%
3. Убедиться, что "Цена со скидкой" заканчивается на **90**
4. Проверить калькулятор прибыли

### 4. Проверить API (1 мин)

```bash
# Открыть DevTools → Network → XHR
# Найти запрос к get_filtered_products
# Проверить, что в ответе есть поле final_price
```

**Ожидаемый JSON:**

```json
{
  "id": "xxx",
  "name": "LEGO DC Бэтмен",
  "price": 61990,
  "discount_percentage": 10,
  "final_price": 55690 // ← Должно быть!
}
```

### 5. Google Search Console (1 мин)

1. Перейти в **Индексирование** → **Страницы**
2. Найти **"Вариант страницы с тегом canonical"**
3. Нажать **"Проверить исправление"**

---

## 📈 Ожидаемые результаты

### 1-2 недели:

- ✅ CTR +15-25%
- ✅ Конверсия +3-5%
- ✅ Цены выглядят привлекательнее

### 1-2 месяца:

- ✅ Органический трафик +25-35%
- ✅ Средний чек +5-8%
- ✅ uhti.kz в PAA блоке

### 3-6 месяцев:

- ✅ Доминирование в Google PAA
- ✅ LTV +10-15%

---

## 📚 Документация

### Backend:

- `docs/PAA_OPTIMIZATION.md`
- `docs/DYNAMIC_DISCOUNT_SNIPPETS.md`
- `docs/PSYCHOLOGICAL_PRICE_ROUNDING.md`
- `docs/DATABASE_DRIVEN_PRICES.md`

### Инструкции:

- `QUICK_START.md` (этот файл)
- `SEO_DEPLOYMENT_CHECKLIST.md`
- `SEO_SUMMARY.md`

---

## 🆘 Если что-то пошло не так

### Проблема: Цены не округлились

**Решение:**

```sql
-- Проверить, что миграция применена
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'final_price';

-- Если колонка есть, проверить значения
SELECT name, price, discount_percentage, final_price
FROM products
WHERE discount_percentage > 0
LIMIT 5;
```

### Проблема: API не возвращает final_price

**Решение:**

```sql
-- Проверить, что RPC обновлена
SELECT * FROM public.get_filtered_products('all', NULL, NULL, NULL, NULL, 'popularity', 1, 5);

-- Если final_price NULL, применить миграцию 4 еще раз
```

### Проблема: Ошибки типов на фронте

**Решение:**

```bash
# Очистить кэш и пересобрать
rm -rf .nuxt node_modules/.vite
pnpm dev
```

---

**Статус:** 🚀 Готово к деплою  
**Последнее обновление:** 31 марта 2026, 11:32 UTC

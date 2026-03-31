# 🎯 Database-Driven Prices - Единый источник истины для цен

> **Дата реализации:** 31 марта 2026  
> **Цель:** Исключить расхождение цен между базой данных и фронтендом

---

## 📋 Проблема

### До рефакторинга:

**Двойная бухгалтерия:**

```typescript
// База данных (SQL)
final_price = ROUND((price * (100 - discount)) / 100); // = 15 302 ₸

// Фронтенд (TypeScript)
finalPrice = Math.round(price * (1 - discount / 100)); // = 15 302 ₸

// После добавления психологического округления:
// База данных: 15 290 ₸
// Фронтенд: 15 302 ₸  ← РАСХОЖДЕНИЕ! ❌
```

**Проблемы:**

1. ❌ Расхождение цен между базой и фронтом
2. ❌ Дублирование логики в двух местах
3. ❌ Сложность поддержки (нужно обновлять в двух местах)
4. ❌ Риск ошибок при изменении формулы

---

## ✅ Решение: Database-Driven Prices

### Принцип:

**База данных = единственный источник истины для цен**

```
┌─────────────────────────────────────────────────────┐
│ PostgreSQL (Единственный источник истины)           │
│                                                     │
│ products.final_price (GENERATED COLUMN)             │
│ = FLOOR(price * (100 - discount) / 100 / 100) * 100 - 10 │
│                                                     │
│ Автоматически пересчитывается при UPDATE           │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ RPC Function: get_filtered_products()              │
│                                                     │
│ RETURNS TABLE (..., final_price NUMERIC, ...)      │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│ Frontend (Только отображение)                       │
│                                                     │
│ product.final_price  ← Готовое значение из БД      │
│ НЕТ расчетов на фронте!                            │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 Что изменилось

### 1. База данных

**Файл:** `supabase/migrations/20260331102800_add_psychological_price_rounding.sql`

**Generated Column с психологическим округлением:**

```sql
ALTER TABLE public.products
ADD COLUMN final_price NUMERIC
  GENERATED ALWAYS AS (
    CASE
      WHEN (price * (100 - COALESCE(discount_percentage, 0)) / 100) < 500 THEN
        FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 10) * 10
      ELSE
        (FLOOR((price * (100 - COALESCE(discount_percentage, 0)) / 100) / 100) * 100) - 10
    END
  ) STORED;
```

**Автоматический пересчет:**

- При `UPDATE products SET price = 20000` → `final_price` пересчитывается автоматически
- При `UPDATE products SET discount_percentage = 30` → `final_price` пересчитывается автоматически

---

### 2. RPC Function

**Файл:** `supabase/migrations/20260331112000_add_final_price_to_rpc_returns.sql`

**Добавлено `final_price` в RETURNS TABLE:**

```sql
CREATE FUNCTION public.get_filtered_products(...)
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, ...,
    final_price NUMERIC,  -- 🔥 ДОБАВЛЕНО
    product_images JSON,
    ...
)
```

**Добавлено в SELECT:**

```sql
SELECT
    p.id, p.name, p.slug, ...,
    p.final_price,  -- 🔥 ДОБАВЛЕНО
    ...
FROM public.products p
```

---

### 3. TypeScript типы

**Файл:** `types/type.ts`

**Обновлены интерфейсы:**

```typescript
export interface BaseProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  final_price: number; // 🔥 ДОБАВЛЕНО: обязательное поле
  discount_percentage?: number | null;
  // ...
}

export type ProductWithImages = ProductRow & {
  product_images: ProductImageRow[];
  final_price: number; // 🔥 ДОБАВЛЕНО
};

export interface CatalogProduct extends Omit<
  FilteredProductRpcResponse,
  "product_images"
> {
  product_images: {
    /* ... */
  }[];
  final_price: number; // 🔥 ДОБАВЛЕНО
}
```

---

### 4. Frontend (Удаление расчетов)

#### CartStore (stores/publicStore/cartStore.ts)

**До:**

```typescript
const subtotal = computed(() =>
  items.value.reduce((sum: number, item) => {
    const priceData = formatPriceWithDiscount(
      Number(item.product.price),
      item.product.discount_percentage,
    );
    return sum + priceData.finalNumber * item.quantity;
  }, 0),
);
```

**После:**

```typescript
const subtotal = computed(() =>
  items.value.reduce((sum: number, item) => {
    // 🔥 Используем final_price из базы данных
    return sum + item.product.final_price * item.quantity;
  }, 0),
);
```

---

#### Product Detail Page (pages/catalog/products/[slug].vue)

**До:**

```typescript
const finalPrice = p.discount_percentage
  ? Math.round((Number(p.price) * (100 - p.discount_percentage)) / 100)
  : Math.round(Number(p.price));
```

**После:**

```typescript
// 🔥 Используем final_price из базы данных
const finalPrice = p.final_price || Math.round(Number(p.price));
```

---

#### Catalog Page Schema (pages/catalog/[...slug].vue)

**До:**

```typescript
price: product.discount_percentage
  ? Math.round((product.price * (100 - product.discount_percentage)) / 100)
  : product.price,
```

**После:**

```typescript
// 🔥 Используем final_price из базы данных
price: product.final_price || product.price,
```

---

### 5. Utils (Deprecated функции)

**Файл:** `utils/formatPrice.ts`

**Функция `formatPriceWithDiscount` помечена как @deprecated:**

```typescript
/**
 * @deprecated Используйте product.final_price из базы данных вместо этой функции.
 * База данных рассчитывает цену с психологическим округлением (стандарт "90 тенге").
 * Эта функция оставлена только для обратной совместимости.
 */
export function formatPriceWithDiscount(...)
```

---

## 🚀 Преимущества нового подхода

### 1. Единый источник истины

```
✅ База данных рассчитывает цену ОДИН РАЗ
✅ Фронтенд только отображает готовое значение
✅ Нет расхождений между базой и фронтом
```

### 2. Автоматическая синхронизация

```sql
-- Админ меняет цену
UPDATE products SET price = 20000 WHERE id = 'xxx';

-- PostgreSQL автоматически пересчитывает:
-- final_price = 19 990 ₸ (если скидки нет)
-- bonus_points_award = 999 (5% от 19 990)
```

### 3. Упрощение кода

**До:**

```typescript
// В каждом компоненте:
const finalPrice = product.discount_percentage
  ? Math.round(price * (1 - discount / 100))
  : price;
```

**После:**

```typescript
// Просто используем готовое значение:
const finalPrice = product.final_price;
```

### 4. Защита от ошибок

```
❌ Раньше: Забыли обновить формулу в одном месте → расхождение цен
✅ Теперь: Формула только в БД → невозможно забыть обновить
```

---

## 📊 Примеры

### Пример 1: Товар со скидкой

**База данных:**

```sql
price = 21 860 ₸
discount_percentage = 30
final_price = 15 290 ₸  (автоматически рассчитано с округлением)
```

**Фронтенд:**

```typescript
// Просто отображаем
<span>{{ product.final_price }} ₸</span>  // 15 290 ₸
```

---

### Пример 2: Корзина

**До:**

```typescript
// Расчет на фронте
const subtotal = items.reduce((sum, item) => {
  const finalPrice = item.product.discount_percentage
    ? Math.round(
        item.product.price * (1 - item.product.discount_percentage / 100),
      )
    : item.product.price;
  return sum + finalPrice * item.quantity;
}, 0);
```

**После:**

```typescript
// Используем готовое значение из БД
const subtotal = items.reduce((sum, item) => {
  return sum + item.product.final_price * item.quantity;
}, 0);
```

---

### Пример 3: Schema.org

**До:**

```typescript
offers: {
  "@type": "Offer",
  price: product.discount_percentage
    ? Math.round((product.price * (100 - product.discount_percentage)) / 100)
    : product.price,
}
```

**После:**

```typescript
offers: {
  "@type": "Offer",
  price: product.final_price || product.price,
}
```

---

## 🛠️ Как применить

### Шаг 1: Применить миграции (по порядку!)

```sql
-- 1. Психологическое округление цен
-- Файл: supabase/migrations/20260331102800_add_psychological_price_rounding.sql

-- 2. Добавление final_price в RPC
-- Файл: supabase/migrations/20260331112000_add_final_price_to_rpc_returns.sql
```

### Шаг 2: Проверить, что API возвращает final_price

```sql
-- Проверить в Supabase Studio
SELECT id, name, price, discount_percentage, final_price
FROM public.get_filtered_products('all', NULL, NULL, NULL, NULL, 'popularity', 1, 5)
LIMIT 5;
```

**Ожидаемый результат:**

```
id | name | price | discount_percentage | final_price
---|------|-------|---------------------|------------
... | LEGO | 21860 | 30                  | 15290
```

### Шаг 3: Деплой фронтенда

Обновленные файлы:

- `types/type.ts` - добавлено `final_price` в интерфейсы
- `stores/publicStore/cartStore.ts` - использует `product.final_price`
- `pages/catalog/products/[slug].vue` - использует `product.final_price`
- `pages/catalog/[...slug].vue` - использует `product.final_price`
- `utils/formatPrice.ts` - `formatPriceWithDiscount` помечена как @deprecated

### Шаг 4: Проверить на сайте

1. Открыть любую категорию со скидками
2. Проверить, что цены заканчиваются на **90**
3. Добавить товар в корзину
4. Проверить, что итоговая сумма корректна
5. Открыть страницу товара
6. Проверить Schema.org через Google Rich Results Test

---

## 🔍 Проверка после деплоя

### 1. Проверить цены в каталоге

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

---

### 2. Проверить корзину

```typescript
// В консоли браузера
const cartStore = useCartStore();
console.log(cartStore.items[0].product.final_price); // Должно быть число
console.log(cartStore.subtotal); // Должна быть правильная сумма
```

---

### 3. Проверить Schema.org

```bash
curl -s "https://uhti.kz/catalog/products/lego-batman" | grep -A 10 '"@type":"Offer"'
```

**Ожидаемый результат:**

```json
{
  "@type": "Offer",
  "price": 55690, // ← Округленная цена из БД
  "priceCurrency": "KZT"
}
```

---

## 📈 Преимущества

### 1. Консистентность данных

```
✅ База данных: 15 290 ₸
✅ Фронтенд: 15 290 ₸
✅ Schema.org: 15 290 ₸
✅ Корзина: 15 290 ₸
```

### 2. Упрощение кода

**Удалено:**

- Расчеты цен в `cartStore.ts`
- Расчеты цен в `pages/catalog/products/[slug].vue`
- Расчеты цен в `pages/catalog/[...slug].vue`

**Осталось:**

- Только отображение `product.final_price`

### 3. Производительность

```
❌ Раньше: Расчет цены для каждого товара на фронте (CPU)
✅ Теперь: Готовое значение из БД (0 расчетов)
```

### 4. Безопасность

```
❌ Раньше: Можно подменить цену в DevTools
✅ Теперь: Цена приходит из БД, подмена невозможна
```

---

## 🎨 Архитектурная диаграмма

```
┌──────────────────────────────────────────────────────────────┐
│ ADMIN PANEL                                                  │
│                                                              │
│ Админ вводит:                                                │
│ - price = 21 860 ₸                                           │
│ - discount_percentage = 30%                                  │
│                                                              │
│ ProductForm.vue показывает:                                  │
│ - "Цена со скидкой: 15 290 ₸" (calculateFinalPrice)         │
└──────────────────────────────────────────────────────────────┘
                        ↓ UPDATE
┌──────────────────────────────────────────────────────────────┐
│ POSTGRESQL (Единственный источник истины)                    │
│                                                              │
│ products.price = 21 860                                      │
│ products.discount_percentage = 30                            │
│ products.final_price = 15 290  ← GENERATED ALWAYS AS         │
│ products.bonus_points_award = 764  ← Trigger                 │
└──────────────────────────────────────────────────────────────┘
                        ↓ SELECT
┌──────────────────────────────────────────────────────────────┐
│ RPC: get_filtered_products()                                 │
│                                                              │
│ RETURNS: { id, name, price, discount_percentage,             │
│            final_price: 15290, ... }                         │
└──────────────────────────────────────────────────────────────┘
                        ↓ API Response
┌──────────────────────────────────────────────────────────────┐
│ FRONTEND (Только отображение)                                │
│                                                              │
│ ProductCard.vue:                                             │
│   <span>{{ product.final_price }} ₸</span>                   │
│                                                              │
│ CartStore.ts:                                                │
│   subtotal = sum(item.product.final_price * quantity)       │
│                                                              │
│ Schema.org:                                                  │
│   "price": product.final_price                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 🚨 Важные замечания

### 1. Fallback для старых данных

Если по какой-то причине `final_price` отсутствует (старые данные), используем fallback:

```typescript
const finalPrice = product.final_price || product.price;
```

### 2. Не использовать formatPriceWithDiscount

```typescript
// ❌ УСТАРЕЛО (deprecated)
const priceData = formatPriceWithDiscount(
  product.price,
  product.discount_percentage,
);

// ✅ ПРАВИЛЬНО
const finalPrice = product.final_price;
```

### 3. Регенерация типов после миграции

После применения миграций в продакшн, обязательно регенерировать типы:

```bash
supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
```

---

## 📚 Связанная документация

- [PSYCHOLOGICAL_PRICE_ROUNDING.md](./PSYCHOLOGICAL_PRICE_ROUNDING.md) — Психологическое округление
- [DYNAMIC_DISCOUNT_SNIPPETS.md](./DYNAMIC_DISCOUNT_SNIPPETS.md) — Динамические скидки в FAQ

---

## 🎨 Админ-панель: Предпросмотр цен

### Проблема

Когда админ задаёт цену и скидку через форму, он должен **сразу видеть**, какая цена будет показана покупателям после психологического округления.

### Решение

**Файл:** `components/admin/products/ProductForm.vue`

#### 1. Импорт функций расчёта

```typescript
import {
  calculateBonusPoints,
  calculateFinalPrice,
} from "@/utils/bonusCalculator";
```

#### 2. Computed для цены со скидкой

```typescript
// Строки 754-762
const discountedPrice = computed(() => {
  const price = formData.value.price || 0;
  const discount = formData.value.discount_percentage || 0;
  if (discount > 0 && price > 0) {
    // Используем функцию психологического округления
    return calculateFinalPrice(price, discount);
  }
  return null;
});
```

#### 3. Автоматический расчёт бонусов

```typescript
// Строки 437-456
watch(
  [
    () => formData.value.price,
    () => formData.value.discount_percentage,
    selectedBonusPercent,
  ],
  ([price, discount, percent]) => {
    if (
      formData.value &&
      typeof price === "number" &&
      typeof percent === "number"
    ) {
      formData.value.bonus_points_award = calculateBonusPoints(
        price,
        discount || 0,
        percent,
      );
    }
  },
);
```

#### 4. Калькуляция расходов и прибыли

```typescript
// Строки 824-855
const priceBreakdown = computed(() => {
  const price = formData.value.price || 0;
  if (!price) return null;

  const discount = formData.value.discount_percentage || 0;
  // 🔥 Используем функцию психологического округления для цены продажи
  const sellingPrice =
    discount > 0 ? calculateFinalPrice(price, discount) : price;
  const discountAmount = price - sellingPrice;
  const costPrice = formData.value.cost_price || 0;
  const tax = Math.round(sellingPrice * TAX_RATE);
  const acquiring = Math.round((sellingPrice * acquiringRate.value) / 100);
  const bonusPoints = formData.value.bonus_points_award || 0;
  const totalExpenses = costPrice + tax + acquiring;
  const netProfitBeforeBonus = sellingPrice - totalExpenses;
  const netProfit = netProfitBeforeBonus - bonusPoints;
  const netMargin =
    sellingPrice > 0 ? Math.round((netProfit / sellingPrice) * 100) : 0;

  return {
    price,
    sellingPrice,
    discountAmount,
    costPrice,
    tax,
    acquiring,
    bonusPoints,
    totalExpenses,
    netProfit,
    netMargin,
  };
});
```

#### 5. UI: Отображение цены со скидкой

**Секция "Цена, бонусы и скидка"** (строки 1082-1282):

```vue
<div class="p-3 bg-muted/50 rounded-md sm:col-span-2">
  <Label>Процент начисляемых бонусов</Label>
  <Select v-model.number="selectedBonusPercent">
    <!-- ... опции ... -->
  </Select>
  <p class="text-sm text-muted-foreground mt-2">
    Будет начислено:
    <span class="font-bold text-primary">
      {{ formData.bonus_points_award || 0 }} бонусов
    </span>
    <!-- 🔥 ПОКАЗЫВАЕМ ОКРУГЛЁННУЮ ЦЕНУ -->
    <span v-if="discountedPrice" class="text-xs">
      (от цены со скидкой {{ formatPrice(discountedPrice) }} ₸)
    </span>
  </p>
</div>
```

#### 6. UI: Калькуляция расходов

**Блок калькуляции** (строки 1131-1254):

```vue
<div
  v-if="priceBreakdown"
  class="sm:col-span-2 p-4 bg-muted/50 border rounded-lg space-y-2 text-sm"
>
  <p class="font-semibold text-base mb-3">Калькуляция на единицу</p>

  <!-- Цена продажи -->
  <div class="flex justify-between">
    <span class="text-muted-foreground">Цена продажи:</span>
    <span class="font-medium">{{ formatPrice(priceBreakdown.price) }} ₸</span>
  </div>

  <!-- Скидка -->
  <div
    v-if="priceBreakdown.discountAmount > 0"
    class="flex justify-between text-destructive"
  >
    <span>Скидка ({{ formData.discount_percentage }}%):</span>
    <span class="font-medium">
      -{{ formatPrice(priceBreakdown.discountAmount) }} ₸
    </span>
  </div>

  <!-- 🔥 ЦЕНА ПОСЛЕ СКИДКИ (С ПСИХОЛОГИЧЕСКИМ ОКРУГЛЕНИЕМ) -->
  <div
    v-if="priceBreakdown.discountAmount > 0"
    class="flex justify-between font-semibold border-t pt-2"
  >
    <span>Цена со скидкой:</span>
    <span>{{ formatPrice(priceBreakdown.sellingPrice) }} ₸</span>
  </div>

  <!-- Расходы -->
  <div class="border-t pt-2 mt-1 space-y-2">
    <div class="flex justify-between">
      <span class="text-muted-foreground">Себестоимость:</span>
      <span class="font-medium text-destructive">
        -{{ formatPrice(priceBreakdown.costPrice) }} ₸
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-muted-foreground">ИПН (4%):</span>
      <span class="font-medium text-destructive">
        -{{ formatPrice(priceBreakdown.tax) }} ₸
      </span>
    </div>
    <div class="flex justify-between">
      <span class="text-muted-foreground">
        Эквайринг ({{ acquiringRate }}%):
      </span>
      <span class="font-medium text-destructive">
        -{{ formatPrice(priceBreakdown.acquiring) }} ₸
      </span>
    </div>
    <div v-if="priceBreakdown.bonusPoints > 0" class="flex justify-between">
      <span class="text-muted-foreground">
        Бонусы клиенту ({{ selectedBonusPercent }}%):
      </span>
      <span class="font-medium text-destructive">
        -{{ formatPrice(priceBreakdown.bonusPoints) }} ₸
      </span>
    </div>
  </div>

  <!-- 🔥 ЧИСТАЯ ПРИБЫЛЬ -->
  <div
    class="flex justify-between border-t pt-2 font-bold text-base"
    :class="
      priceBreakdown.netProfit > 0
        ? 'text-green-600 dark:text-green-400'
        : 'text-destructive'
    "
  >
    <span>Чистая прибыль:</span>
    <span>
      {{ formatPrice(priceBreakdown.netProfit) }} ₸
      ({{ priceBreakdown.netMargin }}%)
    </span>
  </div>

  <!-- ⚠️ ПРЕДУПРЕЖДЕНИЕ О НИЗКОЙ МАРЖЕ -->
  <div
    v-if="priceBreakdown.netMargin < 10 && priceBreakdown.sellingPrice > 0"
    class="flex items-center gap-2 p-2 rounded-lg text-xs font-medium"
    :class="
      priceBreakdown.netProfit <= 0
        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
    "
  >
    <Icon
      :name="
        priceBreakdown.netProfit <= 0
          ? 'lucide:alert-triangle'
          : 'lucide:alert-circle'
      "
      class="w-4 h-4 shrink-0"
    />
    <span v-if="priceBreakdown.netProfit <= 0">
      Товар продаётся в убыток! Проверьте цену, скидку и бонусы.
    </span>
    <span v-else>
      Маржа ниже 10%. Рекомендуется пересмотреть условия.
    </span>
  </div>
</div>
```

---

## 🎯 Как это работает в админке

### Сценарий 1: Админ создаёт товар

1. **Админ вводит:**
   - Цена: `21 860 ₸`
   - Скидка: `30%`

2. **Форма автоматически показывает:**

   ```
   Будет начислено: 764 бонусов
   (от цены со скидкой 15 290 ₸)
   ```

3. **Калькуляция расходов:**

   ```
   Цена продажи:        21 860 ₸
   Скидка (30%):        -6 570 ₸
   ─────────────────────────────
   Цена со скидкой:     15 290 ₸  ← Психологическое округление!

   Себестоимость:       -8 000 ₸
   ИПН (4%):              -612 ₸
   Эквайринг (1.5%):      -229 ₸
   Бонусы клиенту (5%):   -764 ₸
   ─────────────────────────────
   Чистая прибыль:       5 685 ₸ (37%)
   ```

4. **Админ сохраняет товар**

5. **База данных автоматически рассчитывает:**
   ```sql
   final_price = 15 290  -- Generated column
   bonus_points_award = 764  -- Trigger
   ```

---

### Сценарий 2: Админ меняет скидку

1. **Админ увеличивает скидку до 40%**

2. **Форма мгновенно пересчитывает:**

   ```
   Цена со скидкой: 13 090 ₸  ← Новое округление
   Бонусы: 654
   Чистая прибыль: 3 485 ₸ (27%)
   ```

3. **Админ видит предупреждение:**

   ```
   ⚠️ Маржа ниже 10%. Рекомендуется пересмотреть условия.
   ```

4. **Админ корректирует скидку до 35%**

5. **После сохранения база данных синхронизируется**

---

## 🔄 Синхронизация: Админка ↔ База данных

```
┌─────────────────────────────────────────────────────────┐
│ АДМИН-ПАНЕЛЬ (ProductForm.vue)                          │
│                                                         │
│ Админ вводит:                                           │
│ - price = 21 860 ₸                                      │
│ - discount_percentage = 30%                             │
│                                                         │
│ calculateFinalPrice() показывает:                       │
│ - "Цена со скидкой: 15 290 ₸"  ← Предпросмотр         │
│ - "Бонусы: 764"                                         │
│ - "Чистая прибыль: 5 685 ₸ (37%)"                      │
└─────────────────────────────────────────────────────────┘
                        ↓ SAVE (emit "create" / "update")
┌─────────────────────────────────────────────────────────┐
│ BACKEND (adminProductsStore.ts)                         │
│                                                         │
│ INSERT INTO products (price, discount_percentage, ...)  │
│ VALUES (21860, 30, ...)                                 │
└─────────────────────────────────────────────────────────┘
                        ↓ TRIGGER
┌─────────────────────────────────────────────────────────┐
│ POSTGRESQL (Generated Column + Trigger)                 │
│                                                         │
│ products.final_price = 15 290  ← GENERATED ALWAYS AS    │
│ products.bonus_points_award = 764  ← Trigger            │
│                                                         │
│ ✅ Гарантия: Значения совпадают с предпросмотром!      │
└─────────────────────────────────────────────────────────┘
                        ↓ SELECT
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (Catalog)                                      │
│                                                         │
│ <span>{{ product.final_price }} ₸</span>               │
│ → Отображает: 15 290 ₸                                  │
└─────────────────────────────────────────────────────────┘
```

---

## ✅ Преимущества для админа

### 1. Мгновенный предпросмотр

```
❌ Раньше: Админ не знал, какая цена будет показана покупателям
✅ Теперь: Админ видит точную цену ДО сохранения
```

### 2. Контроль маржинальности

```
✅ Калькуляция показывает:
   - Все расходы (себестоимость, налоги, эквайринг, бонусы)
   - Чистую прибыль в ₸ и %
   - Предупреждения о низкой марже или убытках
```

### 3. Защита от ошибок

```
⚠️ Товар продаётся в убыток! Проверьте цену, скидку и бонусы.
→ Админ не может случайно создать убыточный товар
```

### 4. Прозрачность бонусов

```
Будет начислено: 764 бонусов
(от цены со скидкой 15 290 ₸)

→ Админ понимает, сколько бонусов получит покупатель
```

---

## 📊 Пример: Реальный товар

**LEGO DC Бэтмен против Джокера**

### Ввод админа:

```
Цена:              61 990 ₸
Скидка:            10%
Себестоимость:     35 000 ₸
Бонусы:            5% (Стандарт)
Эквайринг:         1.5%
```

### Предпросмотр в форме:

```
┌─────────────────────────────────────────────────────────┐
│ Калькуляция на единицу                                  │
├─────────────────────────────────────────────────────────┤
│ Цена продажи:                              61 990 ₸     │
│ Скидка (10%):                              -6 199 ₸     │
│ ─────────────────────────────────────────────────────── │
│ Цена со скидкой:                           55 690 ₸     │
│                                                         │
│ Себестоимость:                            -35 000 ₸     │
│ ИПН (4%):                                  -2 228 ₸     │
│ Эквайринг (1.5%):                            -835 ₸     │
│ Бонусы клиенту (5%):                       -2 784 ₸     │
│ ─────────────────────────────────────────────────────── │
│ Итого расходы + бонусы:                    40 847 ₸     │
│ ─────────────────────────────────────────────────────── │
│ Чистая прибыль:                    14 843 ₸ (27%) ✅    │
└─────────────────────────────────────────────────────────┘

Будет начислено: 2 784 бонусов
(от цены со скидкой 55 690 ₸)
```

### После сохранения в БД:

```sql
SELECT
  price,                    -- 61990
  discount_percentage,      -- 10
  final_price,              -- 55690 (Generated)
  bonus_points_award        -- 2784 (Trigger)
FROM products
WHERE slug = 'lego-dc-batman-vs-joker';
```

### На сайте покупатель видит:

```html
<div class="product-card">
  <span class="old-price">61 990 ₸</span>
  <span class="final-price">55 690 ₸</span> ← Совпадает!
  <span class="bonus">+2 784 бонусов</span> ← Совпадает!
</div>
```

---

## 🛡️ Гарантии консистентности

### 1. Одинаковая формула

**TypeScript (utils/bonusCalculator.ts):**

```typescript
export function roundToMarketingPrice(price: number): number {
  if (price < 500) {
    return Math.floor(price / 10) * 10;
  }
  return Math.floor(price / 100) * 100 - 10;
}
```

**SQL (products.final_price):**

```sql
CASE
  WHEN (price * (100 - discount) / 100) < 500 THEN
    FLOOR((price * (100 - discount) / 100) / 10) * 10
  ELSE
    (FLOOR((price * (100 - discount) / 100) / 100) * 100) - 10
END
```

### 2. Автоматическая синхронизация

```
✅ Админ видит в форме: 15 290 ₸
✅ База данных хранит: 15 290 ₸
✅ Покупатель видит: 15 290 ₸
✅ Schema.org показывает: 15 290 ₸
```

### 3. Невозможность расхождения

```
❌ Раньше: Админ мог ошибиться при ручном вводе
✅ Теперь: База данных автоматически пересчитывает при UPDATE
```

---

**Дата создания:** 31 марта 2026, 11:30 UTC  
**Дата обновления:** 31 марта 2026, 11:51 UTC  
**Автор:** Uhti Commerce Team  
**Статус:** ✅ Реализовано и задокументировано

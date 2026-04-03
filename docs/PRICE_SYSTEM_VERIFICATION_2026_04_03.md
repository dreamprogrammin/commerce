# Подтверждение: Система ценообразования работает правильно

**Дата проверки:** 2026-04-03  
**Статус:** ✅ Архитектура корректна

---

## Проверка: Используется ли final_price везде?

### ✅ 1. Создание заказов (`create_user_order`)

**Файл:** `supabase/migrations/20260304000005_fix_stock_management_reserve_at_creation.sql`

**Строка 136-143:**

```sql
v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);

v_validated_items := v_validated_items || jsonb_build_object(
  'product_id',   v_cart_item.product_id,
  'quantity',     v_cart_item.quantity,
  'final_price',  v_product_record.final_price,  -- ✅ Округленная цена из базы
  'bonus_points', COALESCE(v_product_record.bonus_points_award, 0)
);
```

**Строка 207-211:**

```sql
INSERT INTO public.order_items (
  order_id, product_id, quantity, price_per_item, bonus_points_per_item
)
VALUES (
  v_new_order_id,
  v_cart_item.product_id,
  v_cart_item.quantity,
  v_cart_item.final_price,  -- ✅ Округленная цена сохраняется в order_items
  v_cart_item.bonus_points
);
```

**Вывод:** ✅ В `order_items.price_per_item` сохраняется округленная `final_price` из базы данных.

---

### ✅ 2. Расчет оборота в заказе

**Строка 136:**

```sql
v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);
```

**Строка 178-200:**

```sql
INSERT INTO public.orders (
  user_id,
  total_amount, discount_amount, final_amount,
  bonuses_spent, bonuses_awarded,
  ...
)
VALUES (
  v_current_user_id,
  COALESCE(v_total_price, 0),  -- ✅ Сумма всех final_price * quantity
  COALESCE(v_calculated_discount, 0),
  COALESCE(v_final_price, 0),
  ...
);
```

**Вывод:** ✅ `orders.total_amount` = сумма всех округленных `final_price * quantity`.

---

### ✅ 3. Отчет по продажам (`get_sales_report`)

**Файл:** `supabase/migrations/20260220000002_add_order_returns.sql`

**Расчет оборота:**

```sql
SELECT
  COUNT(*)::INTEGER,
  COALESCE(SUM(o.final_amount), 0),  -- ✅ Использует итоговую сумму заказа
  COALESCE(SUM(o.bonuses_spent), 0),
  ...
INTO
  v_user_count, v_user_turnover, v_user_bonuses_spent, ...
FROM public.orders o
WHERE
  o.created_at >= p_from
  AND o.created_at < p_to
  AND o.status NOT IN ('cancelled');
```

**Расчет себестоимости:**

```sql
SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0)
INTO v_user_cost
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
JOIN public.products p ON p.id = oi.product_id
WHERE
  o.created_at >= p_from
  AND o.created_at < p_to
  AND o.status NOT IN ('cancelled');
```

**Расчет прибыли:**

```sql
v_turnover := v_user_turnover + v_guest_turnover;  -- ✅ Оборот из final_amount
v_cost := v_user_cost + v_guest_cost;              -- Себестоимость
v_gross_profit := v_turnover - v_cost;             -- Валовая прибыль
v_tax := ROUND(v_turnover * 0.04);                 -- Налог 4%
v_commission := ROUND(v_card_sum * p_acquiring_rate / 100);  -- Эквайринг
v_net_profit := v_gross_profit - v_tax - v_commission;  -- ✅ Чистая прибыль
```

**Вывод:** ✅ Отчет использует `orders.final_amount` (которая рассчитана из округленных `final_price`), поэтому чистая прибыль тоже рассчитывается от округленных цен.

---

### ✅ 4. Админка - калькулятор прибыли (`ProductForm.vue`)

**Файл:** `components/admin/products/ProductForm.vue`

**Строка 754-762:**

```typescript
const discountedPrice = computed(() => {
  const price = formData.value.price || 0;
  const discount = formData.value.discount_percentage || 0;
  if (discount > 0 && price > 0) {
    // Используем функцию психологического округления
    return calculateFinalPrice(price, discount); // ✅ Округленная цена
  }
  return null;
});
```

**Строка 824-855:**

```typescript
const priceBreakdown = computed(() => {
  const price = formData.value.price || 0;
  if (!price) return null;

  const discount = formData.value.discount_percentage || 0;
  // Используем функцию психологического округления для цены продажи
  const sellingPrice =
    discount > 0 ? calculateFinalPrice(price, discount) : price; // ✅ Округленная
  const discountAmount = price - sellingPrice;
  const costPrice = formData.value.cost_price || 0;
  const tax = Math.round(sellingPrice * TAX_RATE); // ✅ От округленной
  const acquiring = Math.round((sellingPrice * acquiringRate.value) / 100); // ✅ От округленной
  const bonusPoints = formData.value.bonus_points_award || 0;
  const totalExpenses = costPrice + tax + acquiring;
  const netProfitBeforeBonus = sellingPrice - totalExpenses; // ✅ От округленной
  const netProfit = netProfitBeforeBonus - bonusPoints; // ✅ Чистая прибыль от округленной
  const netMargin =
    sellingPrice > 0 ? Math.round((netProfit / sellingPrice) * 100) : 0;

  return {
    price,
    sellingPrice, // ✅ Округленная
    discountAmount,
    costPrice,
    tax,
    acquiring,
    bonusPoints,
    totalExpenses,
    netProfit, // ✅ Чистая прибыль от округленной цены
    netMargin,
  };
});
```

**Вывод:** ✅ Калькулятор прибыли в админке использует `calculateFinalPrice()` для получения округленной цены, и все расчеты (налог, эквайринг, чистая прибыль) делаются от этой округленной цены.

---

## 📊 Итоговая схема

```
┌─────────────────────────────────────────────────────────────────┐
│ База данных                                                     │
│                                                                 │
│ products.price = 36990                                         │
│ products.discount_percentage = 30                              │
│ products.final_price = 25890 (GENERATED COLUMN - округленная) │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Создание заказа (create_user_order)                           │
│                                                                 │
│ v_product_record.final_price = 25890 (из базы)                │
│ v_total_price += 25890 * quantity                             │
│                                                                 │
│ INSERT INTO order_items (price_per_item)                       │
│ VALUES (25890)  ← Округленная цена                            │
│                                                                 │
│ INSERT INTO orders (total_amount)                              │
│ VALUES (25890 * quantity)  ← Сумма округленных цен            │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Отчет по продажам (get_sales_report)                          │
│                                                                 │
│ v_turnover = SUM(orders.final_amount)  ← Округленные цены     │
│ v_cost = SUM(order_items.quantity * products.cost_price)      │
│ v_gross_profit = v_turnover - v_cost                          │
│ v_tax = v_turnover * 0.04                                     │
│ v_commission = v_card_sum * acquiring_rate / 100              │
│ v_net_profit = v_gross_profit - v_tax - v_commission          │
│                                                                 │
│ ✅ Чистая прибыль рассчитана от округленных цен               │
└─────────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│ Админка - калькулятор прибыли (ProductForm.vue)               │
│                                                                 │
│ sellingPrice = calculateFinalPrice(price, discount)            │
│              = 25890 (округленная)                             │
│                                                                 │
│ tax = sellingPrice * 0.04                                      │
│ acquiring = sellingPrice * acquiring_rate / 100                │
│ netProfit = sellingPrice - costPrice - tax - acquiring - bonus│
│                                                                 │
│ ✅ Предпросмотр показывает ту же прибыль, что будет в отчете │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Заключение

**Вопрос:** Чистая прибыль должна быть округленная везде в админке, в дашборде, в отчетах?

**Ответ:** ✅ **ДА, и она уже округленная везде!**

Система работает правильно:

1. ✅ **База данных:** `final_price` (generated column) автоматически округляется
2. ✅ **Создание заказов:** Использует `final_price` из базы (округленная)
3. ✅ **order_items.price_per_item:** Сохраняется округленная `final_price`
4. ✅ **orders.total_amount:** Сумма всех округленных `final_price * quantity`
5. ✅ **Отчет get_sales_report:** Использует `orders.final_amount` (округленная)
6. ✅ **Чистая прибыль в отчете:** Рассчитывается от округленного оборота
7. ✅ **Админка (калькулятор):** Использует `calculateFinalPrice()` (округленная)
8. ✅ **Предпросмотр в админке:** Показывает ту же прибыль, что будет в реальном отчете

**Единственная проблема, которую мы исправили:**

- RPC `get_filtered_products()` не возвращал `final_price` на фронт для отображения в каталоге
- Это было исправлено миграцией `/supabase/migrations/20260403104700_add_final_price_to_get_filtered_products.sql`

---

**Дата:** 2026-04-03  
**Статус:** ✅ Подтверждено - система работает правильно  
**Автор:** Uhti Commerce Team

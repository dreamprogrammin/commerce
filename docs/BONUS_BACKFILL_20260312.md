# Refactoring: Массовая пересборка бонусных начислений

**Дата**: 2026-03-12
**Статус**: Выполнено

## Проблема

Расхождение формул расчёта бонусов между админкой и базой данных:

| Где | Формула | Результат (цена 18 600 ₸, скидка 0%) |
|-----|---------|---------------------------------------|
| **Админка (до фикса)** | `price * percent / 100` | 930 бонусов (от полной цены) |
| **БД (RPC)** | хранит `bonus_points_award` как есть | начисляет то, что записано |

При наличии скидки админка считала бонусы от **полной цены**, а клиент платил **цену со скидкой** — бонусы были завышены, маржа "съедалась".

## Что сделано

### 1. Единый хелпер `utils/bonusCalculator.ts`

```typescript
export function calculateBonusPoints(
  price: number,
  discountPercentage: number,
  bonusPercent: number,
): number {
  const finalPrice = Math.round(price * (100 - discount) / 100)
  return Math.round(finalPrice * bonusPercent / 100)
}
```

Формула совпадает с SQL: `ROUND(final_price * percent / 100)`.

### 2. `ProductForm.vue` — исправлен watcher

- **Было**: `price * (percent / 100)` — считал от полной цены
- **Стало**: `calculateBonusPoints(price, discount, percent)` — считает от `final_price`
- Watcher отслеживает 3 зависимости: `price`, `discount_percentage`, `selectedBonusPercent`

### 3. Калькулятор прибыли в админке

- Бонусы добавлены как строка расходов в калькуляции (вычитаются из прибыли)
- `netProfit` теперь = `sellingPrice - costPrice - tax - acquiring - bonusPoints`
- Предупреждение при марже < 10% (жёлтое) и при убытке (красное)
- Под селектором бонусов показывается "(от цены со скидкой X ₸)"

### 4. SQL-миграция `20260312000001_backfill_bonus_points_from_final_price.sql`

Два UPDATE-запроса:

1. **Заполнение пустых**: товары с `bonus_points_award = 0` или `NULL` получают `ROUND(final_price * 0.05)`
2. **Исправление завышенных**: товары со скидкой, где бонусы были посчитаны от `price` вместо `final_price`, пересчитываются

Оба запроса идемпотентны — безопасно запускать повторно.

## Как работает система бонусов (итого)

```
Админ создаёт товар:
  price = 18 600 ₸, discount = 10%, bonus_percent = 5%
  → final_price = 16 740 ₸ (generated column в БД)
  → bonus_points_award = ROUND(16 740 * 0.05) = 837 бонусов
  → записывается в products.bonus_points_award = 837

Клиент покупает:
  create_user_order RPC:
  → total_award_bonuses += product.bonus_points_award * quantity
  → 837 * 1 = 837 бонусов → pending_bonus_balance
  → через 14 дней → active_bonus_balance
```

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `utils/bonusCalculator.ts` | Новый — единая формула расчёта |
| `components/admin/products/ProductForm.vue` | Импорт хелпера, исправлен watcher, обновлён калькулятор |
| `supabase/migrations/20260312000001_...sql` | Backfill для существующих товаров |

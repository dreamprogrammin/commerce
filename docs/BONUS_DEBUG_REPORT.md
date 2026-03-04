# Отчёт по дебагу бонусов за покупки

**Дата**: 2026-03-04

## Резюме

Проведён полный аудит цепочки: кнопка «Заказать» → SQL → bonus_transactions → RPC → фронтенд → отображение.

**Корневая причина**: функция `cancel_order` НЕ обрабатывает earned бонусы при отмене заказа. Результат — фантомный `pending_bonus_balance` и вечно-pending earned транзакции для отменённых заказов.

---

## 1. Бэкенд (SQL) — `create_user_order`

**Файл**: `supabase/migrations/20260303000002_fix_earned_bonus_transactions.sql`
**Статус миграции**: ✅ Развёрнута на prod

| Проверка | Статус |
|----------|--------|
| COALESCE для NULL `bonus_points_award` | ✅ OK |
| INSERT earned стоит ДО RETURN | ✅ OK |
| SECURITY DEFINER обходит RLS | ✅ OK |
| `bonus_points_award` на товарах | ✅ OK (все товары имеют значения) |

---

## 2. RPC `get_bonus_history`

✅ **Нет фильтра по status** — возвращает ВСЕ статусы (pending, completed, cancelled).

---

## 3. Фронтенд

✅ Страница `pages/profile/bonuses/index.vue` — рендерит все транзакции без фильтрации.
✅ `bonusesToAward` computed — корректно считает `(bonus_points_award || 0) * quantity`.
✅ Параметры RPC передаются по имени, сигнатура совпадает.

---

## 4. НАЙДЕННЫЕ ПРОБЛЕМЫ

### КРИТИЧЕСКАЯ: `cancel_order` не обрабатывает earned бонусы

**Файл**: `supabase/migrations/20260207000002_fix_cancel_order_guest_checkout.sql`

**Симптомы** (подтверждено данными пользователя `f540508e-...`):
- **8 заказов**, ВСЕ в статусе `cancelled`
- **8 earned транзакций** всё ещё `status = 'pending'`
- `pending_bonus_balance = 7600` — фантомный баланс от отменённых заказов
- `bonuses_activation_date = NULL` на всех заказах (не были подтверждены)

**Три бага в `cancel_order`**:

| # | Баг | Последствие |
|---|-----|------------|
| 1 | Earned транзакции НЕ помечаются `cancelled` | Пользователь видит pending бонусы за отменённые заказы |
| 2 | `pending_bonus_balance` НЕ уменьшается | Фантомный баланс 7600 ₸ у этого пользователя |
| 3 | `transaction_type = 'refund'` вместо `'refund_spent'` | Нарушение CHECK constraint — INSERT фейлится |

**Код, вызывающий проблему** (строки 104-113 старой версии):
```sql
INSERT INTO public.bonus_transactions (
  ...
  'refund',          -- ❌ Нет такого типа! CHECK: refund_spent, refund_earned
  ...
);
-- ❌ Нет обработки earned бонусов вообще!
```

### СРЕДНЯЯ: `activation_date` не заполняется в bonus_transactions

`process_confirmed_order` устанавливает `orders.bonuses_activation_date`, но НЕ обновляет `bonus_transactions.activation_date`. Фронтенд проверяет `transaction.activation_date` для показа даты → NULL → пользователь не видит когда бонусы активируются.

### НИЗКАЯ: Бэкфилл старых заказов

Заказы до миграции 20260303000002 не имеют earned записей в `bonus_transactions`.

---

## 5. Что исправлено

**Миграция**: `20260304000002_fix_bonus_activation_date_and_backfill.sql`

### 1. `cancel_order` — полный фикс бонусов при отмене

- **Возврат потраченных бонусов**: `transaction_type = 'refund_spent'` (был `'refund'`)
- **Откат начисленных бонусов**:
  - Если заказ был подтверждён → `pending_bonus_balance -= bonuses_awarded`
  - Логирует `refund_earned` транзакцию
  - Помечает earned транзакцию `status = 'cancelled'`
- Снимки `balance_after` / `pending_balance_after` для корректной истории

### 2. `process_confirmed_order` — activation_date

- При подтверждении заказа → UPDATE `bonus_transactions.activation_date = NOW() + 14 days`

### 3. Бэкфиллы (одноразовые)

- INSERT earned записей для старых заказов без них
- UPDATE `activation_date` для существующих earned записей с NULL
- UPDATE earned транзакций отменённых заказов → `status = 'cancelled'`
- Пересчёт `pending_bonus_balance` на основе реальных подтверждённых заказов

---

## 6. Итоговая таблица

| Слой | Компонент | До фикса | После фикса |
|------|-----------|----------|-------------|
| SQL | `create_user_order` | ✅ OK | ✅ OK |
| SQL | `cancel_order` — earned бонусы | ❌ НЕ обрабатывает | ✅ Откатывает + cancelled |
| SQL | `cancel_order` — refund type | ❌ `'refund'` (невалидный) | ✅ `'refund_spent'` |
| SQL | `cancel_order` — pending_balance | ❌ НЕ уменьшает | ✅ Уменьшает |
| SQL | `process_confirmed_order` — activation_date | ❌ Не проставляет | ✅ Проставляет |
| SQL | Бэкфилл старых заказов | ❌ Нет earned записей | ✅ Вставлены |
| SQL | Фантомный pending_balance | ❌ 7600 у пользователя | ✅ Пересчитан |
| RPC | `get_bonus_history` | ✅ OK | ✅ OK |
| Vue | Отображение pending | ✅ OK | ✅ OK |
| Data | `bonus_points_award` на товарах | ✅ OK (все заполнены) | ✅ OK |

---

## 7. Тестирование после деплоя

```sql
-- 1. Проверить: earned транзакции отменённых заказов стали cancelled
SELECT bt.status, COUNT(*)
FROM bonus_transactions bt
JOIN orders o ON o.id = bt.order_id
WHERE bt.transaction_type = 'earned' AND o.status = 'cancelled'
GROUP BY bt.status;
-- Ожидание: все 'cancelled', ноль 'pending'

-- 2. Проверить: pending_bonus_balance пользователя обнулился
SELECT active_bonus_balance, pending_bonus_balance
FROM profiles
WHERE id = 'f540508e-aeaa-4310-8a7c-5750f71e703e';
-- Ожидание: pending_bonus_balance = 0 (все заказы отменены)

-- 3. Проверить: новая отмена заказа корректно обрабатывает бонусы
-- (ручной тест: создать заказ → отменить → проверить историю)
```

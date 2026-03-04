# Отчёт: Исправление pending_bonus_balance при создании заказа

**Дата**: 2026-03-04
**Миграция**: `20260304000004_fix_pending_balance_at_order_creation.sql`

---

## Проблема

После оформления заказа запись `earned/pending` появлялась в истории бонусов, но виджет **«Ожидают активации»** не обновлялся. Пользователь видел старую сумму (например, 500 ₸ от отзыва) вместо актуальной (500 + 650 = 1150 ₸).

**Причина**: `create_user_order` делал INSERT в `bonus_transactions`, но не обновлял `profiles.pending_bonus_balance`. Этот баланс пополнялся только в `process_confirmed_order` — когда администратор вручную переводил заказ в статус `confirmed`.

---

## Новый дизайн потока бонусов

| Событие | pending_bonus_balance | active_bonus_balance |
|---------|-----------------------|----------------------|
| Заказ создан (`create_user_order`) | **+bonuses_awarded** ← новое | без изменений |
| Заказ подтверждён (`process_confirmed_order`) | без изменений ← убрано | +welcome_bonus (только первый заказ) |
| 14 дней прошло (`activate_pending_bonuses`) | −bonuses_awarded | +bonuses_awarded |
| Заказ отменён (`cancel_order`) | **−bonuses_awarded** ← всегда | +bonuses_spent (если были потрачены) |

---

## Изменения в функциях

### 1. `create_user_order` — добавлен UPDATE pending

```sql
-- После INSERT INTO bonus_transactions:
UPDATE public.profiles
SET pending_bonus_balance = pending_bonus_balance + v_total_award_bonuses
WHERE id = v_current_user_id
RETURNING active_bonus_balance, pending_bonus_balance
INTO v_new_active_balance, v_new_pending_balance;
```

Теперь `balance_after` и `pending_balance_after` в транзакции отражают **реальные снимки** балансов после обновления.

### 2. `process_confirmed_order` — убран UPDATE pending_bonus_balance

До фикса:
```sql
-- ❌ Двойное добавление: уже было в create_user_order
UPDATE profiles SET pending_bonus_balance = pending_bonus_balance + bonuses_awarded
```

После фикса — только ставит `bonuses_activation_date` и `activation_date` в транзакции.

### 3. `cancel_order` — pending вычитается ВСЕГДА

До фикса:
```sql
-- ❌ Только если заказ был подтверждён (bonuses_activation_date IS NOT NULL)
IF v_bonuses_activation_date IS NOT NULL THEN
  pending -= bonuses_awarded
END IF;
```

После фикса:
```sql
-- ✅ Всегда, т.к. pending был добавлен при create_user_order
pending -= bonuses_awarded  -- безусловно
```

---

## Бэкфиллы (разовые)

### Бэкфилл 1: Пересчёт pending_bonus_balance

```sql
UPDATE profiles p
SET pending_bonus_balance = COALESCE(
  (SELECT SUM(bonuses_awarded) FROM orders
   WHERE user_id = p.id
     AND status NOT IN ('cancelled', 'completed')
     AND bonuses_awarded > 0),
  0
);
```

**Логика**: pending = сумма бонусов заказов, которые не отменены (`cancelled`) и не активированы (`completed`). Охватывает: `new`, `confirmed`, `delivered`, `processing`.

**Для пользователя `f540508e-...`**: все 8 заказов в статусе `cancelled` → `pending_bonus_balance` станет **0** (было фантомных 7600).

### Бэкфилл 2: Пометить earned транзакции отменённых заказов

```sql
UPDATE bonus_transactions SET status = 'cancelled'
FROM orders WHERE order_id = orders.id
  AND transaction_type = 'earned' AND bonus_transactions.status = 'pending'
  AND orders.status = 'cancelled';
```

### Бэкфилл 3: Вставить earned записи для старых заказов

Для заказов без `earned` транзакций (созданных до миграции 20260303000002).

---

## Гарантированная синхронизация при входе через Telegram Magic Link

**Файл**: `app.vue`

### Проблема

Когда пользователь открывает ссылку из Telegram и он **уже залогинен**, Supabase восстанавливает сессию через событие `INITIAL_SESSION` (не `SIGNED_IN`). Предыдущий код обрабатывал только `SIGNED_IN` — в итоге профиль брался из localStorage-кеша без принудительного рефреша из БД. Пользователь мог видеть устаревший баланс.

### Два сценария входа через TG-ссылку

| Сценарий | Auth Event | До фикса | После фикса |
|----------|-----------|----------|-------------|
| Первый вход / новая сессия | `SIGNED_IN` | ✅ Рефреш | ✅ Рефреш |
| Уже залогинен, открыл ссылку | `INITIAL_SESSION` | ❌ Кеш (стейл) | ✅ Рефреш |

### Исправление (`app.vue`)

```typescript
// До:
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') {
    profileStore.loadProfile(true, true, true)
  }
})

// После:
supabase.auth.onAuthStateChange((event, session) => {
  if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
    profileStore.loadProfile(true, false, true)  // force=true, silent=true
  }
})
```

### Почему нет мигания UI (нет вспышки нулей)

```
1. Pinia persistedstate восстанавливает profile из localStorage
   → Реактивные computed (bonusBalance, pendingBonuses) сразу показывают кешированные данные
   → Пользователь видит "1150" (не 0)

2. В фоне: onAuthStateChange → loadProfile(force=true, silent=true)
   → silent=true: isLoading остаётся false → скелетон не показывается
   → Запрос идёт в Supabase profiles table

3. Свежие данные пришли: profile.value = data
   → Vue реактивно обновляет UI без перерисовки скелетонов
   → Если баланс изменился — цифра плавно меняется
```

### Параметры `loadProfile(force, waitForCreation, silent)`

| Параметр | Значение | Эффект |
|----------|---------|--------|
| `force = true` | Игнорирует кеш | Всегда идёт в БД |
| `waitForCreation = false` | Не ждёт создания профиля | Быстрый путь для уже существующих |
| `silent = true` | Не ставит `isLoading = true` | Нет скелетона, нет мигания |

---

## Проверка после деплоя

```sql
-- 1. pending_bonus_balance соответствует незавершённым заказам
SELECT p.id, p.pending_bonus_balance,
       COALESCE(SUM(o.bonuses_awarded), 0) AS calculated
FROM profiles p
LEFT JOIN orders o ON o.user_id = p.id
  AND o.status NOT IN ('cancelled', 'completed')
  AND o.bonuses_awarded > 0
GROUP BY p.id, p.pending_bonus_balance
HAVING p.pending_bonus_balance != COALESCE(SUM(o.bonuses_awarded), 0)
LIMIT 10;
-- Ожидание: 0 строк (все балансы совпадают)

-- 2. Нет pending earned транзакций у отменённых заказов
SELECT COUNT(*) FROM bonus_transactions bt
JOIN orders o ON o.id = bt.order_id
WHERE bt.transaction_type = 'earned' AND bt.status = 'pending'
  AND o.status = 'cancelled';
-- Ожидание: 0

-- 3. После нового заказа — pending сразу обновляется
-- (ручной тест: оформить заказ → проверить виджет «Ожидают активации»)
```

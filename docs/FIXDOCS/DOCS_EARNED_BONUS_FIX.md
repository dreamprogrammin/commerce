# Bugfix: Начисленные бонусы за покупку не появлялись в истории (2026-03-03)

## Проблемы

### 1. Бонусы за покупку не отображаются в истории транзакций (критическая)

**Симптом**: Пользователь оформил заказ с бонусными товарами, но в разделе «История бонусов»
нет записи о начисленных бонусах. Pending-баланс остаётся 0 даже после подтверждения заказа
администратором.

**Root Cause**: Функция `create_user_order` вычисляет `v_total_award_bonuses` (сумма бонусов
за все товары в корзине) и сохраняет её в `orders.bonuses_awarded`, но **не делает** INSERT
в таблицу `bonus_transactions` с типом `earned`. Блок для логирования был потерян в миграции
`20260219085008_use_final_price_in_order_functions.sql` при переработке функции и не
восстанавливался через три последующих переписывания функции (`20260204*`, `20260225000001`,
`20260227000002`).

### 2. Приветственный бонус (500 ₸) не отображается в истории

**Симптом**: При первом заказе у пользователя появляется +500 активных бонусов, но история
бонусов не содержит записи с типом `welcome`. Пользователь не понимает, откуда взялись бонусы.

**Root Cause**: Функция `process_confirmed_order` корректно начисляет `active_bonus_balance += 500`
при первом заказе, но не пишет запись в `bonus_transactions` с типом `welcome`.

---

## Решение

### Миграция `20260303000002_fix_earned_bonus_transactions.sql`

#### Fix 1: `create_user_order` — INSERT earned транзакции

После создания заказа и обработки списания бонусов добавлен блок:

```sql
IF COALESCE(v_total_award_bonuses, 0) > 0 THEN
  INSERT INTO public.bonus_transactions (
    user_id, order_id, transaction_type, amount,
    balance_after, pending_balance_after, description, status
  ) VALUES (
    v_current_user_id,
    v_new_order_id,
    'earned',
    v_total_award_bonuses,
    -- Снимок активного баланса после списания (если было)
    GREATEST(COALESCE(v_user_profile.active_bonus_balance, 0) - COALESCE(p_bonuses_to_spend, 0), 0),
    -- Pending баланс пока не изменился (изменится при подтверждении)
    COALESCE(v_user_profile.pending_bonus_balance, 0),
    'Бонусы за покупку (активируются через 14 дней после подтверждения)',
    'pending'
  );
END IF;
```

**Почему `status='pending'`**: Запись создаётся сразу при оформлении заказа, чтобы пользователь
видел её в истории. Однако бонусы реально появятся в `pending_bonus_balance` только после
подтверждения заказа (`process_confirmed_order`), а в `active_bonus_balance` — через 14 дней
(`activate_pending_bonuses`).

**Почему `balance_after` не изменяется**: На этом этапе фактический баланс ещё не обновлён.
`balance_after` содержит снимок текущего состояния (после любого списания за этот же заказ).
Это корректно для `pending` записи.

#### Fix 2: `process_confirmed_order` — INSERT welcome транзакции

В блоке `IF NOT v_user_profile.has_received_welcome_bonus THEN`, после UPDATE профиля, добавлен:

```sql
INSERT INTO public.bonus_transactions (
  user_id, order_id, transaction_type, amount,
  balance_after, pending_balance_after, description, status
) VALUES (
  v_target_order.user_id,
  p_order_id,
  'welcome',
  v_welcome_bonus,
  COALESCE(v_user_profile.active_bonus_balance, 0) + v_welcome_bonus,
  COALESCE(v_user_profile.pending_bonus_balance, 0) + v_target_order.bonuses_awarded,
  'Приветственный бонус за первый заказ',
  'completed'
);
```

**Почему `status='completed'`**: Приветственный бонус зачисляется сразу на `active_bonus_balance`
(без периода ожидания), поэтому транзакция завершена немедленно.

---

## Поток бонусов: до и после фикса

```
ОФОРМЛЕНИЕ ЗАКАЗА (create_user_order)
  ↓
  bonus_transactions: 'spent'/'completed' ← списание (если было)    [было]
  bonus_transactions: 'earned'/'pending'  ← будущие бонусы          [ДОБАВЛЕНО]
  orders.bonuses_awarded = N                                          [было]

ПОДТВЕРЖДЕНИЕ ЗАКАЗА (process_confirmed_order)
  ↓
  profiles.pending_bonus_balance += bonuses_awarded                  [было]
  profiles.active_bonus_balance  += 500  (первый заказ)             [было]
  bonus_transactions: 'welcome'/'completed'  ← привет. бонус        [ДОБАВЛЕНО]
  orders.bonuses_activation_date = NOW() + 14 days                  [было]

АКТИВАЦИЯ ЧЕРЕЗ 14 ДНЕЙ (activate_pending_bonuses)
  ↓
  profiles.pending_bonus_balance -= bonuses_awarded                  [было]
  profiles.active_bonus_balance  += bonuses_awarded                  [было]
  bonus_transactions: 'activation'/'completed'                       [было]
```

---

## Что отображается в истории

| Момент | Тип | Статус | Сумма | Описание |
|--------|-----|--------|-------|----------|
| Оформление | `earned` | `pending` | +N | Бонусы за покупку (активируются через 14 дней...) |
| Оформление | `spent` | `completed` | -N | Списание бонусов при оформлении заказа |
| Подтверждение | `welcome` | `completed` | +500 | Приветственный бонус за первый заказ |
| +14 дней | `activation` | `completed` | +N | Активация бонусов за заказ (14 дней) |

---

## Совместимость с cancel_order

Функция `cancel_order` возвращает бонусы (`refund_spent` / `refund_earned`) и не затрагивает
`earned/pending` записи — они корректно останутся в истории как `cancelled`-маркер через статус
заказа. Прямого взаимодействия с новыми INSERT нет.

---

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migrations/20260303000002_fix_earned_bonus_transactions.sql` | **NEW** — фикс |

---

## Тестирование

1. Оформите заказ с товарами, у которых есть `bonus_points_award > 0`
2. Сразу после оформления в «Истории бонусов» должна появиться запись `earned / pending`
3. Подтвердите заказ в админке → в «Истории бонусов» первого заказа появится `welcome / completed`
4. Через 14 дней (или через pg_cron) бонусы активируются → появится `activation / completed`

```sql
-- Проверка: история конкретного пользователя
SELECT transaction_type, amount, status, description, created_at
FROM bonus_transactions
WHERE user_id = '<user_uuid>'
ORDER BY created_at DESC;
```

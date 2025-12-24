# Логика приветственных бонусов

## Дата обновления
2025-12-24

## Файл миграции
`20251224105454_update_welcome_bonus_logic.sql`

---

## Новая логика работы приветственных бонусов

### ✅ Что изменилось

| Событие | Старое поведение | Новое поведение |
|---------|------------------|-----------------|
| **Регистрация через Google OAuth** | Профиль создается БЕЗ бонусов | ✅ Профиль создается БЕЗ бонусов |
| **Создание первого заказа** | ❌ 1000 бонусов при создании заказа | ✅ Бонусы НЕ начисляются |
| **Подтверждение первого заказа** | ❌ Бонусы не начисляются | ✅ 1000 бонусов СРАЗУ в `active_bonus_balance` |
| **Гость без регистрации** | ✅ Профиль НЕ создается | ✅ Профиль НЕ создается |

---

## Подробное описание

### 1. Регистрация через Google OAuth

**Что происходит:**
- Триггер `on_auth_user_created` срабатывает при создании пользователя в `auth.users`
- Функция `handle_new_user()` создает профиль в таблице `profiles`
- Профиль создается с параметрами:
  ```sql
  active_bonus_balance = 0
  pending_bonus_balance = 0
  has_received_welcome_bonus = FALSE
  ```

**Результат:**
- ✅ Пользователь зарегистрирован
- ✅ Профиль создан
- ❌ Приветственные бонусы НЕ начислены

---

### 2. Первая покупка зарегистрированного пользователя

#### Создание заказа

**Что происходит:**
- Пользователь оформляет заказ в `/checkout`
- Вызывается функция `create_order()`
- Заказ создается со статусом `status = 'new'`

**Результат:**
- ✅ Заказ создан
- ❌ Приветственные бонусы НЕ начислены (старый триггер удален!)

#### Подтверждение заказа (админом)

**Что происходит:**
- Админ подтверждает заказ через функцию `confirm_and_process_order(p_order_id)`
- Функция проверяет: `has_received_welcome_bonus = FALSE`?
- Если `TRUE` → начисляет **1000 бонусов СРАЗУ** в `active_bonus_balance`
- Устанавливает флаг: `has_received_welcome_bonus = TRUE`

**SQL логика:**
```sql
-- Если это первый заказ
IF NOT v_user_profile.has_received_welcome_bonus THEN
  UPDATE public.profiles
  SET
    active_bonus_balance = active_bonus_balance - bonuses_spent + 1000,
    pending_bonus_balance = pending_bonus_balance + bonuses_awarded,
    has_received_welcome_bonus = TRUE
  WHERE id = user_id;
END IF;
```

**Результат:**
- ✅ Заказ подтвержден (`status = 'confirmed'`)
- ✅ 1000 бонусов начислены СРАЗУ в `active_bonus_balance`
- ✅ Бонусы за покупку начислены в `pending_bonus_balance` (активация через 7 дней)
- ✅ Пользователь может тратить 1000 бонусов сразу же

---

### 3. Гостевая покупка (без регистрации)

**Что происходит:**
- Гость оформляет заказ в `/checkout`
- Заполняет имя, email, телефон
- Заказ создается с `user_id = NULL`

**Результат:**
- ✅ Заказ создан как гостевой
- ❌ Профиль НЕ создается
- ❌ Бонусы НЕ начисляются

**Важно:**
- Если гость потом зарегистрируется с тем же email, его **старые гостевые заказы НЕ связываются** с новым профилем
- Это сделано намеренно для простоты логики

---

### 4. Отмена первого заказа

**Что происходит:**
- Если отменяется подтвержденный заказ (`status = 'confirmed'`)
- Функция `cancel_order()` проверяет:
  - Есть ли другие подтвержденные заказы у пользователя?
  - Если НЕТ и `has_received_welcome_bonus = TRUE` → это был первый заказ

**SQL логика:**
```sql
-- Если это был единственный подтвержденный заказ
IF v_other_confirmed_orders = 0 AND has_received_welcome_bonus THEN
  UPDATE public.profiles
  SET
    active_bonus_balance = active_bonus_balance + bonuses_spent - 1000,
    pending_bonus_balance = pending_bonus_balance - bonuses_awarded,
    has_received_welcome_bonus = FALSE
  WHERE id = user_id;
END IF;
```

**Результат:**
- ✅ Заказ отменен (`status = 'cancelled'`)
- ✅ Товары возвращены на склад
- ✅ 1000 бонусов списаны с `active_bonus_balance`
- ✅ Флаг `has_received_welcome_bonus` сброшен в `FALSE`
- ✅ Пользователь снова может получить приветственный бонус при следующем заказе

---

## Схема работы

```
┌─────────────────────────────────────────────────────────────────┐
│                    НОВАЯ ЛОГИКА БОНУСОВ                         │
└─────────────────────────────────────────────────────────────────┘

1. Регистрация через Google OAuth
   ↓
   ┌──────────────────────────────────────┐
   │ Профиль создан                       │
   │ active_bonus_balance = 0             │
   │ pending_bonus_balance = 0            │
   │ has_received_welcome_bonus = FALSE   │
   └──────────────────────────────────────┘
   ↓

2. Пользователь оформляет первый заказ
   ↓
   ┌──────────────────────────────────────┐
   │ Заказ создан (status = 'new')       │
   │ Бонусы НЕ начислены                  │
   └──────────────────────────────────────┘
   ↓

3. Админ подтверждает заказ
   ↓
   ┌──────────────────────────────────────┐
   │ Заказ подтвержден                    │
   │ active_bonus_balance += 1000 ✅      │
   │ pending_bonus_balance += N           │
   │ has_received_welcome_bonus = TRUE    │
   └──────────────────────────────────────┘
   ↓

4. Пользователь может тратить 1000 бонусов сразу!
```

---

## Что удалено

### Триггер `on_first_order_grant_welcome_bonus`
```sql
DROP TRIGGER IF EXISTS on_first_order_grant_welcome_bonus ON public.orders;
```

**Причина:**
- Триггер начислял бонусы при **создании** заказа (до подтверждения)
- Новая логика требует начисления **после подтверждения**

### Функция `grant_welcome_bonus_on_first_order()`
```sql
DROP FUNCTION IF EXISTS public.grant_welcome_bonus_on_first_order() CASCADE;
```

**Причина:**
- Функция создавала профили на лету при создании заказа
- Новая логика: профили создаются только при регистрации

---

## Обновленные функции

### 1. `confirm_and_process_order(p_order_id)`

**Добавлено:**
- Проверка `has_received_welcome_bonus`
- Начисление 1000 бонусов в `active_bonus_balance` (не в `pending`!)
- Установка флага `has_received_welcome_bonus = TRUE`

**Изменено:**
- Дата активации бонусов за покупку: `NOW() + INTERVAL '7 days'` (было 14 дней)

### 2. `cancel_order(p_order_id)`

**Добавлено:**
- Проверка, был ли заказ первым (с приветственным бонусом)
- Откат приветственного бонуса если это был единственный подтвержденный заказ
- Сброс флага `has_received_welcome_bonus = FALSE`

### 3. `activate_pending_bonuses()`

**Изменено:**
- Удалена логика активации приветственных бонусов (теперь они начисляются сразу)
- Период активации бонусов за покупку: 7 дней (было 14)

---

## Изменения во фронтенде

### 1. `GuestBonusModal.vue`

**Было:**
```vue
Просто войдите через Google и бонусы сразу на вашем счету!
```

**Стало:**
```vue
Войдите через Google и получите 1000 бонусов после подтверждения первого заказа!
```

**Кнопка:**
```vue
Зарегистрироваться и получить бонусы
```

### 2. `checkout.vue`

**Было:**
```vue
Зарегистрируйтесь и получите 1000 бонусов при первой покупке!
```

**Стало:**
```vue
Зарегистрируйтесь и получите 1000 бонусов после подтверждения первого заказа!
```

---

## Тестирование

### Сценарий 1: Регистрация без покупки

```sql
-- 1. Зарегистрировать пользователя через Google OAuth
-- 2. Проверить профиль
SELECT
  id,
  active_bonus_balance,
  pending_bonus_balance,
  has_received_welcome_bonus
FROM public.profiles
WHERE id = '<user_id>';

-- Ожидаемый результат:
-- active_bonus_balance = 0
-- pending_bonus_balance = 0
-- has_received_welcome_bonus = FALSE
```

### Сценарий 2: Первая покупка

```sql
-- 1. Создать заказ
-- 2. Проверить профиль (бонусы НЕ должны начислиться)
SELECT * FROM public.profiles WHERE id = '<user_id>';

-- 3. Подтвердить заказ (вызвать confirm_and_process_order)
SELECT public.confirm_and_process_order('<order_id>');

-- 4. Проверить профиль (бонусы ДОЛЖНЫ начислиться)
SELECT
  id,
  active_bonus_balance,  -- Должно быть 1000
  pending_bonus_balance, -- Должно быть > 0 (бонусы за покупку)
  has_received_welcome_bonus -- Должно быть TRUE
FROM public.profiles
WHERE id = '<user_id>';
```

### Сценарий 3: Отмена первого заказа

```sql
-- 1. Отменить заказ
SELECT public.cancel_order('<order_id>');

-- 2. Проверить профиль (бонусы должны откатиться)
SELECT
  id,
  active_bonus_balance,  -- Должно быть 0
  pending_bonus_balance, -- Должно быть 0
  has_received_welcome_bonus -- Должно быть FALSE
FROM public.profiles
WHERE id = '<user_id>';
```

### Сценарий 4: Гостевой заказ

```sql
-- 1. Создать гостевой заказ (user_id = NULL)
-- 2. Проверить, что профиль НЕ создан
SELECT COUNT(*) FROM public.profiles; -- Не должно измениться
```

---

## Как запустить миграцию

```bash
# Локальная БД
supabase start
supabase db reset

# Или применить только новую миграцию
supabase migration up

# Удаленная БД
supabase db push
```

---

## Проверка после миграции

```sql
-- 1. Статистика пользователей
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN has_received_welcome_bonus THEN 1 END) as with_bonus,
  COUNT(CASE WHEN NOT has_received_welcome_bonus THEN 1 END) as without_bonus
FROM public.profiles;

-- 2. Проверка триггера (должен быть удален)
SELECT * FROM information_schema.triggers
WHERE trigger_name = 'on_first_order_grant_welcome_bonus';
-- Должно вернуть 0 строк

-- 3. Проверка функции (должна быть удалена)
SELECT * FROM information_schema.routines
WHERE routine_name = 'grant_welcome_bonus_on_first_order';
-- Должно вернуть 0 строк
```

---

## FAQ

### Почему бонусы начисляются в active_bonus_balance, а не в pending?

**Ответ:**
Это мотивация для новых пользователей. Они сразу видят 1000 бонусов на счету и могут использовать их в следующем заказе.

### Что если пользователь зарегистрировался, но не сделал заказ?

**Ответ:**
Профиль создан, но `has_received_welcome_bonus = FALSE`. При первом подтвержденном заказе он получит 1000 бонусов.

### Что если гость создал заказ, потом зарегистрировался?

**Ответ:**
Старые гостевые заказы **НЕ** связываются с новым профилем. Это сделано намеренно для простоты.

### Через сколько активируются бонусы за покупку?

**Ответ:**
Через **7 дней** после подтверждения заказа (было 14 дней).

### Что происходит при отмене первого заказа?

**Ответ:**
Приветственный бонус откатывается, флаг `has_received_welcome_bonus` сбрасывается в `FALSE`. Пользователь может получить бонус снова при следующем заказе.

---

## Автор
Claude Sonnet 4.5

## Дата
2025-12-24

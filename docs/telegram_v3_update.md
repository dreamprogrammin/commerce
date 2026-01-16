# Обновление функций Telegram для архитектуры v3

## Что изменилось

### Проблема

Миграция `20251218102032_clean_architecture_orders_v3.sql` разделила заказы на две таблицы:

- `orders` - для авторизованных пользователей (с бонусами)
- `guest_checkouts` - для гостевых заказов (без бонусов)

Старые функции работали только с таблицей `orders`.

### Решение

#### 1. SQL миграции

**`20251219060000_update_telegram_for_v3.sql`** - Обновление уведомлений

- ✅ Обновлена функция `notify_order_to_telegram()` для передачи информации о таблице
- ✅ Добавлена обработка ошибок (EXCEPTION блок)
- ✅ Созданы триггеры для обеих таблиц:
  - `trigger_notify_user_order` на `orders`
  - `trigger_notify_guest_checkout` на `guest_checkouts`

**`20251219060100_update_order_functions_for_v3.sql`** - Обновление управления заказами

- ✅ Обновлена функция `confirm_and_process_order(p_order_id, p_table_name)`
  - Поддержка обеих таблиц
  - Списание товаров со склада
  - Обработка бонусов только для пользователей
- ✅ Обновлена функция `cancel_order(p_order_id, p_table_name)`
  - Поддержка обеих таблиц
  - Возврат товаров на склад
  - Откат бонусных операций только для пользователей
- ✅ Новая функция `get_order_table_name(p_order_id)`
  - Автоматическое определение типа заказа

#### 2. TypeScript Edge Functions

**`notify-order-to-telegram/index.ts`** (обновлен)

- ✅ Добавлен параметр `table` в `OrderPayload`
- ✅ Добавлены новые интерфейсы:
  - `GuestCheckoutItem` - элемент гостевого заказа
  - `GuestCheckoutData` - данные гостевого заказа
- ✅ Реализована логика выбора таблицы на основе `payload.table`
- ✅ Данные из обеих таблиц преобразуются к единому формату `OrderData`
- ✅ URL кнопок управления включают параметр `table`

**`confirm-order/index.ts`** (обновлен)

- ✅ Добавлен параметр `table` в URL
- ✅ Автоматическое определение типа заказа через `get_order_table_name()`
- ✅ Вызов SQL функции с параметром `p_table_name`
- ✅ Отображение типа заказа в ответе

**`cancel-order/index.ts`** (обновлен)

- ✅ Добавлен параметр `table` в URL
- ✅ Автоматическое определение типа заказа через `get_order_table_name()`
- ✅ Вызов SQL функции с параметром `p_table_name`
- ✅ Корректная обработка возврата бонусов только для пользователей
- ✅ Отображение типа заказа в ответе

## Как работает

### 1. Создание заказа

```
Новый заказ → Триггер → notify_order_to_telegram()
    ↓
Передает { record, table: 'orders' | 'guest_checkouts' }
    ↓
Edge Function определяет таблицу
    ↓
Читает данные из нужной таблицы
    ↓
Формирует сообщение с кнопками (включая параметр table)
    ↓
Отправляет в Telegram
```

### 2. Подтверждение заказа

```
Клик на кнопку "✅ Подтвердить" в Telegram
    ↓
URL: /confirm-order?order_id=xxx&table=orders&secret=xxx
    ↓
Edge Function получает параметры
    ↓
Вызывает confirm_and_process_order(order_id, table_name)
    ↓
SQL функция:
  - Проверяет наличие товаров
  - Списывает со склада
  - Обрабатывает бонусы (если пользователь)
  - Меняет статус на 'confirmed'
    ↓
Возвращает результат в Telegram
```

### 3. Отмена заказа

```
Клик на кнопку "❌ Отменить" в Telegram
    ↓
URL: /cancel-order?order_id=xxx&table=orders&secret=xxx
    ↓
Edge Function получает параметры
    ↓
Вызывает cancel_order(order_id, table_name)
    ↓
SQL функция:
  - Возвращает товары на склад (если был confirmed)
  - Откатывает бонусы (если пользователь)
  - Меняет статус на 'cancelled'
    ↓
Возвращает результат в Telegram
```

## Структура данных

### Для гостевых заказов (`guest_checkouts`)

```typescript
{
  id, final_amount, created_at, delivery_method, payment_method,
  delivery_address, guest_name, guest_phone, guest_email, status,
  guest_checkout_items(quantity, product_id, price_per_item, product)
}
```

### Для пользовательских заказов (`orders`)

```typescript
{
  id, final_amount, created_at, delivery_method, payment_method,
  delivery_address, user_id, status, bonuses_awarded, bonuses_spent,
  profile(first_name, last_name, phone),
  order_items(quantity, product_id, product)
}
```

### Унифицированный формат (`OrderData`)

Оба типа заказов преобразуются к единому формату, где:

- Гостевые заказы получают `user_id = null`, `bonuses_* = 0`
- Пользовательские заказы получают `guest_* = null`

## Применение миграций

```bash
# Если используете Supabase CLI
supabase db reset

# Или примените миграции вручную
supabase db push
```

## Проверка

### 1. Проверка триггеров

```sql
SELECT
  trigger_name,
  event_object_table as table_name,
  action_timing || ' ' || event_manipulation as trigger_event
FROM information_schema.triggers
WHERE trigger_name IN ('trigger_notify_user_order', 'trigger_notify_guest_checkout')
ORDER BY event_object_table;
```

Должно вернуть 2 строки:

- `trigger_notify_guest_checkout` на `guest_checkouts`
- `trigger_notify_user_order` на `orders`

### 2. Проверка функций

```sql
SELECT
  routine_name,
  routine_type,
  data_type as return_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('confirm_and_process_order', 'cancel_order', 'get_order_table_name')
ORDER BY routine_name;
```

Должно вернуть 3 функции.

### 3. Тестирование

#### Создание гостевого заказа

```sql
SELECT public.create_guest_checkout(
  '[{"product_id": "xxx", "quantity": 1}]'::jsonb,
  '{"name": "Тест", "email": "test@test.com", "phone": "+7123456789"}'::jsonb,
  'pickup'
);
```

#### Создание пользовательского заказа

```sql
SELECT public.create_user_order(
  '[{"product_id": "xxx", "quantity": 1}]'::jsonb,
  'pickup',
  'cash',
  NULL,
  0
);
```

После создания заказа проверьте:

1. ✅ Пришло уведомление в Telegram
2. ✅ Есть кнопки "Подтвердить" и "Отменить"
3. ✅ Клик по кнопкам работает корректно

## Обратная совместимость

Все функции поддерживают обратную совместимость:

- Если `p_table_name` не указан, используется `'orders'` по умолчанию
- Если `payload.table` не указан, используется `'orders'` по умолчанию
- Старые вызовы без параметра `table` продолжат работать

## Особенности

### Бонусы

- ✅ Начисляются только для авторизованных пользователей (`orders`)
- ✅ Гостевые заказы не имеют бонусов
- ✅ При отмене заказа бонусы корректно откатываются

### Товары

- ✅ Списание со склада работает для обоих типов заказов
- ✅ Возврат на склад при отмене работает корректно
- ✅ Проверка наличия перед подтверждением

### Уведомления

- ✅ Единый формат сообщений для обоих типов
- ✅ Указание типа заказа (Гостевой/Пользовательский)
- ✅ Кнопки управления работают для обоих типов

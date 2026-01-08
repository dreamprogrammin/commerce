# 🔔 Supabase Realtime для мгновенного обновления остатков

## Проблема

После подтверждения заказа через Telegram товары списывались в БД, но пользователи видели старые остатки до истечения кеша (2-3 минуты).

## ✅ Решение: Supabase Realtime

Realtime подписки позволяют получать мгновенные уведомления об изменениях в БД и автоматически обновлять кеш.

---

## 🏗️ Архитектура

```
┌─────────────────┐
│  Telegram Bot   │
│  (Подтверждение)│
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│   Edge Function         │
│   confirm-order         │
│   ├─ UPDATE orders      │◄──┐
│   │  SET status='confirmed' │
│   └─ Списание товаров   │   │
└─────────────────────────┘   │
                              │
         ┌────────────────────┘
         │ Realtime Event
         │ (postgres_changes)
         ▼
┌─────────────────────────┐
│   Frontend              │
│   (useOrderRealtime)    │
│   ├─ Получить событие   │
│   ├─ invalidateAllProducts()
│   └─ Обновить UI       │
└─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   TanStack Query        │
│   ├─ Кеш инвалидирован  │
│   └─ Загрузить новые    │
│      остатки            │
└─────────────────────────┘
```

---

## 📦 Что было добавлено

### 1. Миграция БД

**Файл:** `supabase/migrations/20260108042735_enable_realtime_for_orders.sql`

```sql
-- Включаем Realtime для orders
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER TABLE orders REPLICA IDENTITY FULL;

-- Включаем Realtime для guest_checkouts
ALTER PUBLICATION supabase_realtime ADD TABLE guest_checkouts;
ALTER TABLE guest_checkouts REPLICA IDENTITY FULL;

-- Опционально: для products (прямые изменения админом)
ALTER PUBLICATION supabase_realtime ADD TABLE products;
ALTER TABLE products REPLICA IDENTITY FULL;
```

### 2. Композабл для подписок

**Файл:** `composables/useOrderRealtime.ts`

```typescript
export function useOrderRealtime() {
  const supabase = useSupabaseClient()
  const { invalidateAllProducts } = useProductCacheInvalidation()

  function subscribeToOrders() {
    supabase
      .channel('orders-realtime')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: 'status=eq.confirmed', // Только подтверждённые
      }, (payload) => {
        console.log('🔔 Order confirmed:', payload.new.id)
        invalidateAllProducts() // Обновить кеш
      })
      .subscribe()
  }

  function subscribeToGuestCheckouts() {
    // Аналогично для guest_checkouts
  }

  return {
    subscribeAll,
    unsubscribe,
  }
}
```

### 3. Интеграция в app.vue

**Файл:** `app.vue`

```vue
<script setup>
import { useOrderRealtime } from '@/composables/useOrderRealtime'

const { subscribeAll, unsubscribe } = useOrderRealtime()

onMounted(() => {
  subscribeAll() // Подписаться на все события
})

onUnmounted(() => {
  unsubscribe() // Отписаться при размонтировании
})
</script>
```

---

## 🎯 Как это работает

### Сценарий 1: Подтверждение заказа через Telegram

1. **Администратор** нажимает "Подтвердить" в Telegram
2. **Edge Function** `confirm-order` обновляет статус:
   ```sql
   UPDATE orders SET status = 'confirmed' WHERE id = '...'
   ```
3. **Триггер БД** списывает товары со склада:
   ```sql
   UPDATE products SET stock_quantity = stock_quantity - X
   ```
4. **Supabase Realtime** отправляет событие всем подписчикам:
   ```json
   {
     "event": "UPDATE",
     "table": "orders",
     "new": { "id": "...", "status": "confirmed" },
     "old": { "id": "...", "status": "pending" }
   }
   ```
5. **Frontend** получает событие и инвалидирует кеш:
   ```typescript
   invalidateAllProducts() // Кеш устарел
   ```
6. **TanStack Query** загружает свежие данные в фоне:
   ```typescript
   // Автоматически перезагружает товары
   ```
7. **UI обновляется** с новыми остатками ✅

### Сценарий 2: Прямое изменение товара админом

1. **Администратор** меняет цену в Supabase Dashboard
2. **Realtime событие** отправляется клиентам
3. **Frontend** инвалидирует кеш конкретного товара
4. **UI обновляется** с новой ценой

---

## 🔧 Использование

### Базовое использование (уже настроено в app.vue)

```typescript
// app.vue - подписка на все события
const { subscribeAll, unsubscribe } = useOrderRealtime()

onMounted(() => subscribeAll())
onUnmounted(() => unsubscribe())
```

### Выборочная подписка

```typescript
// Только заказы
const { subscribeToOrders } = useOrderRealtime()
subscribeToOrders()

// Только гостевые заказы
const { subscribeToGuestCheckouts } = useOrderRealtime()
subscribeToGuestCheckouts()

// Изменения товаров напрямую
const { subscribeToProducts } = useOrderRealtime()
subscribeToProducts()
```

### Кастомная обработка событий

```typescript
// Создать собственный обработчик
const supabase = useSupabaseClient()

supabase
  .channel('custom-channel')
  .on('postgres_changes', {
    event: '*', // Все события (INSERT, UPDATE, DELETE)
    schema: 'public',
    table: 'orders',
  }, (payload) => {
    console.log('Order changed:', payload)

    // Кастомная логика
    if (payload.eventType === 'DELETE') {
      // Заказ удалён
    }
  })
  .subscribe()
```

---

## 📊 Фильтры событий

### Фильтр по колонке

```typescript
supabase
  .channel('high-priority-orders')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'orders',
    filter: 'total_amount=gte.100000', // Заказы > 100,000 ₸
  }, handleEvent)
  .subscribe()
```

### Фильтр по нескольким условиям

```typescript
// Только подтверждённые заказы от конкретного пользователя
filter: 'status=eq.confirmed&user_id=eq.abc-123'
```

### Операторы фильтров

| Оператор | Описание | Пример |
|----------|----------|--------|
| `eq` | Равно | `status=eq.confirmed` |
| `neq` | Не равно | `status=neq.cancelled` |
| `gt` | Больше | `total_amount=gt.50000` |
| `gte` | Больше или равно | `stock_quantity=gte.10` |
| `lt` | Меньше | `discount=lt.30` |
| `lte` | Меньше или равно | `price=lte.5000` |

---

## 🚨 Важные моменты

### 1. Realtime работает только на активных вкладках

```typescript
// ❌ Не будет получать события в фоновой вкладке
// ✅ События получает только активная вкладка
```

**Решение:** Проверять свежесть данных при возврате на вкладку:

```typescript
refetchOnWindowFocus: true // В TanStack Query
```

### 2. Права доступа (RLS)

Realtime события **соблюдают RLS политики**:

```sql
-- Пользователи видят только свои заказы
CREATE POLICY "Users see own orders"
ON orders FOR SELECT
USING (auth.uid() = user_id);
```

Если RLS запрещает чтение → событие **не придёт**.

### 3. Лимиты Supabase

- **Free Plan:** 200 одновременных подключений
- **Pro Plan:** 500 одновременных подключений

**Оптимизация:**
- Использовать один канал для нескольких событий
- Отписываться при размонтировании компонентов
- Не создавать дубликаты подписок

---

## 🐛 Отладка

### Проверить подключение

```typescript
supabase
  .channel('test-channel')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
  }, (payload) => {
    console.log('✅ Realtime работает:', payload)
  })
  .subscribe((status, err) => {
    console.log('Status:', status) // SUBSCRIBED, CLOSED, CHANNEL_ERROR
    if (err) console.error('Error:', err)
  })
```

### Логи в консоли

При правильной настройке вы увидите:

```
🔔 Subscribing to orders realtime updates...
✅ Subscribed to orders channel
🔔 Order confirmed (realtime): abc-123-def
✅ Product stocks updated (order confirmed)
🔄 Invalidated ALL product caches
```

### Проверить публикацию в БД

```sql
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime';
```

Должно показать:
- `public.orders`
- `public.guest_checkouts`
- `public.products`

### Тестирование

```sql
-- Вручную обновить заказ
UPDATE orders
SET status = 'confirmed'
WHERE id = 'test-order-id';

-- Должно прийти событие на клиент
```

---

## 🎨 UI индикация обновления

### Показать тост при обновлении

```typescript
import { toast } from 'vue-sonner'

supabase
  .channel('orders-realtime')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: 'status=eq.confirmed',
  }, (payload) => {
    invalidateAllProducts()

    // Показать уведомление
    toast.info('Остатки товаров обновлены', {
      description: `Заказ №${payload.new.id.slice(-6)} подтверждён`
    })
  })
  .subscribe()
```

### Индикатор синхронизации

```vue
<template>
  <div class="fixed bottom-4 right-4">
    <div v-if="isRealtimeConnected" class="flex items-center gap-2 px-3 py-2 bg-green-100 rounded-lg">
      <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
      <span class="text-sm text-green-700">Синхронизация активна</span>
    </div>
  </div>
</template>

<script setup>
const isRealtimeConnected = ref(false)

supabase
  .channel('status')
  .subscribe((status) => {
    isRealtimeConnected.value = status === 'SUBSCRIBED'
  })
</script>
```

---

## 📈 Производительность

### Оптимизация подписок

```typescript
// ✅ Правильно - один канал для нескольких событий
const channel = supabase
  .channel('all-updates')
  .on('postgres_changes', { table: 'orders', event: 'UPDATE' }, handleOrders)
  .on('postgres_changes', { table: 'products', event: 'UPDATE' }, handleProducts)
  .subscribe()

// ❌ Неправильно - несколько каналов
const channel1 = supabase.channel('orders').on(...).subscribe()
const channel2 = supabase.channel('products').on(...).subscribe()
```

### Дебаунс обновлений

```typescript
import { debounce } from 'lodash-es'

const debouncedInvalidate = debounce(() => {
  invalidateAllProducts()
}, 500) // Максимум раз в 500мс

supabase
  .channel('orders-realtime')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
  }, () => {
    debouncedInvalidate() // Дебаунс для массовых обновлений
  })
  .subscribe()
```

---

## ✅ Итоговый workflow

1. **Администратор** подтверждает заказ через Telegram
2. **Edge Function** обновляет БД (статус → confirmed)
3. **Триггер БД** списывает товары
4. **Realtime** отправляет событие клиентам (< 100ms)
5. **Frontend** инвалидирует кеш
6. **TanStack Query** загружает свежие данные
7. **Пользователи** видят актуальные остатки мгновенно ✅

**Результат:**
- ⚡ Мгновенное обновление (< 1 секунды)
- 🎯 Минимум запросов к БД
- 🚀 Масштабируемость
- ✅ Актуальные данные всегда

---

## 📚 Дополнительные ресурсы

- [Supabase Realtime Docs](https://supabase.com/docs/guides/realtime)
- [Realtime Filters](https://supabase.com/docs/guides/realtime/postgres-changes#available-filters)
- [Realtime Quotas](https://supabase.com/docs/guides/platform/going-into-prod#realtime-quotas)

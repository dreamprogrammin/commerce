# Checkout Stepper & Order Tracking

## Обзор

Реализован единый Layout-процесс для оформления заказа с визуальным прогрессом (Kaspi-style UX).

## Компоненты

### 1. layouts/Checkout.vue

Лейаут с горизонтальным степпером для страниц:
- `/cart` → Шаг 1 (Корзина)
- `/checkout` → Шаг 2 (Оформление)
- `/order/success/*` → Шаг 3 (Готово)

Степпер автоматически синхронизируется с текущим роутом.

### 2. components/order/OrderTracker.vue

Вертикальный степпер для отслеживания статуса заказа с realtime обновлениями:

**Статусы:**
- `new` → Заказ создан
- `confirmed` → Заказ подтвержден
- `shipped` → Заказ отправлен
- `delivered` → Заказ доставлен

**Realtime:** Подписка на изменения в таблице `orders` через Supabase Realtime.

## Использование

### Страницы с checkout layout

```vue
definePageMeta({ layout: 'checkout' })
```

### OrderTracker

```vue
<OrderTracker
  :order-id="orderId"
  :initial-status="orderStatus"
/>
```

## Технические детали

- **UI компоненты:** Stepper из shadcn-nuxt (radix-vue)
- **Иконки:** lucide-vue-next
- **Realtime:** Supabase postgres_changes
- **Адаптивность:** Скрытие текста на мобильных (sm:block)

## Преимущества

✅ Снижение процента брошенных корзин  
✅ Понятный прогресс оформления заказа  
✅ Realtime обновления статуса  
✅ Единый UX на всех этапах покупки

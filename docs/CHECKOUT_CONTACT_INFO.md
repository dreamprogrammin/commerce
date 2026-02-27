# Фича: Автосохранение контактов при оформлении заказа

## Дата

2026-02-27

## Проблема

1. **Телефон в Telegram**: уведомления получали номер через JOIN к `profiles`, что создавало race condition — если профиль обновлялся одновременно с созданием заказа, номер мог оказаться пустым.
2. **Имя в профиле**: пользователи с именем `'Гость'` (Google OAuth без имени) не получали обновления имени при оформлении заказа, хотя вводили его в форму.

## Что сделано

### ШАГ 1: Миграция `20260227000002_checkout_contact_info.sql`

**Таблица `orders`** — добавлены колонки:
```sql
customer_name  TEXT  -- имя получателя из формы чекаута
customer_phone TEXT  -- телефон получателя из формы чекаута
```

**RPC `create_user_order`** — новые параметры (с DEFAULT NULL для обратной совместимости):
```sql
p_contact_name  TEXT DEFAULT NULL
p_contact_phone TEXT DEFAULT NULL
```

Логика внутри функции:
- Контакты сохраняются прямо в строку заказа (`customer_name`, `customer_phone`)
- `profiles.phone` обновляется **только если** он `NULL` или пустой
- `profiles.first_name` обновляется **только если** он `NULL` или `'Гость'`

### ШАГ 2: Frontend

**`types/type.ts`** — расширен `ICheckoutData`:
```typescript
export interface ICheckoutData {
  // ...
  contactName?: string   // имя из формы чекаута
  contactPhone?: string  // телефон из формы чекаута
}
```

**`stores/publicStore/cartStore.ts`** — передача в RPC:
```typescript
p_contact_name: orderData.contactName || null,
p_contact_phone: orderData.contactPhone || null,
```

**`pages/checkout.vue`** — передача из формы:
```typescript
await cartStore.checkout({
  // ...
  contactName: isLoggedIn.value ? orderForm.value.name.trim() || undefined : undefined,
  contactPhone: isLoggedIn.value ? formattedPhone : undefined,
})
```

### ШАГ 3: Telegram Edge Function

**`notify-order-to-telegram/index.ts`** — приоритет источников контактов:

```
Имя:    order.customer_name  →  profile.first_name + last_name  →  guest_name  →  'Не указано'
Телефон: order.customer_phone  →  profile.phone  →  guest_phone  →  'Не указан'
```

`OrderData` interface обновлён, SELECT-запрос к `orders` включает `customer_name, customer_phone`.

## Важные ограничения

- Контакты из заказа НЕ перезаписывают уже заполненный профиль — только заполняют пустые поля
- `first_name` обновляется только с `'Гость'` / `NULL` → реальное имя из формы
- Для **гостевых заказов** ничего не меняется — они используют `guest_name`/`guest_phone`

## После применения

Применить миграцию на production:
```bash
supabase db push
```

Edge функция уже задеплоена.

## Тест

1. Зарегистрируйтесь через Google (профиль получит `first_name = 'Гость'`, `phone = NULL`)
2. Оформите заказ, заполнив имя и телефон в форме
3. Убедитесь:
   - В `orders` есть `customer_name` и `customer_phone`
   - В `profiles` обновились `first_name` и `phone`
   - Telegram-уведомление показывает правильные имя и номер
4. Оформите второй заказ с другим именем
5. Убедитесь, что `profiles.first_name` НЕ изменился (имя уже не 'Гость')

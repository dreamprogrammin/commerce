# Умные уведомления v2

Дата: 2026-02-25

## Обзор

Пять новых фич умных уведомлений, работающих через существующий пайплайн:
`INSERT в notifications` → триггер `trigger_telegram_on_notification` → edge function `send-user-telegram` (с magic link кнопками).

---

## 1. Cross-sell + Сгорающий промокод в брошенной корзине

### Как работает

При **24-часовом** напоминании о брошенной корзине (функция `check_abandoned_carts()`):

1. Собираются аксессуары товаров из корзины через `products.accessory_ids`
2. Генерируется персональный промокод формата `TG5-XXXXX` (5 hex символов)
3. Промокод: **5% скидка, действует 2 часа**, привязан к пользователю

**Пример сообщения в Telegram:**

```
🔥 Не забудьте про корзину!
Конструктор LEGO City ждёт вас! Сумма: 15 000 ₸
Не забудьте: Батарейки AA, Подарочная упаковка.
🎁 Ваш промокод: TG5-A3F2B (скидка 5%, действует 2 часа)
```

1-часовое напоминание — без изменений (как раньше, с фото и magic link).

### Промокоды на checkout

На странице оформления заказа добавлен блок «Промокод»:

- Поле ввода + кнопка «Применить»
- Валидация через RPC `validate_promo_code(code, order_amount)` → проверяет срок, лимит использований, минимальную сумму, привязку к пользователю
- После применения показывается зелёный блок с кодом и суммой скидки
- Скидка отображается в sidebar заказа отдельной строкой
- Промокод передаётся в `create_user_order` / `create_guest_checkout` через параметр `p_promo_code`

### Таблица `promo_codes`

| Колонка          | Тип         | Описание                                            |
| ---------------- | ----------- | --------------------------------------------------- |
| id               | UUID        | PK                                                  |
| code             | TEXT UNIQUE | Код промокода (хранится в UPPER)                    |
| user_id          | UUID NULL   | NULL = универсальный, иначе привязан к пользователю |
| discount_percent | NUMERIC     | Процент скидки (1-100)                              |
| min_order_amount | NUMERIC     | Минимальная сумма заказа (по умолчанию 0)           |
| max_uses         | INTEGER     | Макс. число использований (по умолчанию 1)          |
| uses_count       | INTEGER     | Текущее число использований                         |
| expires_at       | TIMESTAMPTZ | Срок действия                                       |
| used_at          | TIMESTAMPTZ | Дата последнего использования                       |

**Cron**: каждый час удаляются промокоды, истёкшие более 7 дней назад.

### Файлы

| Файл                                                           | Что сделано                                              |
| -------------------------------------------------------------- | -------------------------------------------------------- |
| `supabase/migrations/20260225000000_promo_codes.sql`           | Таблица, RLS, validate_promo_code(), cron                |
| `supabase/migrations/20260225000001_order_functions_promo.sql` | create_user_order + create_guest_checkout с p_promo_code |
| `supabase/migrations/20260225000002_cart_crosssell_promo.sql`  | check_abandoned_carts() с cross-sell + промокод          |
| `stores/publicStore/promoCodeStore.ts`                         | Pinia store: validateCode(), clearCode()                 |
| `pages/checkout.vue`                                           | UI блок промокода, скидка в sidebar                      |
| `stores/publicStore/cartStore.ts`                              | p_promo_code в RPC вызовах                               |
| `types/type.ts`                                                | promoCode в ICheckoutData                                |

---

## 2. Wishlist-уведомления

### Как работает

Триггер `notify_wishlist_on_product_change()` на таблице `products` (AFTER UPDATE OF price, discount_percentage, stock_quantity):

**Снижение цены:**

- Если `new_final_price < old_final_price`
- Всем пользователям с этим товаром в wishlist
- Тип: `price_drop`

```
📉 Цена снижена!
Конструктор LEGO City теперь 12 000 ₸ (было 15 000 ₸)
```

**Мало на складе:**

- Если `old_stock > 3 AND new_stock <= 3 AND new_stock > 0`
- Тип: `low_stock`

```
⚠️ Товар заканчивается!
Конструктор LEGO City — осталось 2 шт. Успейте купить!
```

Telegram-уведомление с magic link отправляется автоматически через существующий триггер `trigger_telegram_on_notification`.

### Файлы

| Файл                                                            | Что сделано                                 |
| --------------------------------------------------------------- | ------------------------------------------- |
| `supabase/migrations/20260225010000_wishlist_notifications.sql` | Триггер notify_wishlist_on_product_change() |

Frontend-изменений не требуется — уведомления попадают в существующий пайплайн.

---

## 3. Back in Stock

### Как работает

1. Пользователь видит товар с `stock_quantity = 0`
2. Вместо disabled кнопки «Нет в наличии» показывается кнопка **«Сообщить о поступлении»**
3. При клике вызывается `toggle_stock_alert(product_id)` — создаёт/удаляет запись в `stock_alerts`
4. Когда админ пополняет склад (`stock_quantity: 0 → N`), триггер `notify_back_in_stock()`:
   - Создаёт уведомление каждому подписчику
   - Удаляет все подписки на этот товар (одноразовые)

```
🎉 Товар снова в наличии!
Конструктор LEGO City снова доступен для заказа!
```

### Таблица `stock_alerts`

| Колонка    | Тип         | Описание                           |
| ---------- | ----------- | ---------------------------------- |
| user_id    | UUID        | FK → profiles (часть composite PK) |
| product_id | UUID        | FK → products (часть composite PK) |
| created_at | TIMESTAMPTZ | Дата подписки                      |

### Файлы

| Файл                                                   | Что сделано                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------- |
| `supabase/migrations/20260225020000_back_in_stock.sql` | Таблица, RLS, toggle_stock_alert(), триггер                    |
| `stores/publicStore/stockAlertsStore.ts`               | Pinia store: fetchSubscriptions(), toggleAlert(), isSubscribed |
| `components/product/StockAlertButton.vue`              | Кнопка с toggle-состоянием                                     |
| `pages/catalog/products/[slug].vue`                    | Замена disabled кнопки на StockAlertButton                     |

---

## 4. День рождения ребёнка

### Как работает

Cron `check_birthday_notifications()` запускается **ежедневно в 09:00 UTC**:

1. Ищет детей в таблице `children` с днём рождения через 7 дней
2. Дедупликация: проверяет, не было ли `birthday_reminder` для этого пользователя в текущем году
3. Подбирает 3 популярных товара по возрасту (`min_age_years/max_age_years`) и полу ребёнка
4. Начисляет **1000 активных бонусов** (сразу доступны, без pending)
5. Создаёт уведомление с рекомендациями подарков

```
🎂 Скоро день рождения!
Через 7 дней Артёму исполнится 5 лет!
Идеи подарков: Конструктор LEGO, Робот-трансформер, Набор красок.
🎁 Вам начислено 1000 бонусов!
```

### Бонусная транзакция

- `transaction_type = 'birthday'`
- `status = 'completed'`
- `amount = 1000`
- Описание: «Бонусы ко дню рождения {имя} ({N} лет)»

### Файлы

| Файл                                                            | Что сделано                                             |
| --------------------------------------------------------------- | ------------------------------------------------------- |
| `supabase/migrations/20260225030000_birthday_notifications.sql` | check_birthday_notifications(), cron, constraint update |
| `pages/profile/bonuses/index.vue`                               | birthday в display maps (иконка Cake, зелёный цвет)     |

---

## 5. Сгорание бонусов

### Как работает

**Новая колонка:** `bonus_transactions.expires_at` — дата сгорания бонусов.

**Жизненный цикл:**

1. Бонусы активируются (`activation`, `welcome`, `review`, `birthday`) → `expires_at = now() + 90 days`
2. За 3 дня до сгорания: предупреждение через `check_expiring_bonuses()` (cron 08:00 UTC)
3. После истечения: списание через `expire_bonuses()` (cron 02:00 UTC)

**Предупреждение (за 3 дня):**

```
⏳ Бонусы скоро сгорят!
У вас 500 бонусов сгорит через 3 дня. Используйте их!
```

**Сгорание:**

```
💔 Бонусы сгорели
500 бонусов сгорело. Используйте оставшиеся бонусы вовремя!
```

### Процесс списания (`expire_bonuses()`)

1. Находит `bonus_transactions` где `expires_at < now()`, `status = 'completed'`, `amount > 0`
2. Группирует по `user_id`
3. Уменьшает `profiles.active_bonus_balance` (не ниже 0)
4. Помечает исходные транзакции как `status = 'cancelled'`
5. Создаёт транзакцию `type = 'expiration'` с отрицательным amount
6. Создаёт уведомление `bonus_expired`

### Обновлённые функции

`activate_pending_bonuses()` и `activate_my_pending_bonuses()` теперь при INSERT activation-транзакции проставляют `expires_at = now() + 90 days`.

Существующие completed транзакции (activation/welcome/review/birthday) получили `expires_at = created_at + 90 days` через миграцию.

### Файлы

| Файл                                                      | Что сделано                                            |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `supabase/migrations/20260225040000_bonus_expiration.sql` | expires_at, обновлённые функции, cron задачи           |
| `pages/profile/bonuses/index.vue`                         | expiration в display maps (иконка Timer, красный цвет) |

---

## Constraint bonus_transactions_transaction_type_check

Финальный список допустимых типов:

```sql
'earned', 'spent', 'welcome', 'refund_spent', 'refund_earned',
'activation', 'review', 'birthday', 'expiration'
```

Constraint обновляется в двух миграциях:

- `20260225030000` — добавляет `birthday`
- `20260225040000` — добавляет `expiration` (финальная версия)

---

## Проверка

### Промокод

1. Вручную вызвать `SELECT check_abandoned_carts()` (или подождать 24ч)
2. Проверить промокод в Telegram
3. Ввести промокод на checkout → проверить скидку
4. Проверить что промокод нельзя использовать повторно / после истечения

### Cross-sell

1. Добавить в корзину товар с `accessory_ids`
2. Вызвать `check_abandoned_carts()` вручную
3. Проверить текст аксессуаров в 24ч уведомлении

### Wishlist — снижение цены

1. Добавить товар в избранное
2. В админке снизить цену или увеличить discount_percentage
3. Проверить уведомление `price_drop`

### Wishlist — мало на складе

1. Товар в избранном с stock > 3
2. Уменьшить stock до 2
3. Проверить уведомление `low_stock`

### Back in Stock

1. Найти товар с stock = 0
2. На странице товара нажать «Сообщить о поступлении»
3. В админке поставить stock = 5
4. Проверить уведомление + удаление подписки из stock_alerts

### День рождения

1. Добавить ребёнка с birth_date = current_date + 7 дней
2. Вызвать `SELECT check_birthday_notifications()`
3. Проверить уведомление + 1000 бонусов на балансе

### Сгорание бонусов

1. Вставить bonus_transaction с `expires_at = now() + interval '3 days 1 hour'`
2. Вызвать `SELECT check_expiring_bonuses()` → проверить предупреждение
3. Обновить `expires_at = now() - interval '1 hour'`
4. Вызвать `SELECT expire_bonuses()` → проверить списание + уведомление

# Настройка Telegram-уведомлений и рассылки

## Что реализовано

### Для пользователей
- Привязка Telegram-аккаунта через бота
- Личные уведомления о смене статуса заказа (в обработке, подтверждён, отправлен, доставлен, отменён)
- Уведомления о начислении бонусов
- Уведомления работают по 3 каналам одновременно: in-app + Web Push + Telegram

### Для админов
- Массовая Telegram-рассылка всем подписчикам
- История рассылок с статистикой

---

## Пошаговая настройка

### Шаг 1: Применить миграцию БД

```bash
supabase db push
```

Миграция `20260221000001_user_notifications_and_telegram.sql` создаёт:
- Колонку `telegram_chat_id` в `profiles`
- Таблицу `telegram_link_codes` (временные коды привязки)
- Таблицу `telegram_broadcasts` (история рассылок)
- Триггеры для автоматических уведомлений

### Шаг 2: Задеплоить Edge Functions

```bash
supabase functions deploy telegram-webhook
supabase functions deploy send-user-telegram
supabase functions deploy send-broadcast
```

| Функция | Назначение |
|---------|-----------|
| `telegram-webhook` | Обрабатывает входящие сообщения от пользователей боту |
| `send-user-telegram` | Отправляет личное сообщение пользователю (вызывается триггером) |
| `send-broadcast` | Массовая рассылка от админа |

### Шаг 3: Зарегистрировать Webhook

Используем **существующего бота** (того же, что отправляет заказы в админский чат).

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/telegram-webhook"
```

Замените `<TELEGRAM_BOT_TOKEN>` на токен из `.env` / Supabase secrets.

Проверить что webhook установлен:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

### Шаг 4: Проверить username бота

В файле `components/profile/TelegramBanner.vue` и `components/profile/TelegramLinkButton.vue` захардкожен username бота:

```typescript
const BOT_USERNAME = 'uhti_kz_bot'
```

Если username вашего бота другой — замените в обоих файлах.

Узнать username бота:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getMe"
```

### Шаг 5: Перегенерировать типы (опционально)

После применения миграции можно обновить типы:

```bash
supabase gen types typescript --local > types/supabase.ts
```

Типы уже добавлены вручную, но после `db push` лучше перегенерировать для полной синхронизации.

---

## Проверка работоспособности

### 1. Привязка Telegram

1. Войдите на сайт → Профиль → Настройки
2. Нажмите «Подключить Telegram»
3. Откроется Telegram с ботом → нажмите «Начать»
4. Бот ответит: «Telegram успешно привязан»
5. Проверьте в БД: `profiles.telegram_chat_id` заполнен

### 2. Уведомления о заказах

1. Создайте заказ на сайте
2. В админском Telegram возьмите заказ в работу → подтвердите → доставьте
3. На каждом шаге пользователь должен получить:
   - In-app уведомление (колокольчик на сайте)
   - Web Push (если подписан)
   - Telegram сообщение (если привязан)

### 3. Уведомления о бонусах

1. Создайте заказ (у товаров должны быть бонусные баллы)
2. Пользователь получит уведомление: «+N бонусов будут доступны через 14 дней»

### 4. Рассылка

1. Откройте админку → Рассылка (`/admin/broadcast`)
2. Введите текст → Отправить
3. Все пользователи с привязанным Telegram получат сообщение

### 5. Отмена заказа

1. Отмените заказ (из админки или пользователем)
2. Пользователь получит уведомление: «Ваш заказ отменён»

---

## Архитектура уведомлений

```
Событие (смена статуса / бонусы)
    ↓
Триггер БД → INSERT в notifications
    ↓ (3 параллельных триггера)
    ├── 1. Realtime → in-app (notificationsStore)
    ├── 2. trigger_push_on_notification → send-push-notification → Web Push
    └── 3. trigger_telegram_on_notification → send-user-telegram → Telegram API
```

Все уведомления создаются через одну точку входа — таблицу `notifications`. Триггеры автоматически рассылают по всем каналам.

---

## Команды бота

| Команда | Что делает |
|---------|-----------|
| `/start {код}` | Привязка аккаунта (код из ссылки на сайте) |
| `/start` | Приветствие + инструкция |
| `/unlink` | Отвязка Telegram от аккаунта |

---

## Файлы

### Backend
| Файл | Назначение |
|------|-----------|
| `supabase/migrations/20260221000001_*.sql` | Миграция: таблицы + триггеры |
| `supabase/functions/telegram-webhook/index.ts` | Webhook бота |
| `supabase/functions/send-user-telegram/index.ts` | Отправка личных сообщений |
| `supabase/functions/send-broadcast/index.ts` | Массовая рассылка |

### Frontend
| Файл | Назначение |
|------|-----------|
| `components/profile/TelegramBanner.vue` | Баннер «Подпишитесь на Telegram» |
| `components/profile/TelegramLinkButton.vue` | Кнопка привязки/отвязки в настройках |
| `stores/adminStore/adminBroadcastStore.ts` | Стор для рассылки |
| `pages/admin/broadcast.vue` | Страница рассылки в админке |

### Изменённые файлы
| Файл | Что изменено |
|------|-------------|
| `pages/profile/index.vue` | Добавлен TelegramBanner |
| `pages/profile/settings/index.vue` | Добавлен TelegramLinkButton |
| `pages/order/success/[id].vue` | Добавлен TelegramBanner |
| `layouts/Admin.vue` | Ссылка «Рассылка» в навигации |
| `types/supabase.ts` | Типы для новых таблиц и колонок |

---

## Возможные проблемы

### Webhook не работает
```bash
# Проверить статус
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Посмотреть логи функции
supabase functions logs telegram-webhook
```

### Пользователь не получает сообщения
1. Проверьте `profiles.telegram_chat_id` в БД
2. Проверьте логи: `supabase functions logs send-user-telegram`
3. Пользователь мог заблокировать бота (ошибка 403 — chat_id автоматически очищается при рассылке)

### Триггеры не срабатывают
```sql
-- Проверить что триггеры существуют
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%telegram%' OR trigger_name LIKE '%order_status%';
```

### Код привязки истёк
Код действует 10 минут. Пользователю нужно нажать «Подключить Telegram» заново.

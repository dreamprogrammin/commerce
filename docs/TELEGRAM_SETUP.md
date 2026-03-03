# Настройка Telegram-бота и уведомлений

## Обзор

Бот `@babyShopOfficialStoreKz_bot` выполняет 3 роли:

| Роль | Описание |
|------|----------|
| Привязка аккаунта | Связь Telegram с профилем на сайте (двусторонняя) |
| Уведомления пользователей | Статусы заказов, бонусы, акции |
| Рассылка от админа | Массовые сообщения всем подписчикам |

---

## Архитектура

### Edge Functions

| Функция | JWT | Назначение |
|---------|-----|-----------|
| `telegram-webhook` | off | Входящие сообщения от пользователей боту |
| `send-user-telegram` | off | Личные уведомления (вызывается триггером БД) |
| `send-broadcast` | off | Массовая рассылка от админа |
| `notify-order-to-telegram` | off | Уведомление в админский чат о новом заказе |

### Таблицы БД

| Таблица | Назначение |
|---------|-----------|
| `profiles.telegram_chat_id` | Chat ID привязанного Telegram |
| `telegram_link_codes` | Временные коды привязки (сайт → бот) |
| `telegram_reverse_links` | Обратные коды привязки (бот → сайт) |
| `telegram_broadcasts` | История рассылок |

### Потоки привязки

**Вариант 1: Сайт → Telegram (через deep link)**

```
Пользователь на сайте → "Подключить Telegram"
    ↓
Создаётся код в telegram_link_codes (10 минут)
    ↓
Открывается t.me/babyShopOfficialStoreKz_bot?start={код}
    ↓
Бот получает /start {код} → находит код → привязывает chat_id к профилю
    ↓
✅ Telegram привязан
```

**Вариант 2: Telegram → Сайт (one-click, обратная привязка)**

```
Пользователь нажимает START в боте
    ↓
Бот создаёт код в telegram_reverse_links (10 минут)
    ↓
Показывает кнопку "Привязать аккаунт" → uhti.kz/telegram-link?code={код}
    ↓
Страница вызывает RPC link_telegram_by_code → привязывает chat_id
    ↓
✅ Telegram привязан (если пользователь залогинен)
```

### Поток уведомлений

```
Событие (смена статуса заказа / начисление бонусов)
    ↓
Триггер БД → INSERT в notifications
    ↓ (3 параллельных канала)
    ├── 1. Realtime → in-app (колокольчик)
    ├── 2. trigger_push_on_notification → Web Push
    └── 3. trigger_telegram_on_notification → send-user-telegram → Telegram API
```

---

## Первоначальная настройка

### Шаг 1: Секреты Supabase

В Supabase Dashboard → Settings → Edge Functions → Secrets:

```
TELEGRAM_BOT_TOKEN=<токен бота от @BotFather>
TELEGRAM_CHAT_ID=<chat_id админского чата для уведомлений о заказах>
```

### Шаг 2: Применить миграции

```bash
supabase db push
```

Ключевые миграции:
- `20260221000001_user_notifications_and_telegram.sql` — telegram_link_codes, telegram_broadcasts, триггеры
- `20260221120000_skip_telegram_for_offline_sales.sql` — оффлайн продажи не падают в Telegram
- `20260222230000_telegram_reverse_link.sql` — telegram_reverse_links, RPC link_telegram_by_code

### Шаг 3: Деплой Edge Functions

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy send-user-telegram --no-verify-jwt
supabase functions deploy send-broadcast --no-verify-jwt
supabase functions deploy notify-order-to-telegram --no-verify-jwt
```

### Шаг 4: Настройка бота (один раз)

Отправьте боту команду `/setup`. Бот автоматически:

- Зарегистрирует webhook URL
- Установит команды меню (/start, /unlink)
- Установит описание бота (видно перед START)
- Установит короткое описание (видно в поиске)

Бот ответит отчётом:

```
🔧 Setup complete:

Webhook: ✅ Webhook was set
Commands: ✅
Description: ✅
Short desc: ✅
```

> **Важно:** `/setup` нужно вызвать только один раз. Повторный вызов безопасен, но не нужен.

### Шаг 5: Установка стикера приветствия

1. Найдите нужный стикер (например "машет привет")
2. Отправьте этот стикер боту
3. Бот ответит file_id стикера
4. Вставьте file_id в `WELCOME_STICKER` в `supabase/functions/telegram-webhook/index.ts`
5. Передеплойте: `supabase functions deploy telegram-webhook --no-verify-jwt`

```typescript
// supabase/functions/telegram-webhook/index.ts
const WELCOME_STICKER = 'CAACAgIAAxkBAAE...'  // ← вставить сюда
```

> Если file_id невалидный, бот отправит эмодзи 👋 вместо стикера (fallback).

---

## Команды бота

| Команда | Что делает |
|---------|-----------|
| `/start` | Приветствие: стикер + сообщение с кнопками (привязка, магазин) |
| `/start {код}` | Привязка аккаунта через deep link с сайта |
| `/unlink` | Отвязка Telegram от аккаунта |
| `/setup` | Одноразовая настройка бота (webhook, описание, команды) |
| Любой стикер | Бот ответит file_id стикера (для настройки WELCOME_STICKER) |

---

## Файлы проекта

### Backend

| Файл | Назначение |
|------|-----------|
| `supabase/functions/telegram-webhook/index.ts` | Webhook бота (v5) |
| `supabase/functions/send-user-telegram/index.ts` | Личные уведомления пользователю |
| `supabase/functions/send-broadcast/index.ts` | Массовая рассылка |
| `supabase/functions/notify-order-to-telegram/index.ts` | Уведомления о заказах в админский чат |
| `supabase/config.toml` | Конфиг функций (verify_jwt = false) |

### Frontend

| Файл | Назначение |
|------|-----------|
| `components/profile/TelegramBanner.vue` | Баннер "Подпишитесь на Telegram" (профиль, после заказа) |
| `components/profile/TelegramLinkButton.vue` | Кнопка привязки/отвязки в настройках профиля |
| `pages/telegram-link.vue` | Страница обратной привязки (бот → сайт) |
| `pages/admin/broadcast.vue` | Страница рассылки в админке |
| `stores/adminStore/adminBroadcastStore.ts` | Стор для рассылки |

### Миграции

| Файл | Назначение |
|------|-----------|
| `20260221000001_user_notifications_and_telegram.sql` | Основная миграция: таблицы + триггеры |
| `20260221120000_skip_telegram_for_offline_sales.sql` | Оффлайн продажи не уведомляют в Telegram |
| `20260222230000_telegram_reverse_link.sql` | Обратная привязка (бот → сайт) |

---

## Конфигурация в config.toml

Три Telegram-функции должны быть в `supabase/config.toml` с `verify_jwt = false`:

```toml
[functions.telegram-webhook]
enabled = true
verify_jwt = false
entrypoint = "./functions/telegram-webhook/index.ts"

[functions.send-user-telegram]
enabled = true
verify_jwt = false
entrypoint = "./functions/send-user-telegram/index.ts"

[functions.send-broadcast]
enabled = true
verify_jwt = false
entrypoint = "./functions/send-broadcast/index.ts"
```

> Без `verify_jwt = false` Telegram не сможет отправлять запросы — получите 401.

---

## Оффлайн продажи и Telegram

Оффлайн продажи (POS-касса) **не** отправляют уведомления в админский Telegram-чат, потому что администратор сам создал эту продажу.

Реализовано через проверку в триггерных функциях:

```sql
-- В notify_user_order_to_telegram() и notify_guest_checkout_to_telegram()
IF NEW.source = 'offline' THEN
  RETURN NEW;
END IF;
```

---

## Troubleshooting

### Webhook не работает

```bash
# Проверить статус webhook
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Логи функции
supabase functions logs telegram-webhook
```

Если webhook не установлен — отправьте `/setup` боту.

### /start не удаляется из чата

Бот вызывает `deleteMessage` для удаления команды `/start`. Ограничения Telegram:
- В приватном чате бот может удалять сообщения пользователя только в течение 48 часов
- Проверьте логи — должна быть строка `🗑 deleteMessage: chat_id=... message_id=...`

### Стикер не отправляется

1. Отправьте боту любой стикер → получите file_id
2. Обновите `WELCOME_STICKER` в коде
3. Передеплойте функцию

> file_id привязан к конкретному боту. Стикер от другого бота работать не будет.

### Пользователь не получает уведомления

1. Проверьте `profiles.telegram_chat_id` в БД
2. Проверьте логи: `supabase functions logs send-user-telegram`
3. Пользователь мог заблокировать бота (ошибка 403)

### Обратная привязка не работает

1. Проверьте что таблица `telegram_reverse_links` существует
2. Проверьте что RPC `link_telegram_by_code` создана:
   ```sql
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'link_telegram_by_code';
   ```
3. Код действует 10 минут — пользователь может не успеть
4. Страница `/telegram-link` требует авторизации — если не залогинен, покажет кнопку "Войти"

### Ошибка 429 (Rate Limiting)

В v5 убраны все вызовы Telegram API из холодного старта. Если видите 429 — значит запущена старая версия. Передеплойте:

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
```

### Триггеры не срабатывают

```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%telegram%' OR trigger_name LIKE '%order_status%';
```

---

## Логирование (v5)

Все операции логируются с эмодзи-префиксами:

| Префикс | Значение |
|---------|----------|
| `📩` | Входящее сообщение от Telegram |
| `💬` | Распарсенные данные (chat_id, text) |
| `🔗` | Начало привязки по коду |
| `👋` | Приветствие (без кода) |
| `🔓` | Отвязка аккаунта |
| `🔧` | Настройка бота (/setup) |
| `🎭` | Отправка стикера |
| `📤` | Отправка сообщения |
| `🗑` | Удаление сообщения |
| `🏠` | Приветственное сообщение (sendWelcome) |
| `✅` | Успешная операция |
| `❌` | Ошибка операции |

Просмотр логов:

```bash
supabase functions logs telegram-webhook --tail
```

---

## Уведомление с просьбой оставить отзыв

Когда заказ переходит в статус `delivered`, триггер `trigger_request_review_on_delivery` автоматически отправляет пользователю Telegram-уведомление:

| Поле | Значение |
|------|----------|
| Заголовок | `⭐ Оставьте отзыв и получите 500 бонусов!` |
| Текст | `Поделитесь впечатлениями о покупке — это поможет другим покупателям.` |
| Кнопка | `🔗 Открыть на сайте` → magic link на `/profile/order/{order_id}` |

Ссылка ведёт **прямо на страницу заказа** в профиле, где пользователь видит кнопку "Оставить отзыв" напротив каждого товара. Это устраняет необходимость самостоятельно искать форму отзыва.

> **Изменение (2026-03-03):** Ссылка изменена с `/catalog/products/{slug}#reviews` на `/profile/order/{order_id}` (миграция `20260303000001_review_notification_order_link.sql`). Конверсия в отзывы была близка к нулю из-за сложного пути: старая ссылка вела на страницу товара без прямого доступа к форме.

После публикации отзыва администратором пользователь получает второе уведомление: `🎁 Вам начислено 500 бонусов!` со ссылкой на `/profile/bonuses`.

---

## История версий

| Версия | Изменения |
|--------|----------|
| v1 | Базовый webhook: /start + привязка через deep link |
| v2 | Добавлены /unlink, стикер приветствия, HTML-сообщения |
| v3 | Поддержка v3 архитектуры (orders + guest_checkouts) |
| v4 | Холодный старт: setWebhook, setMyCommands, setMyDescription. Обратная привязка (бот → сайт) |
| v5 | Убран холодный старт (fix 429). Добавлена /setup. Plain text вместо Markdown. Подробное логирование |
| v6 | Ссылка review_request → /profile/order/{id} вместо /catalog/products/{slug} |

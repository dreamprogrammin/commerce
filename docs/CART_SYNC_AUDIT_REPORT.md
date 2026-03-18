# Аудит синхронизации корзины (Server-Sync & Abandoned Cart)

**Дата:** 18 марта 2026
**Статус:** Исправлено (фронтенд), требует проверки (бэкенд)

## Найденные баги и исправления

### Баг 1: Циклическая синхронизация при загрузке серверной корзины

**Проблема:** `watch` на `items` с `deep: true` (строка 285) вызывает `syncToServer()` при **любом** изменении массива, включая момент когда `mergeOnLogin()` записывает серверные данные в `items.value`. Это создаёт бесполезный цикл: загрузили с сервера → watch сработал → перезаписали на сервер те же данные.

**Исправление:** Добавлен флаг `isMergingFromServer`. Пока он `true`, `forceSyncToServer()` игнорирует вызовы. Флаг выставляется в `mergeOnLogin()` на время загрузки серверных данных.

### Баг 2: Двойной вызов `mergeOnLogin()`

**Проблема:** `mergeOnLogin()` вызывался дважды при логине:
1. В `app.vue` — через `watch(supabaseUser)` с `immediate: true`
2. В `plugins/auth-init.client.ts` — через `onAuthStateChange('SIGNED_IN')`

Race condition между двумя вызовами мог привести к конфликту при записи в `server_carts`.

**Исправление:** Убран вызов из `app.vue`. Оставлен только в `auth-init.client.ts`, который срабатывает один раз при событии `SIGNED_IN`.

### Баг 3: Отсутствие обработки ошибок в `forceSyncToServer()`

**Проблема:** `supabase.from('server_carts').upsert(...)` не проверял результат. Если upsert падал (RLS, сеть, constraint) — ошибка молча проглатывалась.

**Исправление:** Добавлена деструктуризация `{ error }` и `console.error` при ошибке.

### Баг 4: Промис без `await` в `clearCart()`

**Проблема:** `supabase.from('server_carts').upsert(...)` вызывался без `await`. Промис висел без обработки — ошибки не ловились, а порядок операций не гарантировался.

**Исправление:** Функция стала `async`, добавлен `await` и обработка ошибок.

## Что НЕ является багом (работает корректно)

### Sync flow
- `syncToServer()` — debounced 500ms, вызывается watch-ером на `items`
- `forceSyncToServer()` — сохраняет `{ product_id, quantity }[]` в JSONB + `total_amount` + сбрасывает `reminder_*_sent` флаги
- `loadServerCart()` — загружает JSONB, делает JOIN с `products` для полных данных + сортировка по `display_order`
- `mergeOnLogin()` — если локальная корзина есть → sync на сервер; если пустая → загрузить с сервера

### Abandoned cart cron
- `check_abandoned_carts()` — запускается каждые 30 минут через `pg_cron`
- 1ч напоминание: товары из корзины + фото + magic link
- 24ч напоминание: + cross-sell аксессуары + промокод `TG5-XXXXX` (5%, 2 часа)
- Фильтрация: `jsonb_array_length(items) > 0` + нет заказов после `updated_at`

### Edge Function `send-user-telegram`
- `verify_jwt = false` в `config.toml` — не требует Authorization
- Поддержка: одно фото, медиа-группа, fallback на текст
- Обработка блокировки бота (403)

## Требует проверки на prod

### 1. Verify JWT на продакшне

`config.toml` — локальная конфигурация. На Supabase Dashboard проверить:
- Edge Functions → `send-user-telegram` → JWT Verification → должен быть **OFF**
- Если ON — включить `--no-verify-jwt` при деплое:

```bash
supabase functions deploy send-user-telegram --no-verify-jwt
```

### 2. pg_cron активен?

Проверить в Supabase Dashboard → Database → Extensions:
- `pg_cron` должен быть включён
- Проверить задачи:

```sql
SELECT * FROM cron.job WHERE jobname = 'Abandoned Cart Reminders';
```

### 3. pg_net настроен?

```sql
SELECT * FROM extensions.pg_net_http_response ORDER BY created DESC LIMIT 10;
```

Если таблица пуста или содержит ошибки 401 — проблема в JWT.

### 4. `app.settings.supabase_url` настроен?

Функция использует `current_setting('app.settings.supabase_url', true)` для URL Edge Function. Проверить:

```sql
SELECT current_setting('app.settings.supabase_url', true);
```

Если NULL — cron не сможет вызвать Edge Function.

### 5. Тестовый вызов abandoned cart check

```sql
-- Вручную вызвать для проверки
SELECT public.check_abandoned_carts();

-- Или уменьшить интервал для тестирования (временно)
-- WHERE sc.updated_at < now() - interval '1 minute'
```

## Изменённые файлы

| Файл | Изменения |
|---|---|
| `stores/publicStore/cartStore.ts` | Флаг `isMergingFromServer`, error handling, async `clearCart` |
| `app.vue` | Убран дублирующий вызов `mergeOnLogin()` |

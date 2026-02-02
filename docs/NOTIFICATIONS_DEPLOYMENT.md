# Деплой системы уведомлений

## Проблема 401 Unauthorized

Если Edge Function возвращает 401 при вызове из триггера БД, это означает что секретный токен не совпадает.

## Быстрое решение

### 1. Применить миграции

```bash
supabase db reset
```

### 2. Установить секрет (опционально)

```bash
# Этот секрет используется для авторизации вызовов из триггера БД
supabase secrets set TRIGGER_SECRET=uhti-internal-trigger-2026
```

**Примечание:** Если не установить секрет, используется дефолтное значение `uhti-internal-trigger-2026` (hardcoded в коде).

### 3. Деплой Edge Functions

```bash
# Деплой функции уведомлений
supabase functions deploy notify-question-answered

# Проверить логи
supabase functions logs notify-question-answered --tail
```

### 4. Установить другие секреты

```bash
# Для отправки email
supabase secrets set RESEND_API_KEY=re_...

# URL сайта для ссылок в email
supabase secrets set SITE_URL=https://uhti.kz

# Для AI-генерации FAQ (опционально)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Проверить все секреты

```bash
supabase secrets list
```

Должны быть:

- ✅ `TRIGGER_SECRET` (или будет использован дефолт)
- ✅ `RESEND_API_KEY`
- ✅ `SITE_URL`
- ✅ `ANTHROPIC_API_KEY` (для AI FAQ)

## Тестирование

### 1. Задать вопрос

1. Войти на сайт
2. Открыть любой товар
3. Задать вопрос

### 2. Ответить на вопрос (админка)

1. Войти в админку
2. Открыть админ-панель вопросов (нужно создать страницу) ИЛИ напрямую через БД:

```sql
UPDATE product_questions
SET answer_text = 'Тестовый ответ'
WHERE id = 'question-uuid-here';
```

### 3. Проверить логи Edge Function

```bash
supabase functions logs notify-question-answered --tail
```

Должно быть:

```
Trigger secret validated successfully
Waiting 2 minutes before sending notification...
Delay complete, sending notification...
Resend response: { id: "..." }
```

### 4. Проверить уведомление

**Через 2 минуты:**

- In-app уведомление появится в колокольчике
- Email придёт на почту пользователя

## Troubleshooting

### Ошибка: "Invalid trigger secret"

**Причина:** Секрет в триггере не совпадает с секретом в Edge Function

**Решение:**

```bash
# Установить секрет
supabase secrets set TRIGGER_SECRET=uhti-internal-trigger-2026

# Передеплоить функцию
supabase functions deploy notify-question-answered
```

### Ошибка: "User email not found"

**Причина:** У пользователя нет email (OAuth без email scope)

**Решение:** Убедиться что OAuth провайдер возвращает email

### Email не приходит

**Причина:** RESEND_API_KEY не установлен или неверный

**Решение:**

```bash
# Проверить секреты
supabase secrets list

# Установить правильный ключ
supabase secrets set RESEND_API_KEY=re_...

# Передеплоить
supabase functions deploy notify-question-answered
```

### In-app уведомление приходит сразу (не через 2 минуты)

**Причина:** Старая версия Edge Function без задержки

**Решение:**

```bash
# Передеплоить последнюю версию
supabase functions deploy notify-question-answered
```

## Безопасность

### Почему hardcoded секрет?

Триггеры PostgreSQL **не могут безопасно получить env переменные** из Supabase Secrets.

Варианты решения:

1. ✅ **Текущий:** Hardcoded секрет в миграции (простой, работает)
2. ❌ **Vault:** `vault.decrypted_secrets` требует специальные права
3. ❌ **Config таблица:** Секрет в plaintext в БД (небезопасно)
4. ✅ **Database Webhooks:** Официальный способ (требует настройку через Dashboard)

### Миграция на Database Webhooks (будущее)

Если хотите использовать официальный способ:

1. Supabase Dashboard → Database → Webhooks
2. Создать webhook:
   - Table: `product_questions`
   - Events: `UPDATE`
   - Type: `HTTP Request`
   - URL: `https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-question-answered`
   - Headers: `Authorization: Bearer service_role_key_here`
3. Удалить триггер `on_question_answered`

## Изменение секрета

Если нужно изменить секрет на production:

### 1. Изменить в миграции

Файл: `supabase/migrations/20260128060100_add_question_answer_trigger.sql`

```sql
'trigger_secret', 'your-new-secret-here'  -- ← Изменить
```

### 2. Изменить в Edge Function

Файл: `supabase/functions/notify-question-answered/index.ts`

```typescript
const expectedSecret = Deno.env.get('TRIGGER_SECRET') || 'your-new-secret-here' // ← Изменить
```

### 3. Применить

```bash
supabase db reset
supabase secrets set TRIGGER_SECRET=your-new-secret-here
supabase functions deploy notify-question-answered
```

## Production Checklist

Перед деплоем на production:

- [ ] Все миграции применены (`supabase db push`)
- [ ] Edge Function задеплоена (`supabase functions deploy notify-question-answered`)
- [ ] Секреты установлены (`RESEND_API_KEY`, `SITE_URL`, `TRIGGER_SECRET`)
- [ ] Протестировано на staging
- [ ] Email домен верифицирован в Resend
- [ ] Логи не показывают ошибок

## Мониторинг

### Проверить статус уведомлений

```sql
-- Последние уведомления
SELECT * FROM notifications
ORDER BY created_at DESC
LIMIT 10;

-- Непрочитанные по пользователям
SELECT user_id, COUNT(*) as unread_count
FROM notifications
WHERE is_read = false
GROUP BY user_id;

-- Вопросы с ответами за последний день
SELECT pq.*, n.created_at as notification_sent_at
FROM product_questions pq
LEFT JOIN notifications n ON n.link LIKE '%#question-' || pq.id::text
WHERE pq.answer_text IS NOT NULL
  AND pq.answered_at > NOW() - INTERVAL '1 day'
ORDER BY pq.answered_at DESC;
```

### Логи Edge Function

```bash
# Real-time логи
supabase functions logs notify-question-answered --tail

# Последние 100 записей
supabase functions logs notify-question-answered --limit 100
```

# Инструкция: Настройка автогенерации alt-текстов на Vercel

## Вариант 1: Запуск локально (быстро, 2 минуты)

```bash
# 1. Обнови .env с продакшн credentials
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key

# 2. Запусти скрипт
npm run seo:generate

# 3. Деплой
git push
```

---

## Вариант 2: API endpoint + Vercel Cron (автоматизация)

### Шаг 1: Добавь переменную окружения в Vercel

1. Открой проект в Vercel Dashboard
2. Settings → Environment Variables
3. Добавь:
   - Name: `CRON_SECRET`
   - Value: `your-random-secret-key-123` (любая случайная строка)

### Шаг 2: Деплой

```bash
git add .
git commit -m "Add auto-generation API endpoint"
git push
```

### Шаг 3: Первый запуск вручную

```bash
curl -X POST https://your-site.vercel.app/api/generate-alt-texts \
  -H "Authorization: Bearer your-random-secret-key-123"
```

### Шаг 4: Автоматический запуск

Cron будет запускаться каждое воскресенье в 00:00 UTC.

Изменить расписание в `vercel.json`:
- `"0 0 * * 0"` - каждое воскресенье в полночь
- `"0 0 * * *"` - каждый день в полночь
- `"0 */6 * * *"` - каждые 6 часов

---

## Рекомендация

**Используй Вариант 1** для первого запуска (быстро и просто).

**Вариант 2** нужен только если:
- Добавляешь новые товары часто
- Хочешь автоматическое обновление alt-текстов

---

## Проверка

После запуска проверь в Supabase:

```sql
SELECT 
  COUNT(*) as total,
  COUNT(alt_text) as with_alt,
  COUNT(*) - COUNT(alt_text) as without_alt
FROM product_images;
```

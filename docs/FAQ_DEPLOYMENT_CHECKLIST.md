# Чеклист деплоя системы автогенерации FAQ

## Перед деплоем

- [ ] Получить API ключ Anthropic: https://console.anthropic.com/settings/keys
- [ ] Проверить баланс аккаунта Anthropic (минимум $5)
- [ ] Убедиться, что Supabase CLI установлен и настроен

## Автоматический деплой

```bash
# Установить API ключ
export ANTHROPIC_API_KEY=sk-ant-...

# Запустить скрипт деплоя
./scripts/deploy-faq-system.sh
```

Скрипт автоматически:

1. ✅ Установит секрет в Supabase
2. ✅ Применит миграции БД
3. ✅ Задеплоит Edge Function

## Ручной деплой (если скрипт не работает)

### 1. Установить секреты

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set SITE_URL=https://uhti.kz
```

### 2. Применить миграции

```bash
supabase db reset
```

### 3. Деплой Edge Function

```bash
supabase functions deploy generate-premium-questions
```

## Проверка работы

### 1. Тест SQL-генерации

В Supabase Studio → SQL Editor:

```sql
-- Тест для любого товара
SELECT generate_product_questions(
  (SELECT id FROM products LIMIT 1),
  true  -- skip_ai = true (без AI)
);

-- Проверить созданные вопросы
SELECT * FROM product_questions
WHERE is_auto_generated = true
ORDER BY created_at DESC
LIMIT 10;
```

✅ Должны появиться вопросы про доставку, возврат, возраст

### 2. Тест AI-генерации (для премиум товара)

```sql
-- Найти премиум товар
SELECT id, name, price FROM products
WHERE price > 50000 AND is_active = true
LIMIT 1;

-- Сгенерировать вопросы (с AI)
SELECT generate_product_questions(
  'product-uuid-here',
  false  -- skip_ai = false (с AI)
);
```

### 3. Проверить Edge Function

```bash
# Просмотр логов
supabase functions logs generate-premium-questions

# Ручной тест через curl
curl -X POST \
  'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/generate-premium-questions' \
  -H 'Authorization: Bearer <токен сессии АДМИНИСТРАТОРА — с анонимным ключом с 20.10.2026 будет 401>' \
  -H 'Content-Type: application/json' \
  -d '{
    "product_id": "uuid",
    "name": "Тестовый товар",
    "price": 60000,
    "description": "Описание",
    "brand": "LEGO",
    "category": "Конструкторы"
  }'
```

✅ Должен вернуться JSON с 3-4 вопросами

### 4. Тест через UI

1. Войти в админку → Товары
2. Выбрать премиум товар (> 50,000₸)
3. Нажать **"Сгенерировать FAQ"**
4. Подтвердить AI-генерацию
5. Подождать 5-10 секунд
6. Обновить страницу → Проверить вопросы

✅ Должны появиться базовые + AI-вопросы

## Troubleshooting

### Ошибка: "ANTHROPIC_API_KEY not set"

**Решение:**

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-premium-questions
# Без --no-verify-jwt: с 20.10.2026 функция только для администратора
# (verify_jwt = true в supabase/config.toml + проверка роли в самой функции).
```

### Ошибка: "AI generation failed"

**Возможные причины:**

1. Недостаточно средств в аккаунте Anthropic
2. Неверный API ключ
3. Rate limit (слишком много запросов)

**Проверка:**

```bash
# Просмотр логов Edge Function
supabase functions logs generate-premium-questions --tail

# Проверка секретов
supabase secrets list
```

### AI-вопросы не появляются

**Чеклист:**

- [ ] Цена товара > 50,000₸?
- [ ] `skip_ai = false` в RPC вызове?
- [ ] Edge Function задеплоен?
- [ ] API ключ установлен?
- [ ] Нет ошибок в логах?

### Базовые вопросы не создаются

**Возможно:**

- Миграция не применилась
- RPC функция не существует

**Проверка:**

```sql
-- Проверить существование функции
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'generate_product_questions';

-- Проверить таблицу
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'product_questions';
```

## После деплоя

### 1. Массовая генерация базовых вопросов

```
Админка → Товары → "Сгенерировать FAQ для всех"
```

Это создаст базовые вопросы для всех товаров (без AI).

### 2. Выборочная AI-генерация

Запустите AI-генерацию для топ-10 самых дорогих товаров:

```sql
-- Найти топ-10 премиум товаров
SELECT id, name, price FROM products
WHERE is_active = true AND price > 50000
ORDER BY price DESC
LIMIT 10;
```

Затем в админке генерируйте FAQ для каждого индивидуально.

### 3. Мониторинг стоимости

```sql
-- Сколько AI-вопросов сгенерировано
SELECT COUNT(*) as ai_questions_count
FROM product_questions
WHERE is_auto_generated = true
  AND product_id IN (
    SELECT id FROM products WHERE price > 50000
  );
```

**Примерная стоимость:** количество_вопросов / 3 × $0.02

### 4. A/B тестирование

Сравните конверсию на товарах с AI-вопросами vs без:

```sql
-- Товары с AI FAQ
SELECT p.id, p.name, p.sales_count
FROM products p
WHERE p.price > 50000
  AND EXISTS (
    SELECT 1 FROM product_questions pq
    WHERE pq.product_id = p.id AND pq.is_auto_generated = true
  );
```

## Откат (если что-то пошло не так)

### 1. Удалить все автовопросы

```sql
DELETE FROM product_questions WHERE is_auto_generated = true;
```

### 2. Удалить Edge Function

```bash
supabase functions delete generate-premium-questions
```

### 3. Откатить миграцию

```bash
# Удалить миграцию из папки
rm supabase/migrations/20260128070000_add_auto_generated_questions.sql

# Сбросить БД
supabase db reset
```

## Готово!

✅ Система автогенерации FAQ успешно развёрнута
✅ Базовые вопросы работают
✅ AI-генерация настроена

📖 **Документация:**

- Обзор: `/docs/FAQ_GENERATION_SUMMARY.md`
- Быстрый старт: `/docs/QUICK_START_FAQ.md`
- Полная: `/docs/AUTO_GENERATED_FAQ.md`

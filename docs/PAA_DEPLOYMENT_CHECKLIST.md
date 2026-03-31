# 🚀 Деплой PAA Optimization - Чеклист

## ✅ Что было сделано

### 1. База данных (2 миграции)

- ✅ `20260331051200_add_priority_order_to_questions.sql` - Добавлено поле priority_order
- ✅ `20260331051201_optimize_category_questions_for_paa.sql` - Оптимизирована функция генерации

### 2. Frontend (3 файла)

- ✅ `stores/publicStore/categoryQuestionsStore.ts` - Добавлена сортировка по priority_order
- ✅ `components/category/CategoryQuestions.vue` - HTML-рендеринг с санитизацией
- ✅ `pages/catalog/[...slug].vue` - Чистый текст в FAQPage Schema

### 3. Документация

- ✅ `docs/PAA_OPTIMIZATION.md` - Полная документация
- ✅ `docs/index.md` - Обновлен индекс

---

## 🔧 Шаги для деплоя

### Шаг 1: Применить миграции

```bash
# Локально (для тестирования)
supabase db reset

# Продакшн
supabase db push
```

**Проверка:**

```sql
-- Убедиться, что поле добавлено
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'category_questions'
  AND column_name = 'priority_order';

-- Проверить приоритеты
SELECT question_text, priority_order
FROM category_questions
WHERE is_auto_generated = true
ORDER BY priority_order
LIMIT 5;
```

---

### Шаг 2: Регенерировать FAQ для всех категорий

```sql
-- Запустить через Supabase Studio SQL Editor
SELECT public.generate_questions_for_all_categories();
```

**Ожидаемый результат:**

```
Обработано X категорий
```

**Проверка:**

```sql
-- Убедиться, что вопросы обновлены
SELECT
  c.name as category_name,
  COUNT(cq.id) as questions_count,
  MIN(cq.priority_order) as min_priority,
  MAX(cq.priority_order) as max_priority
FROM categories c
LEFT JOIN category_questions cq ON cq.category_id = c.id
WHERE cq.is_auto_generated = true
GROUP BY c.id, c.name
ORDER BY questions_count DESC
LIMIT 10;
```

---

### Шаг 3: Деплой Frontend

```bash
# Проверить линтинг
pnpm lint

# Проверить типы
pnpm typecheck  # или npx nuxi typecheck

# Билд
pnpm build

# Деплой (зависит от платформы)
# Vercel:
vercel --prod

# Netlify:
netlify deploy --prod
```

---

### Шаг 4: Проверка после деплоя

#### 4.1 Проверить страницу категории

1. Открыть любую категорию: `https://uhti.kz/catalog/bizibordy`
2. Прокрутить до блока "Часто задаваемые вопросы"
3. Убедиться:
   - ✅ Вопросы отображаются
   - ✅ Ответы содержат жирный текст (`<strong>`)
   - ✅ Списки отображаются корректно
   - ✅ Ссылки кликабельны

#### 4.2 Проверить Schema.org

**Google Rich Results Test:**

```
https://search.google.com/test/rich-results?url=https://uhti.kz/catalog/bizibordy
```

**Что проверять:**

- ✅ FAQPage обнаружена
- ✅ Все вопросы имеют `name` и `acceptedAnswer.text`
- ✅ Текст ответов чистый (без HTML-тегов)
- ✅ Нет ошибок валидации

#### 4.3 Проверить исходный код страницы

```bash
curl -s https://uhti.kz/catalog/bizibordy | grep -A 20 '"@type":"FAQPage"'
```

**Ожидаемый результат:**

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Что такое Бизиборды?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Бизиборды — это категория детских игрушек..."
      }
    }
  ]
}
```

---

## 🎯 Следующие шаги (опционально)

### 1. Добавить приоритетные вопросы из Google PAA

**Для топ-5 категорий:**

1. Открыть Google
2. Ввести: "[категория] алматы"
3. Найти блок "Вопросы по теме"
4. Скопировать 2-3 вопроса
5. Добавить через SQL:

```sql
INSERT INTO public.category_questions (
  category_id,
  question_text,
  answer_text,
  is_auto_generated,
  answered_at,
  priority_order
) VALUES (
  'uuid-категории',
  'Вопрос из Google PAA?',
  '<strong>Четкий ответ в первом предложении</strong>. Детали:<ul><li>Пункт 1</li><li>Пункт 2</li></ul><a href="https://uhti.kz/catalog/slug">Ссылка</a>.',
  false,
  NOW(),
  1  -- Высший приоритет
);
```

---

### 2. Мониторинг результатов

**Через 1 неделю:**

- Проверить Google Search Console → Performance
- Отследить рост impressions для категорий
- Проверить появление в PAA блоке

**Через 1 месяц:**

- Сравнить CTR до/после
- Проверить рост органического трафика
- Оценить позиции в PAA

---

## 🐛 Troubleshooting

### Проблема: Вопросы не отображаются на странице

**Решение:**

```sql
-- Проверить, есть ли вопросы для категории
SELECT * FROM category_questions WHERE category_id = 'uuid-категории';

-- Если нет, сгенерировать
SELECT generate_category_questions('uuid-категории', true);
```

---

### Проблема: HTML-теги отображаются как текст

**Решение:**

- Проверить, что используется `v-html` в `CategoryQuestions.vue`
- Очистить кеш браузера (Ctrl+Shift+R)
- Проверить, что функция `sanitizeAndRenderHTML()` работает

---

### Проблема: FAQPage не валидируется в Google

**Решение:**

```javascript
// Проверить, что HTML-теги удаляются в Schema
console.log(faqQuestions.value[0].answer_text);
// Должно быть: "Текст • Пункт 1 • Пункт 2"
// НЕ должно быть: "<strong>Текст</strong><ul><li>Пункт 1</li></ul>"
```

---

### Проблема: Приоритеты не работают

**Решение:**

```sql
-- Проверить сортировку в store
SELECT question_text, priority_order
FROM category_questions
WHERE category_id = 'uuid-категории'
ORDER BY priority_order ASC, created_at DESC;

-- Если порядок неправильный, обновить приоритеты
UPDATE category_questions
SET priority_order = 100
WHERE question_text LIKE 'Что такое%';
```

---

## 📊 Метрики успеха

### Краткосрочные (1-2 недели)

- [ ] Rich Snippets появились в Google Search Console
- [ ] CTR вырос на 10-15%
- [ ] Нет ошибок валидации Schema.org

### Среднесрочные (1-2 месяца)

- [ ] uhti.kz появился в PAA для 30-50% запросов
- [ ] Органический трафик вырос на 20-30%
- [ ] Bounce rate снизился на 5-10%

### Долгосрочные (3-6 месяцев)

- [ ] Доминирование в PAA для всех категорий
- [ ] Конверсия из органики выросла на 15-25%
- [ ] Рост авторитета домена

---

## 📚 Документация

- [PAA_OPTIMIZATION.md](./PAA_OPTIMIZATION.md) - Полная документация
- [SEO_SETUP.md](./SEO_SETUP.md) - Общая SEO настройка
- [AUTO_GENERATED_FAQ.md](./AUTO_GENERATED_FAQ.md) - Система FAQ

---

**Дата:** 31 марта 2026  
**Статус:** ✅ Готово к деплою  
**Автор:** Uhti Commerce Team

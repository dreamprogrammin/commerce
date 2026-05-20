# Changelog: Защита уникальных SEO-текстов

**Дата:** 2026-05-20  
**Версия:** 1.1.0  
**Автор:** Malik

## 🎯 Проблема

Кнопка "🤖 Автогенерация" в `/admin/brand-seo` перезаписывала длинные HTML-тексты, написанные вручную контент-менеджером для важных брендов, заменяя их на короткие шаблоны.

## ✅ Решение

Добавлена защита уникальных SEO-текстов на уровне базы данных.

## 📝 Что сделано

### 1. Создана RPC функция `safe_upsert_category_brand_seo`

**Файл:** `supabase/migrations/20260520154300_safe_upsert_category_brand_seo.sql`

**Логика:**
- Проверяет, является ли существующий `seo_text` уникальным
- Если текст уникальный (длина > 300 символов ИЛИ содержит HTML-теги) — НЕ перезаписывает его
- Если текст шаблонный — обновляет полностью
- Всегда обновляет `seo_h1`, `seo_title`, `seo_description`

**Возвращает:**
```json
{
  "action": "updated_partial" | "updated_full" | "inserted",
  "message": "Описание действия",
  "protected": true | false
}
```

### 2. Обновлён composable `useSeoTemplates.ts`

**Изменения:**
- Функция `generateSeoForAllCategoryBrands` теперь использует `safe_upsert_category_brand_seo`
- Режим `overwrite: false` (по умолчанию) — безопасный upsert через RPC
- Режим `overwrite: true` — принудительная перезапись через прямой UPDATE

**Код:**
```typescript
if (overwrite) {
  // Принудительная перезапись (опасная операция)
  await supabase.from('category_brand_seo').update(seoData).eq('id', existing.id)
} else {
  // Безопасный upsert через RPC (защищает уникальные тексты)
  await supabase.rpc('safe_upsert_category_brand_seo', { ... })
}
```

### 3. Обновлены типы TypeScript

**Файл:** `types/supabase.ts`

Добавлен тип для новой RPC функции:
```typescript
safe_upsert_category_brand_seo: {
  Args: {
    p_category_id: string
    p_brand_id: string
    p_seo_h1: string
    p_seo_title: string
    p_seo_description: string
    p_seo_text: string
  }
  Returns: Json
}
```

### 4. Создана документация

**Файлы:**
- `docs/SEO_TEXT_PROTECTION.md` — полная документация
- `docs/SEO_TEXT_PROTECTION_QUICKSTART.md` — быстрый старт
- `supabase/tests/test_seo_text_protection.sql` — SQL-тесты

### 5. Обновлён README.md

Добавлена ссылка на новую документацию:
```markdown
- **[🛡️ Защита уникальных SEO-текстов](./docs/SEO_TEXT_PROTECTION.md)** 🔒
```

## 🔍 Критерии защиты текста

Текст считается **уникальным** (защищённым), если:

1. **Длина > 300 символов** ИЛИ
2. **Содержит HTML-теги:**
   - `<h1>`, `<h2>`, `<h3>`, `<h4>`, `<h5>`, `<h6>`
   - `<div>`, `<section>`, `<article>`
   - `<ul>`, `<ol>`, `<li>`
   - `<strong>`, `<em>`, `<a>`

## 🎬 Поведение кнопок в админке

| Кнопка | Действие | Безопасность |
|--------|----------|--------------|
| **🤖 Автогенерация** | Создаёт новые записи, обновляет шаблонные тексты | ✅ Безопасно |
| **🔄 Перезаписать все** | Перезаписывает ВСЕ тексты, включая уникальные | ⚠️ Опасно |

## 📊 Примеры

### Защищённый текст (НЕ будет перезаписан)

```html
<h2>Конструкторы LEGO для мальчиков в Алматы</h2>
<p>Ухтышка предлагает широкий выбор оригинальных конструкторов LEGO...</p>
<ul>
  <li>Официальная гарантия</li>
  <li>Доставка день-в-день</li>
</ul>
```

### Шаблонный текст (будет обновлён)

```
Ухтышка — это официальный интернет-магазин в Алматы, где можно купить оригинальные конструкторы LEGO.
```

## ✅ Тестирование

Запустите тест в Supabase SQL Editor:

```bash
# Файл: supabase/tests/test_seo_text_protection.sql
```

Ожидаемый результат:
```
✓ Запись создана
✓ Короткий текст успешно обновлён
✓ Уникальный текст создан
✓ Уникальный текст защищён от перезаписи
✓ SEO-текст остался без изменений
✓ Другие поля (seo_h1) обновились корректно
✓ Тестовые данные удалены

=== ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО ===
```

## 🚀 Деплой

```bash
# Применить миграцию
npx supabase db push

# Проверить, что функция создана
SELECT proname FROM pg_proc WHERE proname = 'safe_upsert_category_brand_seo';
```

## 📚 Связанные документы

- [SEO_TEXT_PROTECTION.md](./SEO_TEXT_PROTECTION.md) — полная документация
- [SEO_TEXT_PROTECTION_QUICKSTART.md](./SEO_TEXT_PROTECTION_QUICKSTART.md) — быстрый старт
- [SEO_AUTOMATION.md](./SEO_AUTOMATION.md) — общая документация по автоматизации SEO

## 🎉 Результат

Теперь контент-менеджеры могут безопасно писать уникальные SEO-тексты для важных брендов, не боясь, что автогенерация их перезапишет.

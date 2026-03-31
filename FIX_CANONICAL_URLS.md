# 🔧 Исправление ошибки Canonical URL в Google Search Console

## Проблема

Google Search Console показывает ошибку **"Вариант страницы с тегом canonical"** для 3 страниц:

1. `https://uhti.kz/catalog/babies/katalki` → canonical указывает на `/catalog/kiddy/katalki`
2. `https://uhti.kz/catalog/kukly-aksessuary` → canonical указывает на другой URL
3. `https://uhti.kz/catalog/boys/cars/radioupravlyaemye-mashinki` → canonical указывает на другой URL

## Причина

В базе данных у некоторых категорий заполнено поле `canonical_url` с **неправильными значениями**, которые указывают на другие страницы вместо самих себя.

## Решение

Создана миграция `20260331083500_fix_canonical_urls.sql`, которая:

1. Очищает все `canonical_url` для категорий, товаров и брендов
2. Логика в коде автоматически построит правильный canonical на основе `category.href`

## Как применить

### Вариант 1: Через Supabase CLI (локально)

```bash
# Если локальный Supabase запущен
supabase db reset

# Или применить только эту миграцию
supabase migration up
```

### Вариант 2: Через Supabase Studio (продакшн)

1. Открыть Supabase Studio: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/editor
2. Перейти в **SQL Editor**
3. Нажать **New query**
4. Скопировать содержимое файла `supabase/migrations/20260331083500_fix_canonical_urls.sql`
5. Нажать **Run** (или Ctrl+Enter)

### Вариант 3: Быстрое исправление (только SQL)

Выполнить в SQL Editor:

```sql
-- Очистить canonical_url для всех категорий
UPDATE public.categories
SET canonical_url = NULL
WHERE canonical_url IS NOT NULL;

-- Проверить результат
SELECT slug, canonical_url, href
FROM public.categories
WHERE slug IN ('katalki', 'kukly-aksessuary', 'radioupravlyaemye-mashinki');
```

## Проверка после применения

### 1. Проверить canonical на сайте

```bash
# Проверить первую проблемную страницу
curl -s "https://uhti.kz/catalog/babies/katalki" | grep -oP '<link[^>]*rel="canonical"[^>]*>'

# Ожидаемый результат:
# <link rel="canonical" href="https://uhti.kz/catalog/babies/katalki">
```

### 2. Проверить в Google Search Console

1. Открыть Google Search Console
2. Перейти в **Индексирование** → **Страницы**
3. Найти раздел **"Вариант страницы с тегом canonical"**
4. Нажать **Проверить исправление**
5. Дождаться переиндексации (обычно 1-3 дня)

### 3. Запросить переиндексацию вручную

Для ускорения процесса:

1. Открыть Google Search Console
2. Вставить URL в поиск: `https://uhti.kz/catalog/babies/katalki`
3. Нажать **Запросить индексирование**
4. Повторить для остальных 2 страниц

## Логика canonical в коде

После очистки базы данных, код в `pages/catalog/[...slug].vue:316-333` автоматически построит правильный canonical:

```typescript
const canonicalUrl = computed(() => {
  const baseUrl = "https://uhti.kz";
  let basePath: string;

  // Если canonical_url пустой (NULL), используем href
  if (currentCategory.value?.canonical_url) {
    basePath = currentCategory.value.canonical_url;
  } else if (currentCategory.value?.href) {
    basePath = currentCategory.value.href; // ✅ Правильный путь
  } else {
    basePath = route.path;
  }

  // Для brand landing добавляем ?brand=slug
  if (activeBrandSlug.value) {
    return `${baseUrl}${basePath}?brand=${activeBrandSlug.value}`;
  }

  return `${baseUrl}${basePath}`;
});
```

## Ожидаемый результат

- ✅ Все 3 страницы получат правильный canonical (указывающий на самих себя)
- ✅ Google уберёт ошибку "Вариант страницы с тегом canonical"
- ✅ Страницы вернутся в индекс через 1-3 дня
- ✅ Восстановление позиций в выдаче

## Важно

После применения миграции **НЕ ЗАПОЛНЯЙТЕ** поле `canonical_url` в базе данных вручную, если не уверены на 100%. Код автоматически построит правильный canonical на основе `href`.

---

**Дата создания:** 31 марта 2026  
**Статус:** Готово к применению

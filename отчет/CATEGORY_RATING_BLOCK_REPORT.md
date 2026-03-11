# Отчет: Агрегированный рейтинг категории

## Дата: 2026-03-11

## Что сделано

### 1. SQL: Рекурсивная агрегация рейтинга

**Файл миграции**: `supabase/migrations/20260311000001_recursive_category_aggregate_rating.sql`

Обновлена RPC-функция `get_category_aggregate_rating(p_category_id UUID)`:

- Добавлен рекурсивный CTE `category_tree` для обхода всех подкатегорий
- Считает взвешенный средний рейтинг (`AVG` взвешенный по количеству отзывов) по всем товарам категории и её подкатегорий
- Считает общее количество отзывов (`SUM(review_count)`)
- Учитывает только активные товары (`is_active = true`) с отзывами (`review_count > 0`)
- Функция `STABLE SECURITY DEFINER` — безопасна для вызова из клиента

**Формула взвешенного среднего**:

```
avg = SUM(product.avg_rating * product.review_count) / SUM(product.review_count)
```

### 2. Компонент CategoryRatingBlock.vue (UI)

**Файл**: `components/category/CategoryRatingBlock.vue`

- Золотые звёзды (полные, половинчатые, пустые) — переиспользует `lucide-vue-next` иконки
- Текст: «**4.8** на основе 120+ отзывов»
- Склонение слова «отзыв» (1 отзыв / 2 отзыва / 5 отзывов)
- Формат количества: `120+` для >= 100 отзывов (округление до десятков)
- Адаптивный размер: `w-5 h-5` на мобильных, `w-6 h-6` на десктопе
- **Fallback**: Блок НЕ отображается, если менее 3 отзывов

### 3. Интеграция в страницу каталога

**Файл**: `pages/catalog/[...slug].vue`

Блок размещён **под заголовком H1** во всех трёх вариантах шаблона:

1. **Мобильная версия** (внутри блока с описанием категории)
2. **Десктопная версия** (внутри блока с описанием категории)
3. **Fallback** (когда нет описания/изображения категории)

### 4. TanStack Query (Кэширование и реактивность)

Заменён `useAsyncData` на `useQuery` из `@tanstack/vue-query`:

```typescript
const { data: categoryRatingData } = useQuery({
  queryKey: ['category-rating', currentCategoryId],
  staleTime: 5 * 60 * 1000,   // 5 минут — данные считаются свежими
  gcTime: 10 * 60 * 1000,     // 10 минут — хранение в памяти
  enabled: computed(() => !!currentCategoryId.value && slug !== 'all'),
})
```

- Автоматическое обновление при смене категории (реактивный `queryKey`)
- Инвалидация кэша при добавлении нового отзыва (через общий `queryClient`)
- Ключ кэша: `['category-rating', categoryId]`

### 5. SEO: Микроразметка (JSON-LD)

Разметка `aggregateRating` в `CollectionPage` Schema.org **уже была реализована ранее** и продолжает работать с обновлёнными данными:

```json
{
  "@type": "CollectionPage",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "reviewCount": 120,
    "bestRating": 5,
    "worstRating": 1
  }
}
```

## Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migrations/20260311000001_recursive_category_aggregate_rating.sql` | Новая миграция — рекурсивная RPC |
| `components/category/CategoryRatingBlock.vue` | Новый компонент — блок рейтинга |
| `pages/catalog/[...slug].vue` | Интеграция компонента + замена useAsyncData на useQuery |

## Как протестировать

1. Применить миграцию: `supabase db reset` или `supabase migration up`
2. Убедиться, что в базе есть товары с отзывами (`review_count > 0`)
3. Открыть любую категорию с >= 3 отзывами
4. Проверить: под H1 появился блок «4.8 на основе 120+ отзывов» с золотыми звёздами
5. Проверить JSON-LD в `<head>` — наличие `aggregateRating` в `CollectionPage`
6. Проверить категорию с < 3 отзывами — блок НЕ должен отображаться

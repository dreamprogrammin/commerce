# Унификация BreadcrumbList JSON-LD

**Дата:** 18 марта 2026
**Статус:** Завершено

## Проблема

BreadcrumbList schema (структурированные данные для Google) генерировалась inline на каждой странице — по 20-35 строк дублированного кода. Формат и подход отличались между страницами (где-то `innerHTML`, где-то `children`; разная обработка последнего элемента). Часть публичных страниц не имела хлебных крошек вовсе.

## Решение

Создан composable `composables/useBreadcrumbSchema.ts` — единая точка генерации BreadcrumbList JSON-LD.

### API

```typescript
useBreadcrumbSchema(items: MaybeRef<BreadcrumbItem[]>)
```

- Автоматически добавляет `Главная` (`https://uhti.kz/`) первым элементом
- Поддерживает реактивные данные (`computed`, `ref`)
- Последний элемент без `path` — текущая страница (без поля `item` в schema, как рекомендует Google)

### Примеры использования

```typescript
// Статические крошки
useBreadcrumbSchema([
  { name: 'Каталог', path: '/catalog' },
  { name: 'Новинки' },
])

// Реактивные крошки
useBreadcrumbSchema(computed(() => [
  { name: 'Бренды', path: '/brand/all' },
  ...(brand.value ? [{ name: brand.value.name }] : []),
]))
```

## Изменения

### Новый файл

| Файл | Описание |
|---|---|
| `composables/useBreadcrumbSchema.ts` | Composable для генерации BreadcrumbList JSON-LD |

### Добавлены хлебные крошки (5 страниц)

| Страница | Цепочка крошек |
|---|---|
| `/catalog/new` | Главная > Каталог > Новинки |
| `/catalog/promotions` | Главная > Каталог > Акции |
| `/promo/[slug]` | Главная > Акции > [Название акции] |
| `/brands` | Главная > Бренды |
| `/privacy-policy` | Главная > Политика конфиденциальности |

### Рефакторинг существующих страниц (6 страниц)

Inline BreadcrumbList schema заменена на вызов `useBreadcrumbSchema()`.

| Страница | Цепочка крошек | Убрано строк |
|---|---|---|
| `/index.vue` | Главная | ~10 |
| `/catalog/index.vue` | Главная > Каталог | ~20 |
| `/catalog/[...slug].vue` | Главная > [Категория] > ... | ~25 |
| `/catalog/products/[slug].vue` | Главная > [Категория] > ... > [Товар] | ~15 |
| `/brand/[slug].vue` | Главная > Бренды > [Бренд] | ~30 |
| `/brand/[brandSlug]/[lineSlug].vue` | Главная > Бренды > [Бренд] > [Линейка] | ~35 |

**Итого:** ~135 строк дублированного кода удалено.

### Страницы без хлебных крошек (намеренно)

| Страница | Причина |
|---|---|
| `/profile/**` | Приватные страницы, SSR отключен |
| `/checkout` | Приватная страница, SSR отключен |
| `/cart` | Приватная страница, SSR отключен |
| `/admin/**` | noindex, админ-панель |
| `/search` | Поисковый оверлей (layout `blank`) |
| `/order/success/[id]` | Динамическая страница, noindex |

## Проверка

- Typecheck: пройден
- Build (client + server): пройден

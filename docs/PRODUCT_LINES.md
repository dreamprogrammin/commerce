# Товарные линейки (Product Lines)

Товарные линейки — суббренды или коллекции внутри бренда (например, Mattel → Barbie, Hot Wheels, Fisher-Price). Функционал охватывает весь стек: БД, админку, каталог, SEO, страницы бренда и линейки.

---

## Содержание

- [Архитектура БД](#архитектура-бд)
- [Типы TypeScript](#типы-typescript)
- [Хранилище изображений](#хранилище-изображений)
- [Админ-панель](#админ-панель)
- [Каталог и фильтрация](#каталог-и-фильтрация)
- [Страница бренда](#страница-бренда)
- [Страница линейки](#страница-линейки)
- [SEO](#seo)
- [Кеширование](#кеширование)
- [FAQ-система](#faq-система)
- [Маршруты](#маршруты)

---

## Архитектура БД

### Таблица `product_lines`

```sql
CREATE TABLE public.product_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT product_lines_brand_name_unique UNIQUE (brand_id, name)
);
```

**Связи:**
- `products.product_line_id` → `product_lines.id` (ON DELETE SET NULL)
- `categories.allowed_product_line_ids UUID[]` — ограничивает видимые линейки в категории

**Индексы:** `brand_id`, `slug`, `name`, `products.product_line_id`

**RLS:** публичный SELECT, INSERT/UPDATE/DELETE только для `role = 'admin'`

### RPC-функции

| Функция | Назначение |
|---------|------------|
| `get_product_lines_by_brand(p_brand_id)` | Линейки одного бренда (id, name, slug, description, logo_url) |
| `get_product_lines_by_category_slug(p_category_slug)` | Линейки в категории с рекурсивным обходом дерева (+ brand_name, product_count) |
| `get_filtered_products(... p_product_line_ids)` | Основной каталог — фильтрация по `product_line_id`, возвращает `product_line_id` и `product_line_name` |

### Миграции (хронология)

| Файл | Что делает |
|------|------------|
| `20260126085018_add_product_lines.sql` | Таблица, RLS, RPC, Storage bucket |
| `20260126130000_add_product_line_filter_to_rpc.sql` | Параметр `p_product_line_ids` в `get_filtered_products` |
| `20260127100000_fix_ambiguous_id_in_get_product_lines_rpc.sql` | Фикс "column reference id is ambiguous" |
| `20260201072342_add_product_line_material_country_questions.sql` | Таблица `product_line_questions` для FAQ |
| `20260203050950_add_missing_product_line_column.sql` | `categories.allowed_product_line_ids` |
| `20260203075548_force_fix_product_lines_rpc.sql` | Пересоздание RPC с `SECURITY DEFINER` |
| `20260203092547_fix_product_lines_add_logo_url.sql` | `logo_url` в возврате RPC |
| `20260203093236_fix_product_lines_remove_blur_placeholder.sql` | Убран `blur_placeholder` из RPC |
| `20260307000001_add_product_line_to_filtered_products.sql` | `product_line_id/name` в `get_filtered_products` + пагинация через CTE |

---

## Типы TypeScript

**Файл:** `types/type.ts`

```typescript
interface ProductLine {
  id: string
  brand_id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  seo_description: string | null
  seo_keywords: string[] | null
  created_at: string
  updated_at: string
}

type ProductLineInsert = Omit<ProductLine, 'id' | 'created_at' | 'updated_at'>
type ProductLineUpdate = Partial<ProductLineInsert>

interface ProductLineWithBrand extends ProductLine {
  brand_name: string
  product_count?: number
}

type SimpleProductLine = Pick<ProductLine, 'id' | 'name' | 'slug'>
```

Используется также в:
- `FullProduct.product_lines` — join при детальном просмотре товара
- `IProductFilters.productLineIds` — параметр фильтрации
- `ProductFormData.product_line_id` — форма редактирования товара
- `BaseProduct.product_line_id / product_line_name` — карточка каталога

---

## Хранилище изображений

**Bucket:** `product-line-logos`

**Лимиты:** 5 МБ, форматы JPEG/PNG/WebP/SVG

**RLS:**
- SELECT — публичный
- INSERT/UPDATE/DELETE — `profiles.role = 'admin'`

**Варианты изображений:** при загрузке логотипа генерируются три варианта:
- `_sm` — маленький (карточки в сетке)
- `_md` — средний
- `_lg` — большой (Hero-секция)

**Получение URL:**
```typescript
import { BUCKET_NAME_PRODUCT_LINES } from '@/constants'
const { getVariantUrl } = useSupabaseStorage()
const url = getVariantUrl(BUCKET_NAME_PRODUCT_LINES, logoUrl, 'sm')
```

---

## Админ-панель

### Store: `adminProductLinesStore`

**Файл:** `stores/adminStore/adminProductLinesStore.ts`

Методы:
- `fetchProductLines()` — все линейки
- `fetchProductLinesByBrand(brandId)` — линейки бренда (для ProductForm)
- `createProductLine(data, logoFile)` — создание с загрузкой логотипа + нотификация поисковиков
- `updateProductLine(id, data, newLogoFile, oldLogoUrl)` — обновление с заменой вариантов
- `deleteProductLine(line)` — удаление с очисткой файлов

### Компоненты

**`ProductLineForm.vue`** (`components/admin/product-lines/`)
- Название, слаг (автогенерация из имени), описание
- Загрузка логотипа с превью
- SEO: описание (счётчик символов) + ключевые слова

**`ProductForm.vue`** (`components/admin/products/`) — селект линейки:
- Combobox (Popover + Command) с поиском
- При смене бренда — перезагрузка линеек, сброс выбора
- Кнопка «Создать новую линейку» прямо из формы товара
- Опция «Без линейки» (null)

---

## Каталог и фильтрация

### Параметры URL

```
/catalog/{categorySlug}?brands={uuid}&lines={uuid}
```

### Логика фильтрации (`pages/catalog/[...slug].vue`)

1. **Парсинг URL:** `lines` → `activeFilters.productLineIds`
2. **Загрузка данных:** `productsStore.fetchProductLinesForCategory(slug)` — через RPC `get_product_lines_by_category_slug`
3. **Smart-фильтрация:** линейки в UI фильтруются по выбранным брендам
4. **Очистка:** при смене бренда невалидные `lineIds` автоматически удаляются
5. **Синхронизация URL:** debounce 300ms через `updateQueryParams()`
6. **Передача в RPC:** `p_product_line_ids` → `get_filtered_products()`

### TanStack Query

`productLineIds` включены в ключ кеша:
```typescript
queryKey: ['catalog-products', ..., f.productLineIds?.join(','), ...]
// staleTime: 2 мин, gcTime: 10 мин
```

### Компонент `CategoryProductLines.vue`

Показывается внизу страницы каталога. Сетка до 18 карточек (2→3→4→5→6 колонок). Ведёт на `/brand/{brandSlug}/{lineSlug}`.

---

## Страница бренда

### Компонент `BrandProductLinesGrid.vue`

**Файл:** `components/brand/BrandProductLinesGrid.vue`

Отображается на `/brand/{slug}` между Hero-секцией и каталогом товаров.

**Props:** `productLines: ProductLine[]`, `brandId: string`

**Сетка:** `grid-cols-2 sm:3 md:4 lg:5`, квадратные карточки (`aspect-square`)

**Варианты карточек:**
- **С логотипом:** `ProgressiveImage` (object-cover) + название на тёмной подложке (`bg-black/50 backdrop-blur-sm`)
- **Без логотипа:** градиент `from-primary/80 to-secondary/80` с названием по центру

**Hover:** `scale-105` с `transition-transform`

**Ссылка:** `/catalog/all?brands={brandId}&lines={lineId}` — каталог с фильтрами

### Интеграция (`pages/brand/[slug].vue`)

```vue
<BrandProductLinesGrid
  v-if="brandProductLines.length > 0"
  :product-lines="brandProductLines"
  :brand-id="brand.id"
/>
```

Данные загружаются в `loadProductLines()` через прямой запрос к таблице `product_lines`.

---

## Страница линейки

**Файл:** `pages/brand/[brandSlug]/[lineSlug].vue`

**URL:** `/brand/{brandSlug}/{lineSlug}`

Полноценная страница с:
- Hero-секция (логотип линейки + логотип бренда)
- Статистика (количество товаров)
- Сортировка: newest / price_asc / price_desc / popularity
- Сетка товаров (`.eq('product_line_id', productLine.id)`)
- SEO-описание (разворачивается)

**Компонент описания:** `ProductLineDescription.vue` (`components/product/`) — рендерит `seo_description` или `description` через `v-html`.

---

## SEO

### Страница бренда (`/brand/{slug}`)

Schema.org `Brand` включает `subOrganization` — массив линеек как суб-брендов:

```json
{
  "@type": "Brand",
  "subOrganization": [{
    "@type": "Brand",
    "name": "Barbie",
    "url": "https://uhti.kz/brand/mattel/barbie",
    "logo": "..."
  }]
}
```

### Страница линейки (`/brand/{brandSlug}/{lineSlug}`)

- `BreadcrumbList`: Главная → Бренды → Бренд → Линейка
- `Brand` с `parentOrganization` → родительский бренд
- `CollectionPage` с `AggregateOffer` (ценовой диапазон)
- `ItemList` — до 10 товаров

### Каталог с фильтром линейки

При выборе одной линейки:
- Title: `"Купить {BrandName} {LineName} в Алматы | Ухтышка"`
- `robots: noindex, follow` (фильтрованные страницы)

---

## Кеширование

### Pinia Store (`productsStore`)

```typescript
productLinesByCategory: Record<string, ProductLine[]>
```
- Кеш по категориям, живёт до закрытия вкладки
- `clearProductLinesCache(slug?)` — точечная или полная очистка
- `invalidateProductLinesCache()` — сброс всего

### TanStack Query

`productLineIds` в составе ключа кеша каталога → отдельный кеш для каждой комбинации фильтров.

---

## FAQ-система

### Таблица `product_line_questions`

Хранит вопросы/ответы для линеек (авто-генерация или пользовательские).

### Composable `useProductLineQuestions`

**Файл:** `composables/useProductLineQuestions.ts`

```typescript
generateQuestionsForProductLine(productLineId)    // для одной линейки
generateQuestionsForAllProductLines()              // для всех
```

Вызывает серверные RPC: `generate_product_line_questions`, `generate_questions_for_all_product_lines`.

---

## Маршруты

| URL | Компонент/Страница | Назначение |
|-----|---------------------|------------|
| `/brand/{slug}` | `pages/brand/[slug].vue` | Страница бренда с сеткой линеек |
| `/brand/{brandSlug}/{lineSlug}` | `pages/brand/[brandSlug]/[lineSlug].vue` | Страница линейки |
| `/catalog/{slug}?lines={uuid}` | `pages/catalog/[...slug].vue` | Каталог с фильтром по линейке |
| `/catalog/all?brands={uuid}&lines={uuid}` | то же | Ссылка из `BrandProductLinesGrid` |

---

## Ключевые файлы

| Файл | Роль |
|------|------|
| `types/type.ts` | Типы `ProductLine`, `ProductLineInsert`, и т.д. |
| `constants/index.ts` | `BUCKET_NAME_PRODUCT_LINES` |
| `stores/adminStore/adminProductLinesStore.ts` | CRUD админки |
| `stores/publicStore/productsStore.ts` | Публичный кеш и загрузка |
| `components/admin/product-lines/ProductLineForm.vue` | Форма создания/редактирования |
| `components/admin/products/ProductForm.vue` | Селект линейки в товаре |
| `components/brand/BrandProductLinesGrid.vue` | Сетка на странице бренда |
| `components/category/CategoryProductLines.vue` | Сетка на странице категории |
| `components/product/ProductLineDescription.vue` | Описание линейки (v-html) |
| `pages/brand/[slug].vue` | Страница бренда |
| `pages/brand/[brandSlug]/[lineSlug].vue` | Страница линейки |
| `pages/catalog/[...slug].vue` | Каталог с фильтрацией |
| `composables/useCatalogQuery.ts` | TanStack Query для каталога |
| `composables/useProductLineQuestions.ts` | FAQ-генерация |

# 🤖 Документация проекта для ИИ-ассистентов

> **Версия:** 1.0
> **Дата:** 21 мая 2026
> **Проект:** Uhti Commerce Platform (uhti.kz)

---

## 📋 Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Технологический стек](#технологический-стек)
3. [Архитектура](#архитектура)
4. [Ключевые концепции](#ключевые-концепции)
5. [Работа с кодом](#работа-с-кодом)
6. [База данных](#база-данных)
7. [SEO и производительность](#seo-и-производительность)
8. [Важные правила](#важные-правила)

---

## 🎯 Обзор проекта

**Uhti Commerce Platform** — полнофункциональный интернет-магазин детских игрушек для рынка Казахстана.

### Основные характеристики

- **URL:** https://uhti.kz
- **Регион:** Казахстан (Алматы)
- **Языки:** Русский, Казахский
- **Валюта:** KZT (тенге)
- **Формат телефона:** +7 (XXX) XXX-XX-XX

### Ключевые функции

**Для покупателей:**

- Каталог с многоуровневой фильтрацией (категории, бренды, цена, материалы, страны, динамические атрибуты)
- Персонализированные рекомендации на основе профилей детей
- Двухуровневая система бонусов (активные + отложенные на 14 дней)
- Гостевой checkout без регистрации
- OAuth авторизация через Google
- Список желаний (wishlist)
- История заказов с отслеживанием статуса

**Для администраторов:**

- Полноценная админ-панель для управления каталогом
- Управление продуктами с мультизагрузкой изображений
- Telegram-интеграция для управления заказами
- Система динамических атрибутов
- Управление баннерами и слайдами

---

## 🛠️ Технологический стек

### Frontend

```typescript
{
  "framework": "Nuxt 4.0.2",           // SSR фреймворк
  "ui": "Vue 3.x",                     // Реактивный UI
  "language": "TypeScript 5.9.2",     // Типизация
  "styling": "Tailwind CSS 4.1.11",   // Utility-first CSS
  "components": "shadcn-nuxt 2.2.0",  // 142 UI компонента
  "state": "Pinia 3.0.3",             // State management (15 stores)
  "cache": "TanStack Query 5.90.5",   // Серверное кеширование
  "images": "@nuxt/image 1.11.0"      // Оптимизация изображений
}
```

### Backend

```typescript
{
  "platform": "Supabase",              // Backend-as-a-Service
  "database": "PostgreSQL 15",         // Реляционная БД
  "functions": "Edge Functions (Deno)", // Serverless
  "storage": "Supabase Storage",       // Хранение изображений
  "auth": "Supabase Auth",             // OAuth + JWT
  "security": "Row Level Security"     // Безопасность на уровне строк
}
```

### Инфраструктура

- **Хостинг:** Vercel (SSR)
- **CDN:** Supabase Storage + Image Transformation
- **Telegram Bot:** Уведомления о заказах
- **Cron Jobs:** pg_cron для активации бонусов

---

## 🏗️ Архитектура

### Структура проекта

```
/home/malik/projects/commerce/
├── components/          # 197 Vue компонентов
│   ├── ui/             # shadcn-nuxt (142 компонента)
│   ├── global/         # Общие компоненты
│   ├── admin/          # Админ панель
│   ├── product/        # Компоненты продуктов
│   └── ...
├── composables/        # 20 composables
├── pages/              # 36 страниц (file-based routing)
├── stores/             # 15 Pinia stores
│   ├── core/          # Auth, profile, personalization
│   ├── publicStore/   # Cart, products, wishlist
│   └── adminStore/    # Админ управление
├── layouts/            # 9 layouts
├── supabase/
│   ├── functions/     # 7 Edge Functions
│   └── migrations/    # 100+ SQL миграций (10,306 строк)
├── types/
│   └── supabase.ts    # Типы БД (87KB)
└── docs/              # Документация
```

### Статистика кодовой базы

- **197 Vue компонентов**
- **20 composables**
- **15 Pinia stores**
- **36 страниц**
- **9 layouts**
- **100+ SQL миграций** (10,306 строк)
- **7 Edge Functions**
- **25+ таблиц БД**
- **106 RLS политик**
- **30+ RPC функций**

---

## 🔑 Ключевые концепции

### 1. Двойная архитектура заказов

**Зарегистрированные пользователи** (`orders`):

- Привязка к `user_id`
- Система бонусов (списание/начисление)
- Welcome bonus 1000 при первом заказе
- Отложенная активация бонусов (14 дней)

**Гостевые заказы** (`guest_checkouts`):

- Без привязки к пользователю
- Контакты: `guest_name`, `guest_email`, `guest_phone`
- БЕЗ операций с бонусами
- Автоудаление через 90 дней

### 2. Система бонусов

**Два типа баланса:**

- `active_bonus_balance` - доступны для списания
- `pending_bonus_balance` - активация через 14 дней

**Жизненный цикл:**

```
Заказ создан → bonuses_awarded вычислены
              ↓
       pending_balance += bonuses_awarded
       bonuses_activation_date = NOW() + 14 дней
              ↓
       pg_cron: activate_pending_bonuses()
              ↓
       active_balance += bonuses_awarded
```

**Конвертация:** 1 бонус = 1 ₸ скидки

### 3. Персонализированные рекомендации

**Алгоритм:**

1. **Анонимы** → Случайные популярные товары
2. **С профилями детей** → Фильтр по возрасту + полу
3. **С историей заказов** → Товары из той же категории
4. **Зарегистрированные без данных** → Популярные товары

### 4. Динамические атрибуты

**Проблема:** Разные категории требуют разных характеристик

**Решение:**

```
Категория "Куклы":
├─ Высота куклы (range)
├─ Цвет волос (color)
└─ Материал (select)

Категория "Конструкторы":
├─ Количество деталей (range)
├─ Возраст (select)
└─ Серия (select)
```

**Реализация:**

- `category_attributes` - привязка атрибутов к категориям
- `product_attribute_values` - значения для продуктов
- Автоматическая фильтрация в каталоге

### 5. LQIP (Low Quality Image Placeholders)

**Проблема:** Медленная загрузка изображений

**Решение:**

- При загрузке генерируется Base64 LQIP (~500 байт)
- Сохраняется в `blur_placeholder` колонке
- Мгновенное отображение blur-эффекта
- Плавный переход к полному изображению

**Результат:** Perceived performance +40%

### 6. Двухуровневое кеширование

**Level 1: Pinia Store (Метаданные)**

- Бренды по категориям
- Атрибуты по категориям
- Материалы, страны (глобально)
- Диапазоны цен
- **Lifetime:** До закрытия вкладки

**Level 2: TanStack Query (Продукты)**

- Списки продуктов с фильтрами
- **Stale time:** 5 минут
- **GC time:** 10 минут
- **Результат:** 33% меньше API вызовов

---

## 💻 Работа с кодом

### Команды разработки

```bash
# Development
pnpm dev              # Start dev server (http://localhost:3000)

# Production
pnpm build            # Production build
pnpm preview          # Preview production build

# Code Quality
pnpm lint             # Check for lint errors
pnpm lint:fix         # Auto-fix lint errors
pnpm format           # Format with Prettier

# Testing
pnpm test             # Run tests in watch mode
pnpm test:ui          # Run tests with UI
pnpm test:coverage    # Generate coverage

# Supabase
supabase start        # Start local Supabase
supabase db reset     # Reset database with migrations
supabase gen types typescript --local > types/supabase.ts
```

### Структура компонентов

**Props Definition:**

```typescript
// Вариант 1: Interface
interface Props {
  product: BaseProduct
  isLoading?: boolean
}
const props = defineProps<Props>()

// Вариант 2: withDefaults
const props = withDefaults(defineProps<Props>(), {
  isLoading: false
})
```

**Loading States:**

```vue
<div v-if="isLoading">
  <Skeleton class="h-5 w-3/4" />
</div>

<div v-else>
  {{ content }}
</div>
```

**Device Detection:**

```typescript
const isTouchDevice = ref(false)
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})
```

### Работа с Pinia Stores

**Паттерн Loading States:**

```typescript
isLoading.value = true
try {
  // async operation
}
finally {
  isLoading.value = false
}
```

**Паттерн Error Handling:**

```typescript
catch (error: any) {
  toast.error('User message', { description: error.message })
}
```

**Паттерн Optimistic Updates:**

```typescript
const originalData = [...items.value]
items.value = items.value.filter(...)
try {
  await mutation()
} catch {
  items.value = originalData // Rollback
}
```

---

## 🗄️ База данных

### Основные таблицы

**Каталог:**

- `products` - Товары (название, цена, остатки, бонусы)
- `product_images` - Галерея изображений с LQIP
- `categories` - Иерархические категории
- `brands` - Бренды
- `attributes` / `attribute_options` - Динамические атрибуты
- `materials` - Материалы изготовления
- `countries` - Страны производства

**Заказы:**

- `orders` - Заказы зарегистрированных (с бонусами)
- `guest_checkouts` - Гостевые заказы (без бонусов)
- `order_items` / `guest_checkout_items` - Товары в заказах

**Пользователи:**

- `profiles` - Профили пользователей
- `children` - Профили детей для рекомендаций
- `wishlist` - Список желаний
- `bonus_transactions` - История транзакций бонусов

**Маркетинг:**

- `banners` - Рекламные баннеры
- `slides` - Карусель главной страницы
- `category_brand_seo` - SEO-тексты для комбинаций категория+бренд

### Ключевые RPC функции

**Каталог:**

```sql
get_filtered_products(
  p_category_slug TEXT,
  p_subcategory_ids UUID[],
  p_brand_ids UUID[],
  p_price_min NUMERIC,
  p_price_max NUMERIC,
  p_sort_by TEXT,
  p_page_number INT,
  p_page_size INT,
  p_attributes attribute_filter[],
  p_material_ids INT[],
  p_country_ids INT[]
)
```

**Заказы:**

```sql
create_user_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT,
  p_delivery_address JSONB,
  p_bonuses_to_spend INT
) RETURNS UUID

create_guest_checkout(
  p_cart_items JSONB,
  p_guest_info JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB,
  p_payment_method TEXT
) RETURNS UUID

cancel_order(
  p_order_id UUID,
  p_table_name TEXT  -- 'orders' | 'guest_checkouts'
) RETURNS TEXT
```

**Рекомендации:**

```sql
get_personalized_recommendations(
  p_user_id UUID,
  p_limit INT DEFAULT 10
) RETURNS SETOF products
```

**Бонусы:**

```sql
activate_pending_bonuses() RETURNS TEXT
-- Запускается pg_cron ежедневно в 2:00 AM UTC
```

### Row Level Security (RLS)

**Все таблицы** имеют RLS enabled:

**Категории политик:**

1. **Public read** - данные каталога
2. **User-scoped** - заказы, wishlist, дети
3. **Admin-only** - операции управления
4. **Гибридные** - создание заказов (auth + anon)

---

## 🚀 SEO и производительность

### SSR и кеширование

**Nuxt Route Rules:**

```typescript
routeRules: {
  '/': { swr: 600 },                    // 10 мин
  '/catalog': { swr: 1800 },            // 30 мин
  '/catalog/products/**': { swr: 3600 }, // 1 час
  '/profile/**': { ssr: false },        // Client-only
  '/checkout': { ssr: false },          // Client-only
}
```

### SEO модули

- `@nuxtjs/sitemap` - Динамический sitemap
- `@nuxtjs/robots` - robots.txt с clean_param для Yandex
- `nuxt-schema-org` - JSON-LD structured data
- `nuxt-og-image` - Open Graph изображения

### Оптимизация изображений

**Стратегия:**

1. **Загрузка:** Автосжатие + генерация LQIP
2. **Отдача:** WebP формат, responsive breakpoints, lazy loading
3. **Трансформация:** Edge Function `image-transformer`

**Результат:**

- Размер изображений: -70%
- LCP < 2.5s
- CLS < 0.1

### SEO для изображений

**Формула alt-текстов:**

```
[Бренд] + [Название товара] + [Серия] + [Контекст]
```

**Примеры:**

- ✅ `LEGO Конструктор Железный Человек Marvel купить в Казахстане`
- ✅ `Barbie Кукла Принцесса Disney вид сбоку`

**Composable:**

```typescript
const { generateProductImageAlt } = useSeoAltText()

const altText = generateProductImageAlt({
  productName: 'Конструктор Железный Человек',
  brandName: 'LEGO',
  lineName: 'Marvel',
  index: 0,
  totalImages: 5
})
```

### Автоматизация SEO для категорий + бренды

**Цель:** Перехватывать запросы типа "где купить CADA в Алматы"

**Функции:**

- `get_category_brand_combinations()` - все комбинации с товарами
- `generate_category_brand_faq()` - генерация FAQ
- `safe_upsert_category_brand_seo()` - защита уникальных текстов

**Защита уникальных текстов:**
Текст защищён, если:

- Длина > 300 символов ИЛИ
- Содержит HTML-теги (`<h1>`, `<div>`, `<ul>`, `<strong>`)

**Использование:**

1. Открыть `/admin/brand-seo`
2. Нажать "🤖 Автогенерация"
3. Нажать "❓ Генерация FAQ"

---

## ⚠️ Важные правила

### При работе с продуктами

1. **Всегда join `product_images`** для получения галереи
2. **Использовать RPC функции** вместо прямых запросов
3. **Проверять наличие на складе** перед добавлением в корзину
4. **Рекурсивная фильтрация категорий** - `get_filtered_products()` ищет parent+children

### При работе с заказами

1. **Гостевые vs пользовательские:**
   - Гости: `create_guest_checkout()` (требует email/phone)
   - Пользователи: `create_user_order()` (привязка к `profile_id`)
2. **Статусы:** `new` → `confirmed` → `shipped` → `completed` / `cancelled`
3. **Обработка бонусов:**
   - Потраченные бонусы списываются НЕМЕДЛЕННО
   - Заработанные бонусы имеют 14-дневную задержку
   - Отмененные заказы возвращают потраченные бонусы

### При работе с аутентификацией

1. **Не обходить middleware** - защищенные маршруты должны оставаться защищенными
2. **Автосоздание профиля** - триггер БД обрабатывает создание при регистрации
3. **Проверки сессии** - всегда проверять сессию на клиенте
4. **Role-based доступ** - проверять `profiles.role` для админ функций

### При работе с Supabase

1. **Type Safety** - всегда регенерировать типы после изменений схемы:
   ```bash
   supabase gen types typescript --local > types/supabase.ts
   ```
2. **RLS Policies** - тестировать с разными ролями (anon, authenticated, admin)
3. **Миграции** - НИКОГДА не редактировать существующие, всегда создавать новые
4. **Edge Functions** - использовать Deno импорты (не Node.js)

### Git Workflow

**Pre-commit Hooks:**

- ESLint auto-fix
- Prettier formatting

**Commit Guidelines:**

- NEVER изменять существующие миграции
- Регенерировать типы после изменений схемы
- Тестировать с разными ролями
- Включать rollback логику в комментарии миграций

---

## 📚 Связанная документация

**Полная техническая документация:**

- [PROJECT_ARCHITECTURE.md](./PROJECT_ARCHITECTURE.md) - Полная архитектура (73KB)
- [OVERVIEW.md](./OVERVIEW.md) - Обзор проекта для бизнеса

**Специализированная документация:**

- [IMAGE_SEO_COMPLETE.md](./IMAGE_SEO_COMPLETE.md) - SEO оптимизация изображений
- [SEO_AUTOMATION.md](./SEO_AUTOMATION.md) - Автоматизация SEO для категорий
- [SEO_TEXT_PROTECTION.md](./SEO_TEXT_PROTECTION.md) - Защита уникальных текстов
- [VUE_QUERY_SETUP.md](./VUE_QUERY_SETUP.md) - Настройка TanStack Query
- [VARIANTS.md](./VARIANTS.md) - Система контейнеров
- [IMAGES.md](./IMAGES.md) - Оптимизация изображений

**Инструкции для разработки:**

- [CLAUDE.md](../CLAUDE.md) - Инструкции для Claude AI

---

**Дата создания:** 21 мая 2026
**Версия:** 1.0
**Автор:** Uhti Commerce Team

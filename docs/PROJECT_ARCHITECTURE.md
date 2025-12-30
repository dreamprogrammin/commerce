# Uhti Commerce Platform - Полная Архитектурная Документация

> **Версия:** 1.0
> **Дата создания:** 2025-12-30
> **Проект:** Full-stack e-commerce платформа для продажи игрушек

---

## Содержание

1. [Обзор проекта](#обзор-проекта)
2. [Технологический стек](#технологический-стек)
3. [Структура проекта](#структура-проекта)
4. [Конфигурация](#конфигурация)
5. [Управление состоянием (Pinia)](#управление-состоянием-pinia)
6. [Backend архитектура (Supabase)](#backend-архитектура-supabase)
7. [Компоненты](#компоненты)
8. [Маршрутизация](#маршрутизация)
9. [SEO и производительность](#seo-и-производительность)
10. [Workflow разработки](#workflow-разработки)

---

## Обзор проекта

**Uhti Commerce Platform** - полнофункциональный интернет-магазин игрушек с расширенной системой лояльности, персонализированными рекомендациями и интеграцией с Telegram.

### Ключевые характеристики

- **Сайт:** https://uhti.kz
- **Локализация:** Русский/Казахский (Казахстан, Алматы)
- **Валюта:** KZT (тенге)
- **Формат телефона:** +7 (XXX) XXX-XX-XX

### Основные функции

#### Для покупателей:
- ✅ Каталог с многоуровневой фильтрацией (категории, бренды, цена, материалы, страны, динамические атрибуты)
- ✅ Персонализированные рекомендации на основе профилей детей
- ✅ Двухуровневая система бонусов (активные + отложенные на 14 дней)
- ✅ Гостевой checkout (заказы без регистрации)
- ✅ Список желаний (wishlist)
- ✅ История заказов с отслеживанием статуса
- ✅ OAuth авторизация через Google
- ✅ Прогрессивная загрузка изображений с LQIP (Low Quality Image Placeholders)

#### Для администраторов:
- ✅ Полноценная админ-панель для управления каталогом
- ✅ Управление продуктами с мультизагрузкой изображений
- ✅ Иерархические категории
- ✅ Система динамических атрибутов
- ✅ Интеграция с Telegram ботом для уведомлений о заказах
- ✅ Управление баннерами и слайдами

---

## Технологический стек

### Frontend

| Технология | Версия | Назначение |
|------------|--------|------------|
| **Nuxt** | 4.0.2 | SSR фреймворк |
| **Vue** | 3.x (latest) | UI фреймворк |
| **TypeScript** | 5.9.2 | Статическая типизация |
| **Tailwind CSS** | 4.1.11 | Utility-first CSS |
| **shadcn-nuxt** | 2.2.0 | UI компоненты (142 компонента) |
| **Pinia** | 3.0.3 | State management |
| **TanStack Query** | 5.90.5 | Серверное кеширование |
| **@nuxt/image** | 1.11.0 | Оптимизация изображений |

### Backend

| Технология | Версия | Назначение |
|------------|--------|------------|
| **Supabase** | 2.64.2 | BaaS платформа |
| **PostgreSQL** | 15 | База данных |
| **Supabase Edge Functions** | - | Serverless функции (Deno) |
| **Supabase Storage** | - | Хранение изображений |
| **Supabase Auth** | - | Аутентификация |

### Инструменты разработки

| Инструмент | Версия | Назначение |
|------------|--------|------------|
| **pnpm** | - | Менеджер пакетов |
| **ESLint** | 9.32.0 | Линтер (@antfu/eslint-config) |
| **Prettier** | 3.6.2 | Форматирование кода |
| **Vitest** | 4.0.16 | Unit тестирование |
| **Storybook** | 10.1.10 | Документация компонентов |
| **lint-staged** | 16.1.4 | Pre-commit хуки |

### Библиотеки UI/UX

- **reka-ui** 2.4.1 - Headless UI примитивы
- **lucide-vue-next** 0.536.0 - Иконки
- **embla-carousel-vue** 8.6.0 - Карусели
- **vue-sonner** 2.0.2 - Toast уведомления
- **gsap** 3.13.0 - Анимации
- **@vueuse/core** 13.6.0 - Vue composables утилиты

---

## Структура проекта

```
/home/malik/projects/commerce/
├── .nuxt/                    # Nuxt build cache (auto-generated)
├── .output/                  # Production build
├── assets/                   # Статические ресурсы
│   └── css/
│       └── tailwind.css      # Tailwind + shadcn темы
├── components/               # Vue компоненты (197 файлов)
│   ├── ui/                   # shadcn-nuxt (142 компонента)
│   ├── global/               # Общие компоненты
│   ├── home/                 # Компоненты главной страницы
│   ├── common/               # Layout компоненты
│   ├── product/              # Компоненты продуктов
│   ├── admin/                # Админ панель
│   └── auth/                 # Аутентификация
├── composables/              # Vue composables (20 файлов)
│   ├── admin/                # Админ composables
│   ├── auth/                 # Auth composables
│   ├── orders/               # Заказы
│   └── *.ts                  # Общие composables
├── docs/                     # Документация проекта
├── layouts/                  # Nuxt layouts (9 файлов)
│   ├── default.vue           # Основной layout
│   ├── admin.vue             # Админ панель
│   ├── catalog.vue           # Каталог с фильтрами
│   ├── checkout.vue          # Checkout flow
│   └── profile.vue           # Профиль пользователя
├── middleware/               # Nuxt middleware
│   └── auth.global.ts        # Глобальная аутентификация
├── pages/                    # File-based routing (36 файлов)
│   ├── admin/                # Админ роуты
│   ├── catalog/              # Каталог
│   ├── profile/              # Профиль (защищен)
│   ├── cart.vue              # Корзина (SSR disabled)
│   ├── checkout.vue          # Checkout (SSR disabled)
│   └── index.vue             # Главная
├── plugins/                  # Nuxt плагины
│   ├── auth-init.client.ts   # Инициализация auth
│   └── vue-query.ts          # TanStack Query setup
├── server/                   # Nuxt server
│   └── api/
│       ├── image-proxy/      # Прокси для изображений
│       └── sitemap-routes.ts # Динамический sitemap
├── stores/                   # Pinia stores (15 stores)
│   ├── core/                 # Auth, profile, personalization
│   ├── publicStore/          # Cart, products, wishlist
│   ├── adminStore/           # Админ управление
│   └── modal/                # Modal state
├── supabase/                 # Supabase конфигурация
│   ├── functions/            # Edge functions (7 функций)
│   │   ├── notify-order-to-telegram/
│   │   ├── confirm-order/
│   │   ├── cancel-order/
│   │   └── ...
│   ├── migrations/           # SQL миграции (100+ файлов, 10,306 строк)
│   ├── config.toml           # Supabase config
│   └── seed.sql              # Seed данные
├── types/                    # TypeScript типы
│   ├── supabase.ts           # Сгенерированные типы из БД (72KB)
│   └── index.ts              # Кастомные типы
├── utils/                    # Утилиты
│   ├── imageOptimizer.ts     # Оптимизация изображений
│   └── slugify.ts            # Генерация slugs
├── app.vue                   # Root компонент
├── CLAUDE.md                 # Инструкции для Claude AI
├── nuxt.config.ts            # Nuxt конфигурация
├── package.json              # NPM зависимости
├── tsconfig.json             # TypeScript config
└── vitest.config.ts          # Vitest config
```

### Всего файлов в проекте:
- **197 Vue компонентов**
- **20 composables**
- **15 Pinia stores**
- **36 страниц**
- **9 layouts**
- **100+ SQL миграций** (10,306 строк)
- **7 Edge Functions**

---

## Конфигурация

### nuxt.config.ts - Основная конфигурация

#### Модули (18 total)
```typescript
modules: [
  '@pinia/nuxt',                        // State management
  '@nuxtjs/supabase',                   // Supabase интеграция
  'shadcn-nuxt',                        // UI компоненты
  'pinia-plugin-persistedstate/nuxt',   // LocalStorage persistence
  '@nuxt/image',                        // Оптимизация изображений
  '@nuxt/icon',                         // Иконки
  '@nuxtjs/robots',                     // robots.txt
  '@nuxtjs/sitemap',                    // Динамический sitemap
  'nuxt-og-image',                      // Open Graph images
  'nuxt-schema-org',                    // Структурированные данные
  '@nuxt/fonts',                        // Оптимизация шрифтов
  '@tailwindcss/vite',                  // Tailwind CSS v4
]
```

#### Правила маршрутизации (Performance)
```typescript
routeRules: {
  '/': { swr: 600 },                    // 10 мин кеш
  '/catalog': { swr: 1800 },            // 30 мин кеш
  '/catalog/products/**': { swr: 3600 }, // 1 час кеш
  '/profile/**': { ssr: false },        // Client-only
  '/checkout': { ssr: false },          // Client-only
  '/cart': { ssr: false },              // Client-only
}
```

#### Оптимизация изображений
```typescript
image: {
  domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
  format: ['webp', 'jpg', 'png'],
  quality: 80,
  screens: {
    xs: 320, sm: 640, md: 768,
    lg: 1024, xl: 1280, xxl: 1536
  }
}
```

#### Vite Build
```typescript
vite: {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'supabase-vendor': ['@supabase/supabase-js']
        }
      }
    }
  }
}
```

### Tailwind CSS 4 Конфигурация

**Файл:** `assets/css/tailwind.css`

**Особенности:**
- **Tailwind CSS v4** (через `@tailwindcss/vite`)
- **CSS Variables** для shadcn тем
- **Dark mode** поддержка
- **tw-animate-css** плагин для анимаций
- **OKLCH color space** для современных цветов
- **Custom utility**: `.app-container` для консистентной раскладки

### TypeScript Конфигурация

```json
{
  "extends": "./.nuxt/tsconfig.json",
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  },
  "exclude": ["supabase/functions"]  // Исключаем Deno функции
}
```

### ESLint Конфигурация

```javascript
import antfu from '@antfu/eslint-config'

export default antfu({
  nuxt: true,
  formatters: true,
  rules: {
    'vue/multi-word-component-names': 'off'
  },
  ignores: ['supabase/functions/**/*']
})
```

### Vitest Конфигурация

```typescript
test: {
  globals: true,
  environment: 'happy-dom',
  setupFiles: ['./tests/setup.ts'],
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html']
  }
}
```

---

## Управление состоянием (Pinia)

### Архитектура хранилищ (15 stores)

Проект использует **domain-driven организацию** Pinia stores с **Composition API** паттерном.

#### Структура директорий

```
stores/
├── core/                    # Кросс-функциональные (3 stores)
│   ├── useAuthStore.ts
│   ├── profileStore.ts
│   └── personalizationStore.ts
│
├── publicStore/             # Клиентские (7 stores)
│   ├── cartStore.ts
│   ├── wishlistStore.ts
│   ├── productsStore.ts
│   ├── categoriesStore.ts
│   ├── childrenStore.ts
│   ├── recommendationsStore.ts
│   └── popularCategoriesStore.ts
│
├── adminStore/              # Админ управление (4 stores)
│   ├── adminProductsStore.ts
│   ├── adminBrandsStore.ts
│   ├── adminCategoriesStore.ts
│   └── adminAttributesStore.ts
│
└── modal/                   # Модальные окна (1 store)
    └── useModalStore.ts
```

### Ключевые хранилища

#### 1. useAuthStore - Аутентификация
**Файл:** `/stores/core/useAuthStore.ts`

**State:**
- `user` (computed) - Текущий пользователь из Supabase
- `isLoggedIn` (computed) - Статус авторизации

**Actions:**
- `signInWithOAuth(provider, redirectTo)` - Google OAuth
- `signOut()` - Выход с очисткой профиля

---

#### 2. profileStore - Профиль пользователя
**Файл:** `/stores/core/profileStore.ts`

**State:**
- `profile` - Полный профиль пользователя
- `isLoading` / `isSaving` - Статусы загрузки

**Getters:**
- `bonusBalance` - Активный баланс бонусов
- `pendingBonuses` - Отложенные бонусы
- `isAdmin` - Проверка роли администратора

**Actions:**
- `loadProfile(force, waitForCreation)` - Загрузка профиля с retry логикой
- `updateProfile(updates)` - Обновление полей профиля
- `clearProfile()` - Очистка состояния

**Особенности:**
- **Race condition protection** - кеширование promise
- **Exponential backoff** - 100ms → 2000ms за 5 попыток
- **Timeout protection** - 10 секунд
- **OAuth совместимость** - ожидание создания профиля триггером

---

#### 3. cartStore - Корзина
**Файл:** `/stores/publicStore/cartStore.ts`

**State:**
- `items` - Массив товаров в корзине
- `bonusesToSpend` - Бонусы к списанию
- `isProcessing` - Статус оформления заказа

**Getters:**
- `totalItems` - Общее количество товаров
- `subtotal` - Сумма до скидки
- `discountAmount` - Размер скидки за бонусы
- `total` - Итоговая сумма
- `bonusesToAward` - Бонусы к начислению

**Actions:**
- `addItem(productIdOrObject, quantity)` - Добавление в корзину
- `removeItem(productId)` - Удаление товара
- `updateQuantity(productId, quantity)` - Изменение количества
- `clearCart()` - Очистка корзины
- `setBonusesToSpend(amount)` - Установка бонусов к списанию
- `checkout(orderData)` - Оформление заказа

**Особенности:**
- **Race condition protection** - флаг `isAddingItem`
- **Автоопределение гость/пользователь** - выбор RPC функции
- **Валидация бонусов** - проверка баланса и лимитов
- **LocalStorage persistence** - сохранение корзины

**Persistence:**
```typescript
{
  persist: {
    key: 'krakenshop-cart-v1',
    pick: ['items', 'bonusesToSpend']
  }
}
```

---

#### 4. productsStore - Каталог продуктов
**Файл:** `/stores/publicStore/productsStore.ts`

**Двухуровневое кеширование:**

**Level 1: Pinia State (Метаданные)**
- `brands` - Все бренды
- `brandsByCategory` - Бренды по категориям
- `attributesByCategory` - Атрибуты по категориям
- `allMaterials` - Глобальный список материалов
- `allCountries` - Глобальный список стран
- `priceRangeByCategory` - Диапазоны цен

**Level 2: TanStack Query (Продукты)**
- Списки продуктов с фильтрами
- **Stale time:** 5 минут
- **GC time:** 10 минут

**Actions (Метаданные - Кешируются):**
- `fetchAllBrands()` - Все бренды
- `fetchBrandsForCategory(slug)` - Бренды категории
- `fetchAttributesForCategory(slug)` - Атрибуты категории
- `fetchAllMaterials()` - Материалы
- `fetchAllCountries()` - Страны
- `fetchPriceRangeForCategory(slug)` - Диапазон цен

**Actions (Продукты - НЕ кешируются в store):**
- `fetchProducts(filters, page, pageSize)` - Основной каталог
- `fetchProductBySlug(slug)` - Продукт по slug
- `fetchFeaturedProducts(limit)` - Избранные
- `searchProductsByQuery(query)` - Поиск

**Результат кеширования:** 33% меньше API вызовов при навигации

---

#### 5. categoriesStore - Категории
**Файл:** `/stores/publicStore/categoriesStore.ts`

**State:**
- `allCategories` - Плоский массив категорий
- `menuTree` - Иерархическое дерево меню
- `additionalMenuItems` - Кастомные пункты меню

**Getters:**
- `categoriesById` - Map<id, category>
- `categoriesBySlug` - Map<slug, category>

**Actions:**
- `fetchCategoryData()` - Загрузка с построением дерева
- `getBreadcrumbs(leafSlug)` - Генерация breadcrumbs
- `getSubcategories(parentSlug)` - Дочерние категории

**Особенности:**
- **Tree building** - автоматическое построение иерархии
- **Breadcrumbs** - обход parent_id до корня
- **Menu filtering** - только `display_in_menu=true`

---

### Паттерны управления состоянием

#### 1. Loading States
Все stores используют флаги `isLoading` / `isSaving`:

```typescript
isLoading.value = true
try {
  // async operation
} finally {
  isLoading.value = false
}
```

#### 2. Error Handling
Консистентный паттерн toast errors:

```typescript
catch (error: any) {
  toast.error('User message', { description: error.message })
}
```

#### 3. Optimistic Updates
Пример из CartStore:

```typescript
const originalData = [...items.value]
items.value = items.value.filter(...)
try {
  await mutation()
} catch {
  items.value = originalData // Rollback
}
```

#### 4. Cache Invalidation
ProductsStore предоставляет гранулярный контроль:

```typescript
clearCache()                    // Все метаданные
clearCategoryCache(slug)        // Конкретная категория
invalidateBrandsCache()         // Только бренды
```

### Зависимости между stores

```
useAuthStore
  └─> useProfileStore (clearProfile on signOut)

useCartStore
  ├─> useProfileStore (bonusBalance)
  └─> useSupabaseUser (auth state)

useWishlistStore
  ├─> useAuthStore (auth state)
  └─> useProductsStore (fetchProductsByIds)

useChildrenStore
  └─> usePersonalizationStore (invalidate after mutations)

useAdminCategoriesStore
  └─> useCategoriesStore (forceRefetch after save)
```

---

## Backend архитектура (Supabase)

### Обзор базы данных

- **Таблиц:** 25+ основных таблиц
- **RLS Policies:** 106 политик безопасности
- **Functions:** 30+ RPC/helper функций
- **Triggers:** 15+ триггеров автоматизации
- **Indexes:** 25+ индексов производительности
- **SQL миграций:** 100+ файлов, 10,306 строк кода

### Основные таблицы

#### profiles - Профили пользователей
```sql
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    active_bonus_balance INT NOT NULL DEFAULT 0,
    pending_bonus_balance INT NOT NULL DEFAULT 0,
    has_received_welcome_bonus BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Особенности:**
- Автосоздание при регистрации (триггер `on_auth_user_created`)
- **Активные бонусы** - доступны для списания
- **Отложенные бонусы** - активация через 14 дней
- **Welcome bonus** - 1000 бонусов на первый заказ

---

#### products - Каталог продуктов
```sql
CREATE TABLE public.products (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    price NUMERIC(10, 2) NOT NULL,
    sku TEXT UNIQUE,
    barcode TEXT,
    category_id UUID REFERENCES categories(id),
    brand_id UUID REFERENCES brands(id),
    bonus_points_award INT NOT NULL DEFAULT 0,
    stock_quantity INT NOT NULL DEFAULT 0,
    sales_count INT NOT NULL DEFAULT 0,

    -- Таргетинг для рекомендаций
    min_age_years INT,
    max_age_years INT,
    gender TEXT,

    -- Материалы и происхождение
    material_id INT REFERENCES materials(id),
    origin_country_id INT REFERENCES countries(id),

    -- Система аксессуаров
    accessory_ids UUID[],
    is_accessory BOOLEAN DEFAULT FALSE,

    is_featured BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Индексы:**
- `idx_products_category_id` - Фильтрация по категории
- `idx_products_sales_count` - Сортировка по популярности
- `idx_products_age_range` - Рекомендации
- `idx_products_gender` - Фильтрация по полу

---

#### product_images - Галерея изображений с LQIP
```sql
CREATE TABLE public.product_images (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    blur_placeholder TEXT,  -- Base64 LQIP data URI
    display_order INT NOT NULL DEFAULT 0,
    alt_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Особенности:**
- Множественные изображения на продукт
- **LQIP (Low Quality Image Placeholder)** для мгновенного blur-up эффекта
- Каскадное удаление с продуктами

---

#### categories - Иерархические категории
```sql
CREATE TABLE public.categories (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories(id),
    is_featured BOOLEAN DEFAULT FALSE,
    display_in_menu BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT DEFAULT 0,
    image_url TEXT,
    blur_placeholder TEXT,
    icon_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Особенности:**
- Самоссылающийся `parent_id`
- Рекурсивные запросы через `get_category_and_children_ids()` RPC
- Featured категории для главной страницы

---

### Система динамических атрибутов

#### attributes - Определения атрибутов
```sql
CREATE TABLE public.attributes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,  -- "Цвет", "Высота куклы"
    slug TEXT NOT NULL UNIQUE,
    display_type TEXT NOT NULL DEFAULT 'select'  -- 'select', 'range', 'color'
);
```

#### attribute_options - Возможные значения
```sql
CREATE TABLE public.attribute_options (
    id SERIAL PRIMARY KEY,
    attribute_id INT REFERENCES attributes(id),
    value TEXT NOT NULL,
    meta JSONB  -- {"hex": "#FF0000"} для цветов
);
```

#### category_attributes - Атрибуты по категориям
```sql
CREATE TABLE public.category_attributes (
    category_id UUID REFERENCES categories(id),
    attribute_id INT REFERENCES attributes(id),
    PRIMARY KEY (category_id, attribute_id)
);
```

#### product_attribute_values - Значения продуктов
```sql
CREATE TABLE public.product_attribute_values (
    product_id UUID REFERENCES products(id),
    attribute_id INT REFERENCES attributes(id),
    option_id INT REFERENCES attribute_options(id),
    PRIMARY KEY (product_id, attribute_id)
);
```

**Пример использования:**
```json
{
  "attribute": "Цвет",
  "options": [
    {"value": "Красный", "meta": {"hex": "#dc2626"}},
    {"value": "Синий", "meta": {"hex": "#2563eb"}}
  ]
}
```

---

### Двойная архитектура заказов

#### orders - Заказы зарегистрированных пользователей (С БОНУСАМИ)
```sql
CREATE TABLE public.orders (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES profiles(id),
    total_amount NUMERIC(10, 2) NOT NULL,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    final_amount NUMERIC(10, 2) NOT NULL,
    bonuses_spent INT NOT NULL DEFAULT 0,
    bonuses_awarded INT NOT NULL DEFAULT 0,
    bonuses_activation_date TIMESTAMPTZ,
    delivery_method TEXT NOT NULL,
    delivery_address JSONB,
    payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    telegram_message_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Статусы:**
```
new → confirmed → shipped → completed
        ↓
     cancelled
```

#### guest_checkouts - Гостевые заказы (БЕЗ БОНУСОВ)
```sql
CREATE TABLE public.guest_checkouts (
    id UUID PRIMARY KEY,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_phone TEXT NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL,
    final_amount NUMERIC(10, 2) NOT NULL,
    delivery_method TEXT NOT NULL,
    delivery_address JSONB,
    payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    telegram_message_id TEXT,
    expires_at TIMESTAMPTZ,  -- Автоочистка через 90 дней
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Ключевые отличия:**

| Особенность | orders (Зарегистрированные) | guest_checkouts (Гости) |
|-------------|----------------------------|-------------------------|
| **User Link** | ✅ `user_id UUID` | ❌ Нет user_id |
| **Контакт** | Из profiles | `guest_name`, `guest_email`, `guest_phone` |
| **Бонусы потрачены** | ✅ `bonuses_spent` | ❌ Нет поля |
| **Бонусы начислены** | ✅ `bonuses_awarded` | ❌ Нет |
| **Дата активации** | ✅ `bonuses_activation_date` | ❌ Нет |
| **Welcome bonus** | ✅ 1000 при первом заказе | ❌ Нет |
| **RLS доступ** | Пользователь видит свои, админы все | **Только админы** |
| **Истечение** | Никогда | ✅ 90 дней после завершения |

---

### Система бонусов

#### Жизненный цикл бонусов

**1. Welcome Bonus (1000)**
```
Регистрация пользователя
  ↓
Триггер: on_profile_created_grant_bonus
  ↓
pending_bonus_balance = 1000
  ↓
Ожидание 14 дней
  ↓
pg_cron: activate_pending_bonuses()
  ↓
active_bonus_balance = 1000
pending_bonus_balance = 0
```

**2. Бонусы за заказ**
```
Пользователь создает заказ
  ↓
create_user_order() вычисляет bonuses_awarded
  ↓
pending_bonus_balance += bonuses_awarded
bonuses_activation_date = NOW() + 14 дней
  ↓
Админ подтверждает заказ
  ↓
Ожидание bonuses_activation_date
  ↓
pg_cron: activate_pending_bonuses()
  ↓
active_bonus_balance += bonuses_awarded
pending_bonus_balance -= bonuses_awarded
status: confirmed → completed
```

**3. Списание бонусов**
```
Пользователь указывает bonuses_to_spend в checkout
  ↓
create_user_order() валидирует:
  - active_bonus_balance >= bonuses_to_spend
  ↓
Вычисление скидки:
  discount = bonuses_to_spend × bonus_conversion_rate
  ↓
Списание НЕМЕДЛЕННО:
  active_bonus_balance -= bonuses_to_spend
  ↓
Сохранение в заказе:
  bonuses_spent = bonuses_to_spend
```

**4. Отмена заказа**
```
Админ/система отменяет заказ
  ↓
cancel_order(order_id)
  ↓
ЕСЛИ order.bonuses_spent > 0:
  active_bonus_balance += bonuses_spent (возврат)
  ↓
ЕСЛИ bonuses_activation_date > NOW():
  pending_bonus_balance -= bonuses_awarded
```

#### Коэффициент конверсии

Хранится в таблице `settings`:
```json
{
  "key": "bonus_system",
  "value": {
    "bonus_conversion_rate": 1.0
  }
}
```

**1 бонус = 1 ₸ скидки** (настраивается)

---

### RPC функции (PostgreSQL)

#### get_filtered_products() - Основной поиск продуктов
```sql
CREATE FUNCTION public.get_filtered_products(
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
RETURNS TABLE (...);
```

**Особенности:**
- **Рекурсивный поиск по категориям** через `get_category_and_children_ids()`
- **Специальный slug "all"** - возвращает все не-корневые категории
- **Мультифильтрация**: бренды, цена, атрибуты, материалы, страны
- **Пагинация**: offset = (page - 1) × page_size
- **Сортировка**: popularity, newest, price_asc, price_desc
- **Изображения** объединены как JSON массив

---

#### create_user_order() - Оформление заказа (зарегистрированный)
```sql
CREATE FUNCTION public.create_user_order(
    p_cart_items JSONB,
    p_delivery_method TEXT,
    p_payment_method TEXT,
    p_delivery_address JSONB,
    p_bonuses_to_spend INT
)
RETURNS UUID
SECURITY DEFINER;
```

**Workflow:**
1. Валидация аутентификации (`auth.uid()`)
2. Вычисление общей суммы
3. Проверка наличия на складе
4. Проверка баланса бонусов (если списываются)
5. Расчет скидки (`bonus_conversion_rate`)
6. Создание заказа в `orders`
7. Вставка товаров в `order_items`
8. **Немедленное списание** потраченных бонусов
9. **Начисление welcome bonus** (1000) на первый заказ
10. Добавление заработанных бонусов в `pending_bonus_balance`
11. Установка `bonuses_activation_date` = NOW() + 14 дней

---

#### create_guest_checkout() - Гостевой checkout
```sql
CREATE FUNCTION public.create_guest_checkout(
    p_cart_items JSONB,
    p_guest_info JSONB,
    p_delivery_method TEXT,
    p_delivery_address JSONB,
    p_payment_method TEXT
)
RETURNS UUID
SECURITY DEFINER;
```

**Workflow:**
1. Валидация guest_info (name, email, phone обязательны)
2. Вычисление итога и проверка склада
3. Создание записи `guest_checkout`
4. Вставка товаров в `guest_checkout_items`
5. **БЕЗ операций с бонусами**

---

#### cancel_order() - Отмена заказа с возвратом бонусов
```sql
CREATE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_table_name TEXT  -- 'orders' | 'guest_checkouts'
)
RETURNS TEXT
SECURITY DEFINER;
```

**Workflow (для пользовательских заказов):**
1. Проверка существования и статуса
2. **Возврат потраченных бонусов** в `active_bonus_balance`
3. **Вычет отложенных бонусов** (если еще не активированы)
4. Обновление статуса на 'cancelled'

---

#### get_personalized_recommendations() - Умные рекомендации
```sql
CREATE FUNCTION public.get_personalized_recommendations(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS SETOF products;
```

**Логика:**

1. **Анонимные пользователи** → Случайные популярные товары
2. **Пользователи с детьми** → Соответствие по:
   - Возраст ребенка (между `min_age_years` и `max_age_years`)
   - Пол ребенка или unisex товары
   - Сортировка по `sales_count DESC`
3. **Пользователи без детей, но с заказами** → Товары из той же категории, что последняя покупка
4. **Зарегистрированные без детей/заказов** → Случайные популярные товары

---

#### activate_pending_bonuses() - Автоматическая активация (pg_cron)
```sql
CREATE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT
SECURITY DEFINER;
```

**Расписание:** Ежедневно в 2:00 AM UTC

**Workflow:**
1. **Активация welcome bonus** для пользователей зарегистрированных 14+ дней назад
2. **Активация бонусов за заказы** где `bonuses_activation_date <= NOW()`
3. **Логирование неудач** в таблицу `bonus_activation_skipped`
4. Возврат сводки: "Обработано X заказов, активировано Y бонусов, пропущено Z"

---

### Edge Functions (Deno)

#### 1. notify-order-to-telegram
**Путь:** `/supabase/functions/notify-order-to-telegram/`
**Триггер:** INSERT в `orders` или `guest_checkouts`

**Workflow:**
1. Проверка источника запроса (должен быть `pg_net`)
2. Загрузка деталей заказа (с join к `profiles` для зарегистрированных)
3. Загрузка изображений товаров из `product_images`
4. Трансформация URL изображений
5. Форматирование Telegram сообщения:
   - Номер заказа (последние 6 символов UUID)
   - Тип покупателя (Зарегистрированный / Гость)
   - Детали покупателя
   - Список товаров с SKU/штрихкод
   - **Бонусы потрачены/начислены** (только для зарегистрированных)
   - Способ доставки и адрес
6. Отправка media group (если есть изображения, макс 10)
7. Добавление inline клавиатуры с кнопками:
   - "✅ Взять в работу" → `assign-order-to-admin`
   - "❌ Отменить" → `cancel-order`
8. Сохранение `telegram_message_id` в запись заказа

---

#### 2. confirm-order
**Путь:** `/supabase/functions/confirm-order/`
**Триггер:** Клик на кнопку "Взять в работу"

**Workflow:**
1. Проверка admin secret
2. Определение типа таблицы (`orders` или `guest_checkouts`)
3. Проверка текущего статуса
4. Обновление статуса на `confirmed`
5. Обновление Telegram сообщения:
   - Новый текст: "✅ ЗАКАЗ ПОДТВЕРЖДЕН"
   - Новые кнопки: "✅ Доставлен" и "❌ Отменить"

---

#### 3. cancel-order
**Путь:** `/supabase/functions/cancel-order/`
**Триггер:** Клик на кнопку "❌ Отменить"

**Workflow:**
1. Проверка admin secret
2. Вызов RPC `cancel_order()` - обрабатывает возврат бонусов
3. Обновление Telegram сообщения:
   - Текст: "❌ ЗАКАЗ ОТМЕНЕН"
   - Удаление всех кнопок
4. Возврат информации о возврате бонусов

---

#### 4. deliver-order
**Путь:** `/supabase/functions/deliver-order/`
**Триггер:** Клик на кнопку "✅ Доставлен"

**Workflow:**
1. Проверка admin secret
2. Обновление статуса на `delivered`
3. Обновление Telegram сообщения:
   - Текст: "✅ ДОСТАВЛЕН"
   - Удаление кнопок

---

#### 5. image-transformer
**Путь:** `/supabase/functions/image-transformer/`
**Триггер:** HTTP запросы от `@nuxt/image`

**Параметры:**
- `bucket` - Имя bucket
- `url` - Путь к изображению
- `width` - Целевая ширина
- `height` - Целевая высота
- `quality` - Качество WebP (default: 75)

**Workflow:**
1. Загрузка из Supabase Storage
2. Изменение размера с Sharp (`fit: 'cover'`)
3. Конвертация в WebP
4. Возврат с cache headers (`max-age=31536000`)

---

### Storage Buckets

| Bucket | Public | Лимит размера | MIME типы | Использование |
|--------|--------|--------------|-----------|---------------|
| **product-images** | ✅ | 50 MiB | image/* | Галереи продуктов |
| **category-images** | ✅ | 50 MiB | image/* | Миниатюры категорий |
| **brand-logos** | ✅ | 50 MiB | image/*, svg | Логотипы брендов |
| **slides-images** | ✅ | 50 MiB | image/* | Карусель главной |
| **banners-images** | ✅ | 50 MiB | image/* | Маркетинговые баннеры |

**RLS политики:**
- **Public read** для всех buckets
- **Admin-only write/delete** через проверку `is_admin()`

---

### Triggers & Автоматизация

#### Управление профилями

**on_auth_user_created** - Автосоздание профиля
```sql
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_profile_creation();
```

**Логика:**
```sql
INSERT INTO public.profiles (id, first_name, role)
VALUES (
  NEW.id,
  COALESCE(NEW.raw_user_meta_data->>'full_name', 'Новый пользователь'),
  'user'
);
```

---

**on_profile_created_grant_bonus** - Welcome Bonus
```sql
CREATE TRIGGER on_profile_created_grant_bonus
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION grant_welcome_bonus();
```

**Устанавливает:**
- `pending_bonus_balance = 1000`
- `has_received_welcome_bonus = TRUE`

**Активируется через 14 дней** via `activate_pending_bonuses()` cron job

---

**trigger_protect_profile_role_update** - Защита ролей
```sql
CREATE TRIGGER trigger_protect_profile_role_update
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION protect_profile_role_update();
```

**Предотвращает** изменение ролей не-админами

---

#### Workflow заказов

**on_new_order_created_send_notification** - Telegram уведомление
```sql
CREATE TRIGGER on_new_order_created_send_notification
AFTER INSERT ON public.orders
FOR EACH ROW WHEN (NEW.status = 'new')
EXECUTE FUNCTION trigger_order_notification();
```

**Вызывает edge function** через `pg_net`:
```sql
PERFORM net.http_post(
  url := 'https://[PROJECT].supabase.co/functions/v1/notify-order-to-telegram',
  body := jsonb_build_object('record', NEW, 'table', 'orders')
);
```

**Параллельный триггер** существует для `guest_checkouts`

---

**on_order_item_insert_update_sales_count** - Счетчик продаж
```sql
CREATE TRIGGER on_order_item_insert_update_sales_count
AFTER INSERT ON public.order_items
FOR EACH ROW EXECUTE FUNCTION update_product_sales_count();
```

**Инкрементирует `products.sales_count`** при добавлении товаров

---

### Row Level Security (RLS)

**Все таблицы** имеют RLS enabled:
```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
```

#### Категории политик:

**1. Public read** (данные каталога)
```sql
FOR SELECT TO public USING (is_active = true)
```

**2. User-scoped** (заказы, wishlist, дети)
```sql
USING (auth.uid() = user_id)
```

**3. Admin-only** (операции управления)
```sql
USING (public.current_user_has_role_internal('admin'))
```

**4. Гибридные политики** (создание заказов)
```sql
FOR INSERT WITH CHECK (
  (auth.role() = 'authenticated' AND auth.uid() = user_id) OR
  (auth.role() = 'anon' AND user_id IS NULL)
)
```

---

## Компоненты

### Архитектура компонентов (197 компонентов)

#### Domain-driven структура

```
components/
├── ui/              # shadcn-nuxt (142 компонента)
├── global/          # Общие на всех страницах
├── home/            # Компоненты главной страницы
├── common/          # Layout и навигация
├── product/         # Секции детальной страницы
├── admin/           # Админ панель
└── auth/            # Аутентификация
```

### Ключевые компоненты

#### 1. ProductCard.vue (Global)
**Назначение:** Универсальная карточка продукта с адаптивными интеракциями

**Особенности:**
- **Desktop:** Галерея изображений по наведению мыши (меняет изображение по mousemove)
- **Mobile:** Свайпаемая карусель с Embla Carousel
- Прогрессивная загрузка с LQIP
- Интеграция wishlist
- Динамическое состояние корзины (добавить/селектор количества)
- Расчет цен со скидками
- Отображение бонусных баллов

**Зависимости:**
- `useCartStore` - Управление корзиной
- `useSupabaseStorage` - Генерация URL изображений
- `ProgressiveImage` - Оптимизированная загрузка
- `QuantitySelector` - Контролы количества

**Паттерн:** Определение устройства с `isTouchDevice` ref:
```typescript
const isTouchDevice = ref(false)
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})
```

---

#### 2. ProgressiveImage.vue (Global)
**Назначение:** Оптимизированная загрузка изображений с множественными стратегиями placeholder

**Props:**
```typescript
interface Props {
  src: string | null
  alt: string
  aspectRatio?: 'square' | 'video' | 'portrait' | '3/4' | '21/9'
  objectFit?: 'cover' | 'contain' | 'fill'
  placeholderType?: 'shimmer' | 'blur' | 'color' | 'lqip'
  blurDataUrl?: string | null
  bucketName?: string
  filePath?: string
  useTransform?: boolean
  eager?: boolean
}
```

**4 стратегии placeholder:**
1. **shimmer** - Анимированный градиент
2. **blur** - Статичный blur CSS
3. **color** - Цветной фон
4. **lqip** - Low Quality Image Placeholder (Base64, ~500 байт)

**LQIP реализация:**
```vue
<div v-if="placeholderType === 'lqip' && blurDataUrl">
  <!-- Крошечное blur изображение -->
  <img
    :src="blurDataUrl"
    class="blur-2xl scale-110 opacity-60"
    aria-hidden="true"
  >
  <!-- Градиентный оверлей -->
  <div class="absolute inset-0 bg-gradient-to-br from-transparent via-black/5 to-black/10" />
</div>
```

**Особенности:**
- Intersection Observer для lazy loading
- Eager loading для above-fold изображений
- Автоматическая WebP трансформация (когда включена)
- Состояния loading/error с graceful fallbacks

---

#### 3. DynamicFilters.vue (Global)
**Назначение:** Боковая панель продвинутых фильтров каталога

**Props:**
```typescript
{
  modelValue: {
    subCategoryIds: string[]
    price: [number, number]
    brandIds: string[]
    materialIds: string[]
    countryIds: string[]
    attributes: Record<string, (string | number)[]>
  },
  priceRange: { min: number, max: number },
  availableBrands: BrandForFilter[],
  availableMaterials: Material[],
  availableCountries: Country[],
  availableFilters: AttributeWithValue[]
}
```

**Особенности:**
- Фильтрация подкатегорий с градиентными кнопками
- Мульти-выбор брендов/материалов/стран
- Динамические фильтры атрибутов (select, color swatch)
- Слайдер диапазона цен с превью в реальном времени
- Бейдж счетчика активных фильтров
- Функция сброса

**Паттерн:** Реактивные обновления с дедупликацией на основе Set:
```typescript
function updateDirectFilter(checked: boolean, key: 'brandIds', id: string) {
  const newSelection = new Set<string>(props.modelValue[key])
  if (checked) newSelection.add(id)
  else newSelection.delete(id)
  emit('update:modelValue', {
    ...props.modelValue,
    [key]: Array.from(newSelection)
  })
}
```

---

#### 4. ProductForm.vue (Admin - 1033 строки)
**Назначение:** Комплексная форма создания/редактирования продуктов

**Ключевые возможности:**
- 2-колоночный responsive layout (основная инфо + боковая панель)
- Загрузка изображений с **автоматической оптимизацией** и LQIP генерацией
- Debounced поиск аксессуаров
- Динамические поля атрибутов на основе категории
- Расчет бонусов в реальном времени
- Атрибуты зависящие от категории
- Inline создание брендов с Command компонентом
- Обработка файлов с индикаторами прогресса

**Процесс оптимизации изображений:**
```typescript
async function handleFilesChange(event: Event) {
  const files = Array.from(target.files)

  const processedFiles = await Promise.all(
    files.map(async (file) => {
      if (shouldOptimizeImage(file)) {
        const result = await optimizeImageBeforeUpload(file)
        return {
          file: result.file,
          previewUrl: URL.createObjectURL(result.file),
          blurDataUrl: result.blurPlaceholder // ← Сгенерированный LQIP
        }
      }
      // Fallback: только blur
      const blurResult = await generateBlurPlaceholder(file)
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        blurDataUrl: blurResult.dataUrl
      }
    })
  )

  newImageFiles.value.push(...processedFiles)
}
```

---

### Composables (20 файлов)

#### useImageState.ts
**Назначение:** Прогрессивная загрузка изображений с Intersection Observer

**Особенности:**
- Lazy loading с 200px root margin
- Debounced URL изменения (150ms) для производительности каруселей
- Поддержка eager loading
- Интеграция кеширования браузера

**Использование:**
```typescript
const { imageRef, isLoaded, isError, shouldLoad, onLoad, onError } =
  useImageState(imageUrl, { eager: false })
```

---

#### useProductGallery.ts
**Назначение:** Синхронизированное состояние карусели для галерей продуктов

**Особенности:**
- Синхронизация основная карусель ↔ миниатюры
- Авто-скролл миниатюр при изменении основной
- Клик для выбора миниатюры
- Интеграция Embla API

**Паттерн:** Синхронизация на основе watcher:
```typescript
watch(emblaMainApi, (api) => {
  if (api) {
    api.on('select', () => {
      selectedIndex.value = api.selectedScrollSnap()
      emblaThumbApi.value?.scrollTo(selectedIndex.value)
    })
  }
})
```

---

#### useCatalogQuery.ts
**Назначение:** Обертка TanStack Query для продуктов каталога

**Конфигурация:**
```typescript
useQuery({
  queryKey: ['catalog-products', categorySlug, sortBy, page, filters],
  queryFn: async ({ signal }) => {
    return await productsStore.fetchProducts(filters, page, pageSize, signal)
  },
  staleTime: 0,           // Всегда свежие
  gcTime: 5 * 60 * 1000,  // 5 мин кеш
  retry: false,
  refetchOnWindowFocus: false
})
```

**Результат:** 33% меньше API вызовов при навигации

---

#### useSupabaseStorage.ts
**Назначение:** Унифицированная генерация URL изображений с поддержкой двух режимов

**Режимы:**

**1. FREE TIER** (IMAGE_OPTIMIZATION_ENABLED = false):
- Публичные URL без трансформации
- Локальная оптимизация перед загрузкой
- Стабильное кеширование браузера

**2. PAID TIER** (IMAGE_OPTIMIZATION_ENABLED = true):
- Supabase Image Transformation API
- Изменение размера на лету, конверсия формата
- Автоматический WebP/AVIF

**Основная функция:**
```typescript
function getImageUrl(
  bucketName: string,
  filePath: string,
  options?: { width, height, quality, format, resize }
): string | null {
  const cacheKey = `${bucketName}:${filePath}:${JSON.stringify(options)}`

  if (imageUrlCache.has(cacheKey)) {
    return imageUrlCache.get(cacheKey)
  }

  const url = IMAGE_OPTIMIZATION_ENABLED && options
    ? getOptimizedUrl(bucketName, filePath, options)
    : getPublicUrl(bucketName, filePath)

  imageUrlCache.set(cacheKey, url)
  return url
}
```

**Паттерн:** In-memory кеширование URL предотвращает мерцание и обеспечивает стабильные ссылки

---

### Паттерны компонентов

#### 1. Props Definition
Строгая TypeScript типизация:

```typescript
// Вариант 1: Interface с defineProps
interface Props {
  product: BaseProduct
  isLoading?: boolean
}
const props = defineProps<Props>()

// Вариант 2: withDefaults для значений по умолчанию
const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  variant: 'default'
})
```

**172 компонента** используют `defineProps` (87% всех компонентов)

---

#### 2. Loading States
Skeleton компоненты для каждого major view:
- ProductGridSkeleton
- ProductCarouselSkeleton
- ProductDetailSkeleton

**Использование:**
```vue
<div v-if="isLoading">
  <Skeleton class="h-5 w-3/4" />
</div>
<div v-else>
  {{ content }}
</div>
```

---

#### 3. Device-Specific Rendering
Определение touch для разного UX:

```typescript
const isTouchDevice = ref(false)
onMounted(() => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
})
```

**Использование:**
```vue
<!-- Desktop: Hover галерея -->
<template v-if="!isTouchDevice">
  <div @mousemove="handleMouseMove">...</div>
</template>

<!-- Mobile: Swipe карусель -->
<template v-else>
  <Carousel>...</Carousel>
</template>
```

---

#### 4. Image Optimization Pattern
3-уровневая стратегия:

**1. LQIP Генерация** (при загрузке):
```typescript
const blurPlaceholder = await generateBlurPlaceholder(file)
// Хранится в БД: blur_placeholder колонка
```

**2. Progressive Loading** (при отображении):
```vue
<ProgressiveImage
  :src="imageUrl"
  :blur-data-url="product.blur_placeholder"
  placeholder-type="lqip"
/>
```

**3. URL Optimization** (настраиваемо):
```typescript
const url = getImageUrl(bucket, path, {
  width: 400,
  quality: 80,
  format: 'webp'
})
```

---

## Маршрутизация

### Полная карта маршрутов

#### Публичные маршруты

**Главная и основные страницы:**
- **`/`** - Главная (layout: `home`, SSR: SWR 10 мин)
- **`/catalog`** - Список категорий (layout: `catalog`, SSR: SWR 30 мин)
- **`/catalog/[...slug]`** - Динамические категории (layout: `catalog`, SSR: SWR 30 мин)
- **`/catalog/products/[slug]`** - Детальная страница продукта (SSR: SWR 1 час)
- **`/brand/[slug]`** - Страница бренда (layout: `default`)
- **`/search`** - Поиск (layout: `blank`)
- **`/cart`** - Корзина (SSR: disabled)

**Checkout и заказы:**
- **`/checkout`** - Оформление заказа (layout: `checkout`, SSR: disabled)
- **`/order/success/[id]`** - Подтверждение заказа (SSR: disabled)

**Профиль (защищенные):**
- **`/profile`** - Профиль пользователя (layout: `profile`, SSR: disabled, auth: required)
- **`/profile/children`** - Профили детей (SSR: disabled, auth: required)
- **`/profile/order`** - История заказов (SSR: disabled, auth: required)
- **`/profile/order/[id]`** - Детали заказа (SSR: disabled, auth: required)
- **`/profile/wishlist`** - Список желаний (SSR: disabled, auth: required)
- **`/profile/bonus`** - История бонусов (SSR: disabled, auth: required)
- **`/profile/settings`** - Настройки (SSR: disabled, auth: required)

**Админ панель (защищенные):**
- **`/admin`** - Dashboard (layout: `admin`, SEO: excluded)
- **`/admin/products`** - Управление продуктами
- **`/admin/products/new`** - Создание продукта
- **`/admin/products/[id]`** - Редактирование продукта
- **`/admin/categories`** - Управление категориями
- **`/admin/brands`** - Управление брендами
- **`/admin/attributes`** - Управление атрибутами
- **`/admin/banners`** - Управление баннерами

---

### Стратегия Layouts (9 layouts)

#### 1. default.vue - Основной layout
**Используется для:** Большинство публичных страниц
**Особенности:**
- Desktop: CommonHeader
- Mobile: CommonAppTabBarMobile с фиксированным позиционированием
- Адаптивные отступы для мобильных (pt-[76px])

#### 2. home.vue - Layout главной страницы
**Используется для:** Только главная страница
**Особенности:**
- Desktop: CommonHeader
- Mobile: CommonMobileHeader (статичный)
- Mobile отступы: pt-[65px]

#### 3. catalog.vue - Layout каталога
**Используется для:** Страницы каталога
**Особенности:**
- Desktop: CommonHeader
- Mobile: CommonCatalogMobileHeader (sticky)
- Mobile отступы: pt-[56px]

#### 4. profile.vue - Layout профиля
**Используется для:** Все страницы профиля
**Особенности:**
- Desktop: Боковая навигация с инфо пользователя
- Mobile: Градиентный header с прокручиваемыми табами, нижняя навигационная панель
- Authentication guard (показывает loader если не авторизован)
- Пункты навигации: Профиль, Дети, Заказы, Wishlist, Бонусы, Настройки

#### 5. admin.vue - Layout админ панели
**Используется для:** Админ панель
**Особенности:**
- Только Desktop (скрыт на мобильных)
- Боковая панель с админ навигацией
- Header с кнопкой выхода
- Пункты меню: Категории, Популярные категории, Слайды, Пользователи, Продукты, Бренды, Атрибуты, Баннеры

#### 6. checkout.vue - Layout checkout
**Используется для:** Процесс checkout
**Особенности:**
- Desktop: CommonHeader
- Минималистичный layout для фокуса на checkout

#### 7. blank.vue - Пустой layout
**Используется для:** Страница поиска
**Особенности:**
- Без header или footer
- Только content slot

---

### Middleware: auth.global.ts

**Защищенные пути:**
- `/profile/**`

**Логика:**
1. Выполняется только на клиенте (пропускает сервер)
2. Проверяет защищенность маршрута
3. Для защищенных:
   - Проверяет сессию через `useSupabaseUser()`
   - Ждет 100ms для инициализации auth после OAuth редиректа
   - Если пользователя нет: Открывает login modal и редиректит на главную
   - Если пользователь найден: Запускает фоновую загрузку профиля (не блокирующая)
4. Для `/login` и `/register`: Редиректит авторизованных на главную

**Особенности:**
- Не блокирующая загрузка профиля (позволяет немедленную навигацию)
- 100ms grace period для обработки OAuth callback
- Модальный login prompt для неавторизованного доступа

---

### Server API Routes

#### 1. /api/sitemap-routes
Загружает продукты, категории и бренды из Supabase для генерации sitemap:
- **Продукты:** 10,000 лимит, приоритет 0.8, changefreq: daily
- **Категории:** 1,000 лимит, приоритет 0.75, changefreq: weekly
- **Бренды:** 1,000 лимит, приоритет 0.6, changefreq: monthly
- **Статичные:** Главная (1.0), Каталог (0.9), Страница брендов (0.7)

#### 2. /api/image-proxy/[...path]
Обход Cloudflare bot detection для Supabase Storage:
- Добавляет правильный User-Agent и headers
- Поддержка всех форматов изображений
- Cache-Control: 1 год immutable
- CORS enabled

---

## SEO и производительность

### SSR/CSR Конфигурация (Nitro Route Rules)

#### Server-Side Rendered (с кешированием):
```javascript
'/': { swr: 600 },                    // 10 мин
'/catalog': { swr: 1800 },            // 30 мин
'/catalog/products/**': { swr: 3600 }, // 1 час
```

#### Client-Side Only (SSR выключен):
```javascript
'/profile/**': { ssr: false },
'/checkout': { ssr: false },
'/cart': { ssr: false },
'/order/**': { ssr: false }
```

---

### SEO Конфигурация

#### Sitemap (`@nuxtjs/sitemap`)
- **Источник:** `/api/sitemap-routes`
- **Исключено:** `/admin/**`, `/profile/**`, `/checkout`, `/cart`, `/search`, `/order/**`, `/confirm/**`, `/register/**`

#### Robots.txt (`@nuxtjs/robots`)
**Разрешено:**
- `/`, `/catalog/**`, `/brand/**`

**Запрещено:**
- `/admin`, `/profile`, `/cart`, `/checkout`, `/search`
- `/confirm`, `/forgot-password`, `/order`, `/register`, `/reset-password`
- `/api/**`, `/*?*` (все query параметры)

---

### Структурированные данные (JSON-LD)

#### Главная страница:
- WebSite schema с SearchAction
- Store schema с гео координатами
- Organization schema (via nuxt-schema-org)
- BreadcrumbList

#### Страницы каталога:
- BreadcrumbList
- CollectionPage
- ItemList (первые 10 продуктов)

#### Страницы продуктов:
- Product schema с brand, offers, availability
- BreadcrumbList

#### Страницы брендов:
- Brand schema
- CollectionPage
- BreadcrumbList

---

### OG Images
- **Главная:** Кастомное статичное изображение
- **Каталог:** Динамический OG image компонент
- **Продукты:** Изображение продукта из Supabase Storage
- **Бренды:** Логотип бренда

---

### Стратегия кеширования

#### Двухуровневое кеширование:

**Level 1: Pinia Store (Метаданные)**
- Бренды по категориям
- Атрибуты по категориям
- Материалы (глобально)
- Страны (глобально)
- Диапазоны цен
- **Время жизни:** До закрытия вкладки

**Level 2: TanStack Query (Продукты)**
- Списки продуктов по комбинации фильтров
- **Stale time:** 5 минут
- **GC time:** 10 минут
- **Результат:** 33% меньше API вызовов на навигации

---

### Оптимизация производительности

#### Vite Build
```typescript
rollupOptions: {
  output: {
    manualChunks: {
      'vue-vendor': ['vue', 'vue-router'],
      'supabase-vendor': ['@supabase/supabase-js']
    }
  }
}
```

#### Оптимизация изображений
- **WebP формат** с качеством 80
- **Responsive breakpoints:** xs(320), sm(640), md(768), lg(1024), xl(1280), xxl(1536)
- **LQIP (Low Quality Image Placeholders)** - Base64 blur previews (~500 байт)
- **Lazy loading** с Intersection Observer (200px root margin)
- **Eager loading** для above-fold изображений

#### Database Indexes
- `idx_products_category_id` - Фильтрация категорий
- `idx_products_sales_count` - Сортировка популярности
- `idx_orders_bonus_activation` - Эффективность cron job
- 25+ индексов всего

---

## Workflow разработки

### Команды разработки

#### Development
```bash
pnpm dev              # Start dev server (http://localhost:3000)
```

#### Production
```bash
pnpm build            # Production build
pnpm preview          # Preview production build
pnpm generate         # Static site generation
```

#### Code Quality
```bash
pnpm lint             # Check for lint errors
pnpm lint:fix         # Auto-fix lint errors
pnpm format           # Format with Prettier
pnpm format:check     # Check formatting without changes
```

#### Testing
```bash
pnpm test             # Run tests in watch mode
pnpm test:ui          # Run tests with UI
pnpm test:coverage    # Generate coverage
pnpm test:run         # Run tests once
```

#### Storybook
```bash
pnpm storybook        # Start Storybook (port 6006)
pnpm build-storybook  # Build Storybook
```

---

### Supabase Local Development

#### Основные команды
```bash
# Start local Supabase
supabase start

# Stop Supabase
supabase stop

# View database (Supabase Studio)
# http://localhost:54323

# Reset database with migrations
supabase db reset

# Create new migration
supabase migration new <migration_name>

# Generate TypeScript types
supabase gen types typescript --local > types/supabase.ts

# Deploy edge function
supabase functions deploy <function_name>

# Test edge function locally
supabase functions serve <function_name>
```

#### Local Ports
- **API:** http://localhost:54321
- **Studio:** http://localhost:54323
- **Inbucket (email):** http://localhost:54324

---

### Git Workflow

#### Pre-commit Hooks
```json
{
  "simple-git-hooks": {
    "pre-commit": "npx lint-staged"
  },
  "lint-staged": {
    "*.{js,jsx,ts,tsx,vue}": ["eslint --fix"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

#### Commit Guidelines
- **NEVER** изменять существующие миграции - всегда создавать новые
- **Регенерировать типы** после изменений схемы: `supabase gen types typescript --local > types/supabase.ts`
- **Тестировать с разными ролями** (anon, authenticated, admin)
- **Включать rollback логику** в комментарии миграций

---

### Важные заметки по реализации

#### При работе с продуктами:
1. **Всегда join `product_images`** для получения галереи
2. **Использовать RPC функции** вместо прямых запросов для фильтрации
3. **Проверять наличие на складе** перед добавлением в корзину
4. **Рекурсивная фильтрация категорий** - `get_filtered_products()` ищет parent+children категории

#### При работе с заказами:
1. **Гостевые vs пользовательские:**
   - Гости: `create_guest_checkout()` RPC (требует email/phone)
   - Пользователи: `create_user_order()` RPC (привязка к `profile_id`)
2. **Статусы заказов:** `pending` → `confirmed` → `delivered` / `cancelled`
3. **Обработка бонусов:**
   - Потраченные бонусы блокируются при создании заказа
   - Заработанные бонусы имеют 14-дневную задержку активации
   - Отмененные заказы возвращают потраченные бонусы

#### При работе с аутентификацией:
1. **Никогда не обходить middleware** - Защищенные маршруты должны оставаться защищенными
2. **Автосоздание профиля** - Триггер БД обрабатывает создание профиля при регистрации
3. **Проверки сессии** - Всегда проверять сессию на клиенте для защищенных действий
4. **Role-based доступ** - Проверять `profiles.role` для админ функций

#### При работе с Supabase:
1. **Type Safety** - Всегда регенерировать типы после изменений схемы
2. **RLS Policies** - Тестировать с разными ролями
3. **Миграции** - Никогда не редактировать существующие, всегда создавать новые
4. **Edge Functions** - Использовать Deno импорты (не Node.js)

---

## Заключение

Uhti Commerce Platform - это **production-ready e-commerce решение** корпоративного уровня с:

✅ **Комплексная система бонусов/лояльности** с отложенной активацией
✅ **Двойная архитектура заказов** (зарегистрированные + гости)
✅ **Интеграция Telegram бота** для управления заказами в реальном времени
✅ **Персонализированные рекомендации** на основе профилей детей
✅ **Динамическая фильтрация атрибутов** для гибкого поиска продуктов
✅ **Row-level security** для защиты данных пользователей
✅ **Автоматизированные workflows** через триггеры и pg_cron
✅ **LQIP оптимизация изображений** для быстрой загрузки
✅ **Масштабируемая архитектура** готовая к росту

### Итоговая сложность:

**Frontend:**
- **197 Vue компонентов** (142 shadcn-nuxt + 55 кастомных)
- **20 composables** для переиспользуемой логики
- **15 Pinia stores** с domain-driven организацией
- **36 страниц** с file-based routing
- **9 layouts** для различных секций

**Backend:**
- **10,306 строк** SQL миграций
- **7 edge функций** (Deno/TypeScript)
- **25+ таблиц** базы данных
- **106 RLS политик**
- **30+ RPC функций**
- **15+ триггеров** автоматизации

**Технологии:**
- Nuxt 4 + Vue 3 + TypeScript
- Tailwind CSS 4 + shadcn-nuxt
- Pinia + TanStack Query
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- GSAP + Embla Carousel
- Vitest + Storybook

Эта архитектура демонстрирует **enterprise-level проектирование базы данных** с тщательным вниманием к безопасности, производительности и пользовательскому опыту.

---

**Файл создан:** 2025-12-30
**Версия документации:** 1.0
**Автор:** Автоматически сгенерировано Claude Code

Для дополнительной информации смотрите специализированную документацию в папке `/docs/`:
- [IMAGE_OPTIMIZATION_GUIDE.md](./IMAGE_OPTIMIZATION_GUIDE.md)
- [LQIP_IMPLEMENTATION.md](./LQIP_IMPLEMENTATION.md)
- [VUE_QUERY_SETUP.md](./VUE_QUERY_SETUP.md)
- [telegram_troubleshooting.md](./telegram_troubleshooting.md)

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Uhti Commerce Platform** - Full-stack e-commerce toy store built with Nuxt 4 and Supabase. Serves customers in Kazakhstan (Almaty) with Russian/Kazakh localization.

**Stack**: Nuxt 4 + Vue 3 + TypeScript + Supabase (PostgreSQL) + Pinia + TanStack Query + Tailwind CSS 4 + shadcn-nuxt

**Site**: https://uhti.kz

## Development Commands

```bash
# Start development server (http://localhost:3000)
pnpm dev

# Production build
pnpm build

# Preview production build
pnpm preview

# Static site generation
pnpm generate

# Linting & Formatting
pnpm lint              # Check for lint errors
pnpm lint:fix          # Auto-fix lint errors
pnpm format            # Format with Prettier
pnpm format:check      # Check formatting without changes
```

## Supabase Local Development

```bash
# Start local Supabase instance
supabase start

# Stop Supabase
supabase stop

# View local database (Supabase Studio)
# Open http://localhost:54323 after 'supabase start'

# Reset database with migrations and seed data
supabase db reset

# Create new migration
supabase migration new <migration_name>

# Generate TypeScript types from database schema
supabase gen types typescript --local > types/supabase.ts

# Deploy edge functions
supabase functions deploy <function_name>

# Test edge function locally
supabase functions serve <function_name>
```

**Local Ports**:

- API: http://localhost:54321
- Studio: http://localhost:54323
- Inbucket (email testing): http://localhost:54324

## Architecture Overview

### Frontend Architecture

**File-based Routing** (`/pages`): Nuxt auto-generates routes from Vue files

- `/pages/index.vue` → Homepage
- `/pages/catalog/[...slug].vue` → Dynamic catalog (categories/products)
- `/pages/admin/**` → Admin dashboard
- `/pages/profile/**` → User profile (SSR disabled)
- `/pages/checkout.vue` → Checkout flow (SSR disabled)

**State Management** (`/stores`): Pinia stores with domain-driven organization

- `/stores/core/` - Auth, profile, personalization (cross-cutting concerns)
- `/stores/publicStore/` - Cart, products, categories, wishlist (customer-facing)
- `/stores/adminStore/` - Product/category/brand management (admin-only)
- `/stores/modal/` - Global modal state

All stores use `pinia-plugin-persistedstate` for localStorage persistence.

**Components** (`/components`): Feature-organized structure

- `/components/ui/` - shadcn-nuxt components (Button, Dialog, Input, etc.)
- `/components/auth/` - Login/register modals
- `/components/admin/` - Admin panel components
- `/components/product/` - Product cards, galleries, filters
- `/components/home/` - Homepage sections

**Layouts** (`/layouts`):

- `default.vue` - Main layout with header/footer
- `admin.vue` - Admin dashboard layout
- `catalog.vue` - Catalog with filters sidebar
- `checkout.vue` - Checkout flow layout
- `blank.vue` - No header/footer

### Backend Architecture

**Supabase Edge Functions** (`/supabase/functions`):

- `notify-order-to-telegram` - Telegram bot notifications for new orders
- `confirm-order` - Order confirmation workflow
- `cancel-order` - Order cancellation logic
- `image-transformer` - Image transformation service

**Database RPC Functions** (PostgreSQL stored procedures):

- `get_filtered_products()` - Main catalog query with filters (category, brand, price, attributes, materials, countries)
- `get_recommendations()` - Personalized product recommendations based on user history/age
- `create_guest_checkout()` - Guest order creation with bonus spending
- `create_user_order()` - Authenticated user order with profile linking
- `cancel_order()` - Order cancellation with bonus refund logic
- `get_brands_by_category()` - Brands available in specific category
- `get_attributes_for_category_slug()` - Dynamic attributes per category
- `get_price_range()` - Min/max price for category

**Key Database Tables**:

- `products` - Main product catalog (name, price, description, bonus_points, stock)
- `product_images` - Gallery images with blur placeholders (LQIP)
- `categories` - Hierarchical categories (parent_id for nesting)
- `brands` - Brand information
- `orders` / `order_items` - Order management with guest support
- `profiles` - User profiles with bonus balance
- `bonus_transactions` - Bonus transaction history (earned/spent/pending)
- `attributes` / `attribute_options` - Dynamic product attributes (size, age, color, etc.)
- `children` - Child profiles for age-based recommendations
- `wishlist` - Favorite products per user
- `banners` / `slides` - Marketing content

**Row Level Security (RLS)**: All tables have RLS policies

- Public read access for products, categories, brands
- Admin-only write access for catalog management
- User-specific access for profiles, orders, wishlist

### Authentication Flow

**Google OAuth Integration**:

1. User clicks "Sign in with Google"
2. Supabase Auth handles OAuth flow
3. On successful auth, `profiles` table trigger auto-creates profile
4. Profile includes: `full_name`, `avatar_url`, `active_bonus_balance`, `role`

**Middleware** (`/middleware/auth.global.ts`):

- Protects `/profile/**` routes (requires authentication)
- Redirects logged-in users away from `/login` and `/register`
- Opens login modal if unauthenticated user tries to access protected route

### Bonus/Loyalty Program

**How it works**:

1. Products have `bonus_points_award` field (earn on purchase)
2. Users have `active_bonus_balance` and `pending_bonus_balance` in `profiles` table
3. Orders track `bonuses_spent` and `bonuses_awarded`
4. New bonuses have 14-day activation period (`activation_date` column)
5. Bonuses can be spent as discount during checkout (tracked in `bonus_transactions` table)

**Important Logic**:

- Welcome bonus on signup (handled by database trigger)
- Bonus activation after 14 days (check `activated_at` timestamp)
- Bonus refund on order cancellation
- Guest orders don't earn bonuses (require profile linkage)

### Caching Strategy

**Two-level caching** (see `/docs/VUE_QUERY_SETUP.md`):

1. **Pinia Store Cache** (Metadata):
   - Brands by category
   - Attributes by category
   - Materials (global)
   - Countries (global)
   - Price ranges
   - **Lifetime**: Until tab close

2. **TanStack Query Cache** (Products):
   - Product lists per filter combination
   - **Stale time**: 5 minutes
   - **GC time**: 10 minutes
   - **Result**: 33% fewer API calls on navigation

**Nuxt Route Rules** (SSR caching):

- `/` - 10 min SWR
- `/catalog` - 30 min SWR
- `/catalog/products/**` - 1 hour SWR
- `/profile/**`, `/checkout`, `/cart` - SSR disabled (client-only)

### Image Optimization

**Supabase Storage Buckets**:

- `product-images` - Product galleries
- `category-images` - Category thumbnails
- `brand-logos` - Brand logos
- `slides-images` - Homepage carousel
- `banners` - Marketing banners

**LQIP Implementation** (Low Quality Image Placeholders):

- All images have `blur_placeholder` column (Base64 data URI)
- Stored during upload for instant blur-up effect
- See `/docs/LQIP_IMPLEMENTATION.md` for details

**Image Transformation**:

- Supabase Image Transformation API used via `@nuxt/image`
- WebP format with quality 80
- Responsive breakpoints: xs(320), sm(640), md(768), lg(1024), xl(1280), xxl(1536)

### SEO Configuration

**Modules**:

- `@nuxtjs/sitemap` - Dynamic sitemap from `/api/sitemap-routes`
- `@nuxtjs/robots` - robots.txt generation
- `nuxt-schema-org` - JSON-LD structured data (Organization schema)
- `nuxt-og-image` - Open Graph images for social sharing

**Excluded from SEO**:

- `/admin/**` (noindex)
- `/profile/**`, `/checkout`, `/cart` (private pages)
- `/order/**`, `/confirm/**` (dynamic pages)

## Important Implementation Notes

### When Working with Products

1. **Always join `product_images`** to get gallery images
2. **Use RPC functions** instead of direct table queries for filtering
3. **Check stock availability** before allowing add-to-cart
4. **Recursive category filtering** - `get_filtered_products()` searches parent+children categories

### When Working with Orders

1. **Guest vs User Orders**:
   - Guest orders: Use `create_guest_checkout()` RPC (requires email/phone)
   - User orders: Use `create_user_order()` RPC (links to `profile_id`)
2. **Order States**: `pending` → `confirmed` → `delivered` / `cancelled`
3. **Bonus Handling**:
   - Spent bonuses are locked on order creation
   - Earned bonuses have 14-day activation delay
   - Cancelled orders refund spent bonuses

### When Working with Authentication

1. **Never bypass middleware** - Protected routes must stay protected
2. **Profile auto-creation** - Database trigger handles profile creation on signup
3. **Session checks** - Always verify session on client-side for protected actions
4. **Role-based access** - Check `profiles.role` for admin features

### When Working with Supabase

1. **Type Safety** - Always regenerate types after schema changes:
   ```bash
   supabase gen types typescript --local > types/supabase.ts
   ```
2. **Contract Versioning** - При обновлении контрактов (типов), обязательно поднимайте версию в package.json
3. **RLS Policies** - Test with different roles (anon, authenticated, admin)
4. **Migrations** - Never edit existing migrations, always create new ones
5. **Edge Functions** - Use Deno imports (not Node.js)

### When Working with Stores

1. **Import from full path** - `@/stores/core/useAuthStore` (not relative)
2. **Persistence** - Stores auto-persist to localStorage (be careful with sensitive data)
3. **Clear cache** - Call `clearCache()` methods after mutations
4. **Reactivity** - Use `storeToRefs()` to maintain reactivity when destructuring

### Admin Panel Access

**How to check admin status**:

```typescript
const profile = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user.id)
  .single()

const isAdmin = profile.role === 'admin'
```

**Admin routes** (`/pages/admin/**`):

- Products management with image gallery upload
- Categories (hierarchical tree)
- Brands management
- Product attributes
- Banner placement system

## Common Patterns

### Fetching Filtered Products

```typescript
// Always use the RPC function for catalog queries
const { data } = await supabase.rpc('get_filtered_products', {
  p_category_slug: 'toys',
  p_sort_by: 'newest',
  p_page: 1,
  p_page_size: 24,
  p_brand_ids: ['brand-uuid'],
  p_attribute_ids: ['attr-uuid'],
  p_min_price: 1000,
  p_max_price: 50000,
  p_material_ids: ['material-uuid'],
  p_country_ids: ['country-uuid']
})
```

### Image Upload to Supabase Storage

```typescript
// Upload with blur placeholder
const file = event.target.files[0]
const fileName = `${uuidv4()}.${file.name.split('.').pop()}`
const { data, error } = await supabase.storage
  .from('product-images')
  .upload(fileName, file)

// Generate blur placeholder (use canvas + toDataURL)
```

### Using TanStack Query

```typescript
// In composable
const { data, isLoading, isFetching } = useQuery({
  queryKey: ['catalog-products', categorySlug, sortBy, page],
  queryFn: async () => {
    return await productsStore.fetchProducts(filters)
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000
})
```

### Modal Management

```typescript
// Open login modal
const modalStore = useModalStore()
modalStore.openLoginModal()

// Close modal
modalStore.closeModal()
```

## Project-Specific Rules

1. **Language**: All user-facing text in Russian (primary) or Kazakh. Comments/docs can be Russian or English.
2. **Currency**: Prices in KZT (тенге). Format: `1 000 ₸` with space separator.
3. **Phone Format**: Kazakhstan format `+7 (XXX) XXX-XX-XX`
4. **Image Optimization**: Always generate blur placeholders for new images
5. **Bonus Points**: Display prominently on product cards (`+50 бонусов`)
6. **Telegram Notifications**: Orders trigger Telegram bot notifications (configured in Supabase config)

## Как мы работаем

Правила выведены из практики на этом проекте. Каждое стоит на конкретной поломке — они не абстрактные.

> **Сначала инструкция, потом реализация.** По любому промпту первым делом перечитать этот раздел и память по проекту, и только после этого браться за файлы. Что именно из него нужно достать до первой правки: какая ветка заводится под задачу (п. 1), нужна ли миграция и в каком порядке она поедет (п. 3), правится ли что-то на проде (п. 8), чем задача будет проверена (п. 12–15).
>
> Правило добавлено 2026-08-11 по просьбе владельца. Раздел вырос до размера, на котором «помню в общих чертах» перестаёт работать, а цена промаха тут не косметическая: одна общая боевая база и живые заказы.

> **Состояние незакрытых работ — в [docs/HANDOFF.md](./docs/HANDOFF.md).** Читать сразу после этого раздела: там на чём остановились, что уже опровергнуто и проверять заново не надо, что заблокировано до слова владельца, и ловушки окружения (pnpm вне PATH, скрипты Playwright только из корня репозитория, kong-контейнер локального Supabase, кэш PageSpeed). Файл живёт по стабильному пути и перезаписывается — датами он не копится.
>
> Правило добавлено 2026-08-17 по просьбе владельца: работа продолжается с разных машин, и сессия должна подхватывать состояние, а не выводить его заново из истории коммитов. Кто заканчивает работу — обновляет файл.

### Ветки и выкатка

> **Выкатку `dev` → `master` не предлагать. Никогда.** Ни отдельным вопросом, ни строкой «что осталось» в отчёте, ни напоминанием, что работа накопилась и на сайте её ещё нет. Решение о выкатке принимает владелец проекта: для него нужны данные, которых у агента нет, — готовность бизнеса к изменениям, договорённости с людьми, что сейчас происходит с заказами. Выполнять только по прямому недвусмысленному указанию, и даже тогда сначала проверять порядок из пункта 3.
>
> Правило стоит на 8 августа 2026: предложение прозвучало в нескольких отчётах подряд, вылилось в мердж, затем откат, force-push, удаление деплоя — и `uhti.kz` отдавал 404, пока это разбирали. Сам факт, что в `dev` что-то лежит невыкаченным, поводом заговорить о выкатке не является.

1. **Ветка на задачу**: `fix/*` (баг), `feat/*` (новое), `test/*` (тесты), `refactor/*` (ревью и рефакторинг) — от `dev`. Мердж `--no-ff` в `dev`, потом пуш. Слитые ветки удалять. Ветка заводится **до первой правки файла**, а не после неё.
   - **`refactor/*` — это правки без изменения поведения**: правки по замечаниям код-ревью, переименования, вынос дублей, разбор длинных компонентов, чистка мёртвого кода. Отсюда и способ проверки: сборка и линтер зелёные не сами по себе, а **страница до и после выглядит и работает одинаково** — сверять глазами в браузере (п. 15), а не рассуждением о том, что смысл сохранён.
   - Если по дороге в `refactor/*` нашёлся настоящий баг — чинить его **отдельной `fix/*`**, а не заодно. Смешанная ветка не даёт откатить рефакторинг, не откатив заодно фикс, и наоборот.
   - **Перед мерджем — синхронизация с `origin/dev`.** `git fetch`, посмотреть расхождение в обе стороны и влить `origin/dev` к себе обычным `--no-ff` мерджем. Пока шла работа, туда почти всегда успевают влить чужое. После вливания **пересобрать и перепроверить заново**: чужой коммит бывает глобальным — 11 августа 2026 это оказались `targets` для Lightning CSS, менявшие вывод CSS во всём приложении, и мобильная плашка после них выглядела иначе. Пуш обязан уходить fast-forward.
   - **Force-push в `dev` — никогда.** Если пуш отвергнут, ветка отстала: синхронизироваться и повторить. Форс затирает чужую работу; на этом проекте один force-push уже клал `uhti.kz` в 404 (см. врезку выше).
2. **`dev` — это прод-база, но ещё не прод-сайт.** Пуш в `dev` собирает на Vercel превью; `uhti.kz` крутит сборку с `master` (проверено 2026-08-07: домен висит на деплое из `master`). А вот база у превью и у прода **одна и та же, боевая**. Отсюда: миграция из `dev` бьёт по живым покупателям сразу, а фронт доезжает только мерджем `dev` → `master`.
3. **Порядок выкатки жёсткий**: миграции → эдж-функции → фронт. Обратный порядок кладёт оформление у всех: фронт всегда шлёт новые параметры RPC, и на базе без них падает каждый заказ. В эту же сторону окна нет — живой `master` переживает миграцию, недостающие параметры возьмут `DEFAULT`. Ради этого же параметры добавляются только с `DEFAULT`, а старая сигнатура сносится явным `DROP` (см. п. 10).
4. **Делить работу по зависимости от базы.** Если часть изменений не требует миграций, выносить её отдельной веткой и выкатывать сразу, не дожидаясь готовности схемы.
5. **Миграции применяет CI, не руки.** Workflow «Миграции Supabase»: на каждый пуш в `dev` сверяет git с прод-базой и краснеет при расхождении; само применение — кнопкой Run workflow с подтверждением `APPLY`. Ручное применение через SQL-редактор дашборда — то, из-за чего схема разъехалась с репозиторием на два месяца; так больше не делаем.

### Прод-база

6. **Прод — канон.** Репозиторий обязан его воспроизводить. Если разошлись — правится репозиторий.
7. **Тела функций для миграций снимать с прода** через `pg_get_functiondef`, а не брать из файлов репозитория: они уже расходились, и `CREATE OR REPLACE` из устаревшего файла затирал рабочую функцию.
8. **Запись в прод — только по явному слову пользователя**, и сначала показать точную команду. Чтение (Management API, `pg_get_functiondef`, `information_schema`) — свободно.
9. **Перед `db push` всегда `--dry-run`** и показать список.
10. **Параметр с `DEFAULT` не заменяет функцию, а создаёт перегрузку.** Прежний вызов подойдёт обеим, и PostgREST ответит «function is not unique». Всегда `DROP` старой сигнатуры явно, в конце миграции — проверка, что осталась ровно одна версия.
11. **Миграции, пересоздающие функции, начинать с проверки состояния**, которая падает, если база не та, под которую всё готовилось. `DROP FUNCTION IF EXISTS` при несовпадении сигнатуры молчит и оставляет две версии.

### Проверка

12. **Проверять запуском, а не рассуждением.** Гонять на локальной базе в транзакции с `ROLLBACK`. Вывод «по схеме должно работать» уже подводил.
13. **Тест на баг должен падать без правки.** Отложить фикс, убедиться, что тест краснеет, вернуть.
14. **Сверяться с базовым уровнем.** В репозитории есть предсуществующие падения линтера; сравнивать до и после, чтобы не приписывать чужое своей работе и не прятать своё в чужом.
15. **Браузер есть — смотреть глазами, а не отговариваться его отсутствием.** Playwright лежит в `node_modules`; скрипт кладётся в корень репозитория (из `/tmp` импорт не разрешится) и запускается `node <файл>.mjs`. Открывается и локальный `pnpm dev`, и прод. Доступно всё, что нужно для проверки вёрстки: скриншоты на нужной ширине, `getComputedStyle`, ошибки консоли, коды ответов. Так уже ловились баги, невидимые ни в сборке, ни в тестах: карточки «Похожих товаров» 323px вместо 254, перенос знака ₸ на вторую строку. **Единственное, что закрыто — страницы за логином** (`/profile/**`): вход через Google OAuth агенту недоступен, и вот это в отчёте называть прямо.

### Отчёт

16. **Говорить, что не проверено.** Отдельным пунктом, а не умолчанием.
17. **Поправлять свои прежние утверждения**, когда они оказались неверны, — коротко и по делу.
18. **Не глушить найденное по дороге.** Если под задачей обнаружился отдельный баг — назвать его, даже если чинить не просят.

## Debugging Tips

1. **Supabase Logs**: Check edge function logs via `supabase functions logs <function_name>`
2. **RLS Issues**: Test with `supabase db test` or Supabase Studio SQL editor
3. **Query Performance**: Use `EXPLAIN ANALYZE` for slow RPC functions
4. **Cache Issues**: Clear TanStack Query cache via DevTools or `queryClient.clear()`
5. **Type Errors**: Regenerate Supabase types if schema changed

## Documentation

See `/docs/index.md` for complete documentation index:

- Image optimization guides
- Vue Query setup details
- Telegram bot troubleshooting
- Migration notes

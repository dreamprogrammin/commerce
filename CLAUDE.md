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
- `bonuses` - Bonus transaction history (earned/spent/pending)
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
4. Profile includes: `full_name`, `avatar_url`, `bonus_balance`, `role`

**Middleware** (`/middleware/auth.global.ts`):

- Protects `/profile/**` routes (requires authentication)
- Redirects logged-in users away from `/login` and `/register`
- Opens login modal if unauthenticated user tries to access protected route

### Bonus/Loyalty Program

**How it works**:

1. Products have `bonus_points` field (earn on purchase)
2. Users have `bonus_balance` in `profiles` table
3. Orders track `bonus_spent` and `bonus_earned`
4. New bonuses have 7-day activation period (`activated_at` column)
5. Bonuses can be spent as discount during checkout (tracked in `bonuses` table)

**Important Logic**:

- Welcome bonus on signup (handled by database trigger)
- Bonus activation after 7 days (check `activated_at` timestamp)
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
   - Earned bonuses have 7-day activation delay
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

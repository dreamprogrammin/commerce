# 🔍 SEO-аудит uhti.kz: исправления Phase 1 + Phase 2

Источник: полный SEO-аудит (Health Score 57/100), 10 специализированных проверок
(technical, content, schema, sitemap, performance, visual, GEO, SXO, e-commerce,
backlinks). Полный отчёт: `FULL-AUDIT-REPORT.md` / `ACTION-PLAN.md`.

Все правки прошли `eslint` (0 новых ошибок) и **два полных прод-билда**
(`nuxt build`) без ошибок компиляции — это единственная доступная в этой среде
проверка (локальный Supabase/Docker недоступны, живой браузерный e2e-тест не
проводился).

---

## ✅ Phase 1 — критические исправления

### 1. LCP: главный баннер грузился как lazy-изображение

**Проблема:** `components/home/Banners.vue` не передавал `eager`/`fetchpriority`
в `ProgressiveImage`, из-за чего даже первый, видимый без скролла баннер
получал `loading="lazy" fetchpriority="auto"`. Lighthouse (мобильный, throttling):
LCP 11.4–15.6с на всех типах страниц — в 3–6 раз хуже порога "poor" (4с).

```vue
<!-- ❌ БЫЛО -->
<ProgressiveImage v-if="banner.image_url" :src="..." :alt="..." />

<!-- ✅ СТАЛО -->
<ProgressiveImage
  v-if="banner.image_url"
  :src="..."
  :alt="..."
  :eager="index === 0"
  :fetchpriority="index === 0 ? 'high' : 'auto'"
/>
```

**Заодно:** в `components/global/ResponsiveImage.vue` атрibut `loading="lazy"`
был захардкожен статической строкой — проп `eager` влиял только на
`fetchpriority`, но не на `loading`. Исправлено на `:loading="eager ? 'eager' : 'lazy'"`.

**Файлы:** `components/home/Banners.vue`, `components/global/ResponsiveImage.vue`

---

### 2. Битый `og:image` на всех ~170 страницах товаров

**Проблема:** `ogImageUrl` в `pages/catalog/products/[slug].vue` собирался
конкатенацией строк напрямую, без суффикса размера (`_lg.webp`), который
использует `getVariantUrl()` везде в остальном коде. URL возвращал HTTP 400 —
превью ссылок в Telegram/WhatsApp/Instagram/VK ломались на каждом товаре.

```typescript
// ❌ БЫЛО
const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url)
    return 'https://uhti.kz/og-default.jpg'
  return `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/${BUCKET_NAME_PRODUCT}/${product.value.product_images[0].image_url}`
})

// ✅ СТАЛО
const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url)
    return 'https://uhti.kz/og-default.jpg'
  return (
    getVariantUrl(BUCKET_NAME_PRODUCT, product.value.product_images[0].image_url, 'lg')
    || 'https://uhti.kz/og-default.jpg'
  )
})
```

**Файлы:** `pages/catalog/products/[slug].vue`

---

### 3. Отсутствие security-заголовков сайта

**Проблема:** На сайте с оформлением заказа/оплатой не было ни одного
security-заголовка кроме HSTS.

```typescript
// ✅ ДОБАВЛЕНО в nitro.routeRules
'/**': {
  headers: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy-Report-Only': [ /* scoped под реальные origin'ы: Supabase Storage, Google Fonts, GTM/GA */ ].join('; '),
  },
},
```

CSP — в Report-Only режиме, т.к. сайт использует сторонние origin'ы
(Supabase Storage, Google Fonts, GTM/GA); включать enforce-режим нужно после
сбора нарушений.

**Проверено вживую:** `curl -I http://localhost:3000/` через dev-сервер —
все 5 заголовков присутствуют и корректны.

**Файлы:** `nuxt.config.ts`

---

### 4. `/brand/all` в sitemap возвращал 404

**Проблема:** Статическая запись `/brand/all` в `server/api/sitemap-routes.ts`
указывала на несуществующий маршрут — `pages/brand/[slug].vue` не обрабатывает
"all" как валидный слаг бренда. Настоящая страница со списком брендов — `/brands`.

```typescript
// ❌ БЫЛО
const staticPages = [
  { loc: '/', ... },
  { loc: '/catalog', ... },
  { loc: '/brand/all', priority: 0.7, ... }, // 404!
]

// ✅ СТАЛО — запись убрана, страница /brands уже исключена из sitemap
// в nuxt.config.ts (sitemap.exclude)
```

**Заодно нашёл и исправил** ещё 6 живых ссылок на `/brand/all` (404) в других
файлах — 4 из них меняли на `/brands`, 2 были реальным навигационным багом:
подсказки брендов в поиске вели на `/brand/all?brand=X` вместо настоящей
страницы бренда `/brand/X`.

**Файлы:** `server/api/sitemap-routes.ts`, `pages/brand/[slug].vue`,
`pages/brand/[brandSlug]/[lineSlug].vue`, `components/common/AppTabBar.vue`,
`components/global/SearchDrawer.vue`

---

### 5. Дублирующиеся группы `User-agent: *` в robots.txt

**Проблема:** `@nuxtjs/robots` мёржил конфиг из `nuxt.config.ts` **и**
статический файл `public/_robots.txt` — на выходе получались две отдельные
группы `User-agent: *` с частично разным набором правил (второй блок не имел
`Allow: /catalog/**`/`Allow: /brand/**`, а конфиг не блокировал `/login`).
Технически работало (Google мёржит директивы по спецификации), но хрупко для
других краулеров и будущих правок.

```diff
- public/_robots.txt  (удалён)
```

```typescript
// ✅ /login добавлен в единственный источник правды — nuxt.config.ts
disallow: [
  '/admin', '/confirm', '/forgot-password',
  '/login', // ← добавлено, было только в удалённом _robots.txt
  '/order', '/profile', '/register', '/reset-password',
  '/cart', '/checkout', '/search', '/notifications', '/auth',
  '/api/**', '/**/', '/__nuxt', '/_nuxt',
],
```

**Проверено вживую:** `curl 'http://localhost:3000/robots.txt?mockProductionEnv'`
через dev-сервер — одна чистая группа `User-agent: *`, `/login` присутствует.

**Файлы:** `nuxt.config.ts`, удалён `public/_robots.txt`

---

## ✅ Phase 2 — высокоприоритетные улучшения

### 6. Бренды без товара оставались индексируемыми "пустыми полками"

**Проблема:** `useRobotsRule({ index: true, follow: true })` в
`pages/brand/[slug].vue` был захардкожен — бренд без единого товара в наличии
(например `/brand/air-blaster`) индексировался наравне с брендами с полным
каталогом. `filterState.products` грузится клиентским `useQuery` (TanStack) и
на SSR всегда пуст, поэтому решение об индексации нельзя строить на нём напрямую.

```typescript
// ✅ ДОБАВЛЕНО — лёгкий SSR-safe count-запрос отдельно от тяжёлого списка товаров
const { data: brandHasStock } = await useAsyncData(
  `brand-has-stock-${brandSlug}`,
  async () => {
    if (!brand.value)
      return true // fail-open
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.value.id)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
    if (error)
      return true // fail-open
    return (count ?? 0) > 0
  },
  { watch: [brand] },
)

useRobotsRule(
  computed(() => ({ index: brandHasStock.value !== false, follow: true })),
)
```

**Файлы:** `pages/brand/[slug].vue`

---

### 7. Пустой `{}` JSON-LD на всех 45 страницах брендов

**Проблема:** Каждый из 5 JSON-LD блоков на странице бренда при отсутствии
данных (`brand.value` не загружен, либо 0 товаров для `ItemList`) рендерил
`innerHTML: '{}'` — пустой `<script type="application/ld+json">` уходил в
production. Google Rich Results Test помечает такие блоки как "unknown type".

```typescript
// ❌ БЫЛО
script: [
  {
    type: 'application/ld+json',
    innerHTML: () => brand.value ? JSON.stringify({...}) : '{}',
  },
  // ...ещё 4 таких блока
]

// ✅ СТАЛО — computed-массив, блок либо есть целиком, либо не попадает в DOM
script: computed(() => [
  brand.value && {
    type: 'application/ld+json',
    innerHTML: JSON.stringify({...}),
  },
  // ...
  brand.value && filterState.products.value.length > 0 && {
    type: 'application/ld+json',
    innerHTML: JSON.stringify({ /* ItemList */ }),
  },
].filter(Boolean)),
```

**Файлы:** `pages/brand/[slug].vue`

---

### 8. Бонусные баллы не попадали в Product schema

**Проблема:** `additionalProperty` в Product JSON-LD уже заполнялся реальными
атрибутами товара (возраст, материал и т.д.), но не включал бонусные баллы
программы лояльности — реальный, а не выдуманный сигнал (сайт уже начисляет
`bonus_points_award`).

```typescript
// ✅ ДОБАВЛЕНО в schemaAdditionalProperties
const bonusPoints = Number(product.value?.bonus_points_award || 0)
if (bonusPoints > 0) {
  properties.push({ '@type': 'PropertyValue', 'name': 'bonusPoints', 'value': String(bonusPoints) })
}
```

**Файлы:** `pages/catalog/products/[slug].vue`

---

### 9. H1 товара склеивался в один "токен" без пробела

**Проблема:** Два `<span>` внутри `<h1>` (название товара + возрастной
"хвостик") визуально выглядели как две строки за счёт `flex-col`, но между
ними не было пробела в разметке — Vue схлопывает whitespace-only переносы
строк между тегами. Итог: краулеры/скринридеры видели
`"...для детей от 3 летИгрушка от 3 лет от Smoneo"` одним словом.

```vue
<!-- ✅ ДОБАВЛЕНО -->
<span>{{ product.name }}</span>
{{ ' ' }}
<span v-if="audienceText || brandName">Игрушка {{ audienceText }}...</span>
```

**Файлы:** `pages/catalog/products/[slug].vue`

---

### 10. Навязчивая модалка бонусной программы блокировала главную

**Проблема:** `GuestRegistrationPromo.vue` показывал полноэкранную модалку
всем гостям через 3 секунды после загрузки — классический intrusive-interstitial
паттерн, блокирующий H1/хиро-баннер до первого взаимодействия пользователя.
`sessionStorage` — повтор при каждой новой вкладке/сессии.

```typescript
// ❌ БЫЛО: чистый таймер 3с + sessionStorage (сбрасывается каждую сессию)
setTimeout(() => { showPromo.value = true; sessionStorage.setItem(KEY, 'true') }, 3000)

// ✅ СТАЛО: триггер — первое из (скролл 40% высоты | 10с пребывания),
// localStorage с TTL 7 дней вместо sessionStorage
const REPEAT_AFTER_MS = 7 * 24 * 60 * 60 * 1000
const SCROLL_TRIGGER_RATIO = 0.4
const DWELL_TRIGGER_MS = 10000
// ...scroll-listener + setTimeout, оба ведут к trigger(), который
// ставит localStorage-флаг с таймстампом
```

**Файлы:** `components/home/GuestRegistrationPromo.vue`

---

### 11. IndexNow — проверено, уже реализовано

Аудит ошибочно сообщил "IndexNow не реализован" (пропустил
`server/api/seo/`). По факту: key-файл в `public/`, эндпоинт
`server/api/seo/notify-indexing.post.ts`, вызывается из всех 4 admin-сторов
(products/categories/brands/product-lines). Правок не потребовалось.

---

### 12. Разбит на отдельный чанк `vue-draggable-next` (только админка)

**Проблема:** Vite `manualChunks` группировал все зависимости, кроме
gsap/lottie/embla-carousel, в один общий vendor-чанк (~1.2МБ), который грузят
и публичные страницы. `vue-draggable-next` используется только в
`components/admin/products/ProductForm.vue`.

```typescript
// ✅ ДОБАВЛЕНО в vite.build.rollupOptions.output.manualChunks —
// тот же безопасный паттерн, что уже применён для gsap/lottie/embla
if (id.includes('vue-draggable-next') || id.includes('sortablejs'))
  return 'vendor-admin-dnd'
```

**Проверено:** два полных прод-билда, vendor-чанк уменьшился ровно на размер
нового `vendor-admin-dnd` (~42КБ), ошибок инициализации нет (в кодовой базе
есть явный комментарий-предупреждение о прошлой регрессии из-за похожего
рефакторинга — при повторной сборке она не воспроизвелась).

**Файлы:** `nuxt.config.ts`

---

## ⏸️ Сознательно не тронуто

### Item 9/10 — SSR контента страницы товара

**Находка:** весь блок товара (галерея, цена, заголовок, спецификации) обёрнут
в один `<ClientOnly>` (`pages/catalog/products/[slug].vue`, строка ~968) —
это и есть причина, почему картинки/цена/текст не видны краулерам без
выполнения JS (находки GEO/E-commerce аудита). Самое высокоэффективное
исправление из всех, но и самое рискованное — `<ClientOnly>` почти наверняка
добавлен, чтобы скрыть баг несовпадения SSR/клиент-рендера (hydration
mismatch). Без живого браузера с реальными данными Supabase проверить
безопасность удаления невозможно — не стал трогать вслепую.

### Item 8 (частично) — вынос GTM с главного потока

`nuxt-gtag` уже использует лучшую встроенную стратегию (`loadingStrategy: 'defer'`,
это же default). Полный вынос с main thread требует Partytown — новую
зависимость, которую не стал добавлять без возможности проверить, что
аналитика продолжает работать.

### Item 16 — Yandex `Clean-param: brands`

Аудит предлагал исправить опечатку `brands` → `brand` в Yandex-специфичной
секции robots.txt. Не стал: страницы `?brand=X` иногда легитимно
индексируются с уникальным SEO-контентом (`category_brand_seo`) — если
сказать Yandex считать `brand` дубль-параметром, это уберёт из индекса
именно те страницы, которые того заслуживают. Вместо этого в Phase 1 переписан
сам источник sitemap (`server/api/sitemap-routes.ts`), чтобы туда попадали
только реально индексируемые пары категория+бренд.

---

## Как проверялось

- `eslint` по каждому изменённому файлу — 0 новых ошибок (все оставшиеся
  ошибки в затронутых файлах — предсуществующие, не по добавленным строкам).
- Два полных `nuxt build` (клиент + сервер + nitro) — 0 ошибок компиляции.
- Dev-сервер (`nuxt dev`) — вживую проверены `robots.txt` (mockProductionEnv)
  и security-заголовки главной страницы через `curl`.
- **Не проверено вживую** (нет локального Supabase/Docker в этой среде):
  рендер `og:image` с реальными данными товара, запрос
  `category_brand_seo` в sitemap-routes, SSR-запрос `brandHasStock`, поведение
  модалки в браузере. Рекомендуется прогнать `pnpm dev` с локальным Supabase
  (`supabase start`) и открыть несколько товарных/брендовых страниц перед деплоем.

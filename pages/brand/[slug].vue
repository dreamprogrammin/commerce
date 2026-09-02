<script setup lang="ts">
import { pageShell } from '@/lib/shell'

definePageMeta({ layout: 'shell', shell: pageShell })

import type { BrandPageLayout, IBreadcrumbItem, ProductLine } from '@/types'

import { ArrowLeft, Package } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBrandPageFilters } from '@/composables/useBrandPageFilters'
import {
  BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS,
  BUCKET_NAME_BRANDS,
  BUCKET_NAME_PRODUCT,
  BUCKET_NAME_PRODUCT_LINES,
  SITE_OG_IMAGE_URL,
} from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

/** Категория в строке `category_brand_seo` — ровно то, что нужно для ссылки. */
interface BrandLandingCategory {
  id: string
  name: string
  slug: string | null
  href: string | null
  parent_id: string | null
}

const route = useRoute()
const supabase = useSupabaseClient()
const productsStore = useProductsStore()
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const brandSlug = route.params.slug as string
const containerClass = carouselContainerVariants({ contained: 'always' })

// ─── Утилита: очистка HTML + обрезка ────────────────────────────────────────
function cleanDescription(
  html: string | null | undefined,
  maxLength = 200,
): string {
  if (!html)
    return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

// ─── Утилита: короткий SKU ───────────────────────────────────────────────────
function getProductSku(product: { sku?: string | null, id: string }): string {
  if (product.sku)
    return product.sku
  return product.id.replace(/-/g, '').substring(0, 10).toUpperCase()
}

// 1. Умная загрузка информации о бренде
const { data: brand, pending: brandPending } = await useAsyncData(
  `brand-${brandSlug}`,
  async () => {
    let foundBrand = productsStore.brands.find(b => b.slug === brandSlug)

    if (!foundBrand) {
      if (productsStore.brands.length === 0) {
        await productsStore.fetchAllBrands()
        foundBrand = productsStore.brands.find(b => b.slug === brandSlug)
      }
    }
    return foundBrand || null
  },
)

// 🔥 301 редирект для несуществующих брендов (защита SEO)
if (!brand.value && !brandPending.value) {
  throw createError({ statusCode: 404, statusMessage: 'Brand not found', fatal: true })
}

/*
 * Линейки бренда. Обработчик ВОЗВРАЩАЕТ данные, а не раскладывает их по `ref`.
 *
 * Раньше здесь был обычный `ref`, который наполнял `watchEffect`. Обычный
 * `ref` в payload не попадает, поэтому блок «Коллекции» отсутствовал в
 * серверной разметке ЦЕЛИКОМ и вставлялся только после гидратации.
 *
 * Чего это стоило (замер на проде 20 августа, `/brand/mattel`, 412 px):
 * вставка на третьей секунде толкала заголовок «Каталог товаров» с y=402 на
 * y=573 и давала сдвиг 0.0952 при пороге CLS 0.1. Заодно из JSON-LD выпадал
 * `subOrganization` (в разметке прода его не было ни на одном бренде), а
 * ссылки на страницы линеек не видел поисковик — при том что сами эти
 * страницы в карте сайта есть.
 *
 * `default` нужен, чтобы тип остался `Ref<ProductLine[]>`: значение уходит в
 * `useBrandPageFilters`, а тот ждёт именно его, не `ComputedRef`.
 */
const { data: brandProductLines } = await useAsyncData(
  `brand-lines-${brandSlug}`,
  async () => {
    if (!brand.value)
      return []

    const { data, error } = await supabase
      .from('product_lines')
      .select('*')
      .eq('brand_id', brand.value.id)
      .order('name', { ascending: true })

    if (error) {
      console.error('Error loading product lines:', error)
      return []
    }

    return (data ?? []) as ProductLine[]
  },
  { watch: [brand], default: (): ProductLine[] => [] },
)

/**
 * Категории, в которых у бренда есть СВОЙ индексируемый лендинг.
 *
 * Зачем. Со страницы бренда не вело НИ ОДНОЙ ссылки на бренд-лендинги
 * `/catalog/<категория>/brand/<бренд>` — проверено на проде 2 сентября 2026 по
 * /brand/lego, /brand/zuru и /brand/mokatoys. Перелинковка была
 * односторонней: категория → лендинг (`CategoryBrands`), обратно ничего.
 * Search Console показывает, чем это кончилось: лендинг
 * `kukly-dlya-devochek/brand/mermaze` числится как «URL неизвестен Google» —
 * робот до него просто не дошёл, карта сайта тут не помогла.
 *
 * Условие ровно то же, что у `robotsRule` на самой странице каталога и у
 * карты сайта: своя строка в `category_brand_seo` И живой товар по порогу
 * `MIN_PRODUCTS_FOR_BRAND_LANDING`. Ссылаться на адрес, закрытый `noindex`,
 * незачем — он и в карте отсутствует.
 *
 * Товары считаются рекурсивно (`countProductsByCategoryBrand`), как их
 * отбирает `get_filtered_products`: иначе у родительской категории, где все
 * товары разложены по подкатегориям, выйдет ноль.
 *
 * Данные приходят через `useAsyncData`, а не через `ref` с `watchEffect`:
 * блок обязан быть в СЕРВЕРНОЙ разметке. Вставка после гидратации не только
 * невидима роботу — она ещё и толкает страницу вниз, чем уже отличились
 * «Коллекции» (см. комментарий к `brandProductLines` выше).
 */
const { data: brandCategoryLinks } = await useAsyncData(
  `brand-category-links-${brandSlug}`,
  async () => {
    if (!brand.value)
      return []

    const brandId = brand.value.id

    const [seoRows, brandProducts, allCategories] = await Promise.all([
      supabase
        .from('category_brand_seo')
        .select('categories!inner(id, name, slug, href, parent_id)')
        .eq('brand_id', brandId),
      supabase
        .from('products')
        .select('category_id')
        .eq('brand_id', brandId)
        .eq('is_active', true),
      supabase.from('categories').select('id, parent_id'),
    ])

    const rows = (seoRows.data ?? []) as { categories: BrandLandingCategory | null }[]
    if (rows.length === 0)
      return []

    const counts = countProductsByCategoryBrand(
      (brandProducts.data ?? []).map(p => ({
        category_id: p.category_id,
        brand_id: brandId,
      })),
      (allCategories.data ?? []) as { id: string, parent_id: string | null }[],
    )

    const seen = new Set<string>()
    const links: { name: string, path: string }[] = []

    for (const row of rows) {
      const category = row.categories
      // Лендинги живут только у категорий с родителем — как в карте сайта.
      if (!category?.slug || !category.parent_id)
        continue

      const count = counts.get(brandLandingPairKey(category.id, brandId)) ?? 0
      if (!isBrandLandingIndexable(count))
        continue

      const path = buildBrandLandingPath(
        category.href || `/catalog/${category.slug}`,
        brandSlug,
      )
      if (seen.has(path))
        continue
      seen.add(path)
      links.push({ name: category.name, path })
    }

    return links.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  },
  { watch: [brand], default: (): { name: string, path: string }[] => [] },
)

// Загружаем агрегированную статистику бренда
const brandStats = ref<{
  average_rating: number
  total_reviews_count: number
} | null>(null)

async function loadBrandStats() {
  if (!brand.value)
    return

  try {
    const { data, error } = await supabase.rpc('get_brand_stats', {
      p_brand_id: brand.value.id,
    })
    if (!error && data) {
      const stats = data as {
        average_rating: number
        total_reviews_count: number
      }
      if (stats.total_reviews_count > 0) {
        brandStats.value = stats
      }
    }
  }
  catch {
    // Функция может не существовать до миграции
  }
}

// Smart Sidebar
const brandId = computed(() => brand.value?.id)
/*
 * Ожидание — здесь, на уровне страницы, а не внутри композабла: верхнеуровневый
 * await в `<script setup>` компилятор оборачивает в `withAsyncContext`, и после
 * него живы контекст Nuxt и effect scope. Подробности — в комментарии к
 * `useBrandPageSsrProducts`.
 */
const brandSsrProducts = await useBrandPageSsrProducts(brandId)

const filterState = useBrandPageFilters({
  brandId,
  context: 'brand',
  brandProductLines,
  ssrProducts: brandSsrProducts,
})

/*
 * SEO: есть ли у бренда товар вообще (SSR-safe).
 *
 * ⚠️ `filterState.products` грузится клиентским `useQuery` (TanStack) и на SSR
 * всегда пуст — на нём нельзя строить robots/JSON-LD решения без риска
 * случайно noindex-нуть страницы брендов, у которых на самом деле есть товар.
 * Поэтому считаем наличие товара отдельным лёгким SSR-safe запросом.
 *
 * Условие «есть активный товар», а НЕ «есть товар в наличии», как было до
 * 20 августа 2026. Разница важна: у распроданного бренда страница остаётся
 * осмысленной, а привязка к остатку заставляла бы индекс то открываться, то
 * закрываться вслед за складом.
 */
const { data: brandHasProducts } = await useAsyncData(
  `brand-has-products-${brandSlug}`,
  async () => {
    if (!brand.value)
      return true // fail-open: не блокируем индексацию из-за отсутствия данных
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', brand.value.id)
      .eq('is_active', true)
    if (error)
      return true // fail-open: не noindex-им страницу из-за ошибки запроса
    return (count ?? 0) > 0
  },
  { watch: [brand] },
)

watchEffect(() => {
  if (brand.value) {
    loadBrandStats()
    filterState.loadProducts()
    filterState.loadFilterData()
  }
})

// Хлебные крошки
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brands' },
  ]
  if (brand.value) {
    crumbs.push({
      id: brand.value.id,
      name: brand.value.name,
      href: `/brand/${brand.value.slug}`,
    })
  }
  return crumbs
})

const isCustomPage = computed(() => !!(brand.value as any)?.is_custom_page)
const pageLayout = computed(
  () => (brand.value as any)?.page_layout as BrandPageLayout | null,
)

const featuredProductLines = computed(() => {
  if (!pageLayout.value?.featuredLineIds?.length)
    return []
  const ids = new Set(pageLayout.value.featuredLineIds)
  return brandProductLines.value.filter(l => ids.has(l.id))
})

const brandLogoUrl = computed(() => {
  if (!brand.value?.logo_url)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, brand.value.logo_url, 'sm')
})

// ─── SEO ────────────────────────────────────────────────────────────────────
const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

const brandUrl = computed(() => `${siteUrl}/brand/${brandSlug}`)

const metaTitle = computed(() => {
  if (!brand.value)
    return 'Бренд не найден'
  if (brand.value.meta_title)
    return brand.value.meta_title
  if (brand.value.seo_title)
    return brand.value.seo_title
  return `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}`
})

const metaDescription = computed(() => {
  if (!brand.value)
    return `Товары бренда в ${siteName}`
  if (brand.value.meta_description)
    return brand.value.meta_description
  /*
   * `seo_description` — это ВЁРСТКА страницы бренда, а не мета-описание.
   * Раньше она уходила в `<meta name="description">` как есть, и на проде
   * 20 августа `/brand/hstar` отдавал в описании две тысячи знаков HTML
   * (`<h2 data-icon="…">`, списки, абзацы). Поле заполнено разметкой только
   * у одного бренда из 32, поэтому дефект и дожил незамеченным.
   */
  if (brand.value.seo_description)
    return plainExcerpt(brand.value.seo_description, 160)
  if (brand.value.description) {
    return `${plainExcerpt(brand.value.description, 140)}. Доставка по Казахстану.`
  }
  return `Каталог товаров бренда ${brand.value.name} в интернет-магазине ${siteName}. Оригинальная продукция с гарантией качества. Доставка по Казахстану.`
})

const metaKeywords = computed(() => {
  if (brand.value?.meta_keywords?.length)
    return brand.value.meta_keywords.join(', ')
  if (brand.value?.seo_keywords?.length)
    return brand.value.seo_keywords.join(', ')
  return `${brand.value?.name || 'бренд'}, товары бренда, оригинальная продукция, Алматы, Казахстан`
})

const ogImageSrc = computed(
  () => brandLogoUrl.value || SITE_OG_IMAGE_URL,
)

/**
 * Текст «О бренде» простой строкой — для JSON-LD.
 *
 * Читался он из `brand.seo_content`, а такой колонки нет ни в прод-базе, ни
 * в `types/supabase.ts`: рассказ о бренде живёт в `description` (у 30 брендов
 * из 32 это готовая вёрстка с заголовками и абзацами). Поле, которого нет,
 * молча давало `undefined`, поэтому:
 *
 *  • `Brand.description` в разметке отдавал мета-описание вместо текста;
 *  • отдельный блок `BrandSEOContentRenderer` не рисовался ни у одного
 *    бренда — и хорошо, что не рисовался: тот же текст уже показывает
 *    `BrandDescription` внутри шаблона, вышел бы дубль. Поэтому блок убран
 *    целиком, а не «починен».
 *
 * Правильный источник виден на соседней странице линейки
 * (`pages/brand/[brandSlug]/[lineSlug].vue`) — там читается `description`.
 *
 * `plainExcerpt`, а не `substring`: обрезка по границе слова, иначе в
 * разметку уезжает оборванное слово.
 */
const brandDescriptionText = computed(() =>
  plainExcerpt(brand.value?.description, 300),
)

defineOgImage({
  url: ogImageSrc.value,
  width: 1200,
  height: 630,
  alt: computed(() => brand.value?.name || 'Бренд'),
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogImage: ogImageSrc,
  ogUrl: brandUrl,
  ogSiteName: siteName,
  ogLocale: 'ru_RU',
  twitterCard: 'summary',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  twitterImage: ogImageSrc,
  robots: useRobotsContent('index, follow'),
})

// BreadcrumbList JSON-LD
useBreadcrumbSchema(
  computed(() => [
    { name: 'Бренды', path: '/brands' },
    ...(brand.value ? [{ name: brand.value.name }] : []),
  ]),
)

useHead({
  meta: [{ name: 'keywords', content: () => metaKeywords.value || '' }],
  link: [{ rel: 'canonical', href: brandUrl.value }],
  // ⚠️ script — computed-массив, а не статический: каждый блок либо попадает
  // в массив целиком, либо не попадает вовсе (filter(Boolean)). Раньше при
  // отсутствии данных innerHTML возвращал строку '{}', и на страницу
  // отправлялся пустой JSON-LD script-тег с содержимым "{}" —
  // Google Rich Results Test помечает такие блоки как "unknown type"
  // (см. SEO-аудит, находка S-1).
  script: computed(() => [
    // Brand Schema с линейками как subOrganization
    brand.value && {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Brand',
        '@id': `${brandUrl.value}#brand`,
        'name': brand.value.name, // FIX: чистое название без дублирования
        'description': brandDescriptionText.value || metaDescription.value,
        'url': brandUrl.value,
        'logo': brandLogoUrl.value || SITE_OG_IMAGE_URL,
        'image': brandLogoUrl.value || SITE_OG_IMAGE_URL,
        ...(brand.value.seo_keywords?.length && {
          keywords: brand.value.seo_keywords.join(', '),
        }),
        ...(brandProductLines.value.length > 0 && {
          subOrganization: brandProductLines.value.map(line => ({
            '@type': 'Brand',
            '@id': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}#brand`,
            'name': line.name,
            'url': `${siteUrl}/brand/${brand.value!.slug}/${line.slug}`,
            ...(line.logo_url && {
              logo: getVariantUrl(
                BUCKET_NAME_PRODUCT_LINES,
                line.logo_url,
                'sm',
              ),
            }),
            ...(line.description && {
              description: cleanDescription(line.description, 200),
            }),
          })),
        }),
      }),
    },

    // CollectionPage Schema
    brand.value && {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': `Товары бренда ${brand.value.name}`,
        'description': metaDescription.value,
        'url': brandUrl.value,
        'isPartOf': {
          '@type': 'WebSite',
          'name': siteName,
          'url': siteUrl,
        },
        ...(filterState.products.value.length > 0 && {
          numberOfItems: filterState.products.value.length,
          offers: {
            '@type': 'AggregateOffer',
            'lowPrice': Math.min(
              ...filterState.products.value.map(p => Number(p.price)),
            ),
            'highPrice': Math.max(
              ...filterState.products.value.map(p => Number(p.price)),
            ),
            'priceCurrency': 'KZT',
            'offerCount': filterState.products.value.length,
          },
        }),
      }),
    },

    // ItemList Schema — товары бренда (блок целиком отсутствует, если товаров нет)
    brand.value && filterState.products.value.length > 0 && {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        'name': `Товары бренда ${brand.value.name}`,
        'numberOfItems': filterState.products.value.length,
        'itemListElement': filterState.products.value
          .slice(0, 10)
          .map((product, index) => ({
            '@type': 'ListItem',
            'position': index + 1,
            'item': {
              '@type': 'Product',
              'name': product.name,
              'url': `${siteUrl}/catalog/products/${product.slug}`,
              // FIX: очищаем HTML и обрезаем до 200 символов
              ...(product.description && {
                description: cleanDescription(product.description, 200),
              }),
              ...(product.product_images?.[0]?.image_url && {
                image: getImageUrl(
                  BUCKET_NAME_PRODUCT,
                  product.product_images[0].image_url,
                ),
              }),
              // FIX: короткий SKU из поля БД, не slug
              'sku': getProductSku(product),
              // FIX: mpn дублирует sku для устранения варнингов Google
              'mpn': getProductSku(product),
              // FIX: gtin из barcode если есть
              ...(product.barcode ? { gtin: product.barcode } : {}),
              // FIX: brand без дублирования name
              'brand': {
                '@type': 'Brand',
                '@id': `${brandUrl.value}#brand`,
                'name': brand.value!.name,
              },
              'offers': {
                '@type': 'Offer',
                'price': product.final_price ?? product.price,
                'priceCurrency': 'KZT',
                // FIX: Price Drop Snippet для товаров со скидкой
                ...(product.discount_percentage > 0
                  ? {
                      priceSpecification: {
                        '@type': 'UnitPriceSpecification',
                        'priceType': 'https://schema.org/SalePrice',
                        'price': product.final_price ?? product.price,
                        'priceCurrency': 'KZT',
                      },
                    }
                  : {}),
                // FIX: https вместо http
                'availability':
                  product.stock_quantity > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                'url': `${siteUrl}/catalog/products/${product.slug}`,
                'itemCondition': 'https://schema.org/NewCondition',
                'seller': {
                  '@type': 'Organization',
                  'name': siteName,
                  'url': siteUrl,
                },
                // FIX: добавлена политика возврата
                'hasMerchantReturnPolicy': {
                  '@type': 'MerchantReturnPolicy',
                  'applicableCountry': 'KZ',
                  'returnPolicyCategory':
                    'https://schema.org/MerchantReturnFiniteReturnWindow',
                  'merchantReturnDays': 14,
                  'returnMethod': 'https://schema.org/ReturnByMail',
                  'returnFees': 'https://schema.org/FreeReturn',
                },
                // FIX: добавлена доставка
                'shippingDetails': {
                  '@type': 'OfferShippingDetails',
                  'shippingRate': {
                    '@type': 'MonetaryAmount',
                    'value': 0,
                    'currency': 'KZT',
                  },
                  'shippingDestination': {
                    '@type': 'DefinedRegion',
                    'addressCountry': 'KZ',
                  },
                  'deliveryTime': {
                    '@type': 'ShippingDeliveryTime',
                    'handlingTime': {
                      '@type': 'QuantitativeValue',
                      'minValue': 0,
                      'maxValue': 1,
                      'unitCode': 'DAY',
                    },
                    'transitTime': {
                      '@type': 'QuantitativeValue',
                      'minValue': 1,
                      'maxValue': 3,
                      'unitCode': 'DAY',
                    },
                  },
                },
              },
              ...(product.avg_rating
                && product.review_count
                && product.review_count > 0 && {
                aggregateRating: {
                  '@type': 'AggregateRating',
                  'ratingValue': product.avg_rating,
                  'reviewCount': product.review_count,
                  'bestRating': 5,
                  'worstRating': 1,
                },
              }),
            },
          })),
      }),
    },

    // FAQPage Schema
    brand.value && {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': [
          {
            '@type': 'Question',
            'name': `Где купить товары бренда ${brand.value.name} в Казахстане?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Оригинальные товары бренда ${brand.value.name} можно купить в интернет-магазине ${siteName} с доставкой по всему Казахстану. Мы предлагаем широкий ассортимент продукции с гарантией качества.`,
            },
          },
          {
            '@type': 'Question',
            'name': `Как быстро доставляют товары ${brand.value.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': 'Доставка по Алматы осуществляется в течение 1-3 дней. По другим городам Казахстана срок доставки составляет 3-7 дней в зависимости от региона.',
            },
          },
          {
            '@type': 'Question',
            'name': `Какая гарантия на товары ${brand.value.name}?`,
            'acceptedAnswer': {
              '@type': 'Answer',
              'text': `Все товары бренда ${brand.value.name} в нашем магазине оригинальные и имеют официальную гарантию производителя. Возврат и обмен возможен в течение 14 дней.`,
            },
          },
        ],
      }),
    },

    /*
     * Узла `Article` здесь БЫЛО И БОЛЬШЕ НЕТ.
     *
     * Страница бренда — это листинг товаров, а не статья. Разметка объявляла
     * `headline: «<Бренд> - Обзор бренда и каталог товаров»` и `articleBody`
     * длиной в мета-описание (160 знаков), то есть заявляла Google статью,
     * которой на странице нет. Заодно на одном адресе оказывались сразу три
     * типа страницы: `WebPage` (от nuxt-schema-org), `CollectionPage` и
     * `Article`.
     *
     * Это тот же класс ошибки, что уже разбирали на странице категории:
     * узел с неподходящим типом не даёт улучшений в выдаче, а в отчёте
     * Search Console числится ошибкой. Товары и их рейтинги живут в
     * ItemList выше — они на месте и не тронуты.
     */
  ].filter(Boolean)),
})

/*
 * Индексируемость бренд-страницы.
 *
 * Здесь стояло `{ index: brandHasStock.value !== false, follow: true }`, и оно
 * НЕ РАБОТАЛО. `@nuxtjs/robots` собирает строку перебором ключей правила и
 * пропускает всё, чему присвоено `false` (видно в
 * node_modules/@nuxtjs/robots/dist/runtime/app/composables/useRobotsRule.js:
 * `if (value === false || value === null || value === undefined) continue`).
 * Поэтому `{ index: false, follow: true }` разворачивалось просто в `follow`,
 * а `follow` без `noindex` робот читает как разрешение индексировать.
 * Проверено на проде 20 августа: десять бренд-страниц, которые код считал
 * закрытыми, отдавали `x-robots-tag: follow` и лежали в индексе.
 *
 * Закрывать надо явным `noindex: true`, а не отрицанием `index`.
 *
 * Второе изменение — само условие. Закрываются бренды БЕЗ АКТИВНОГО ТОВАРА,
 * кроме перечисленных в BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS: у тех есть
 * поисковый спрос на собственном SEO-тексте, и закрывать их значит выбросить
 * рабочие входы. Цифры и обоснование — в комментарии к константе.
 *
 * `follow: true` в обоих случаях: даже с закрытой страницы ссылки на бренды и
 * категории должны передаваться дальше.
 *
 * см. composables/useRobotsContent.ts — на превью правило закрывается флагом
 */
const keepIndexableWithoutProducts = computed(
  () => BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS.includes(brandSlug),
)

useIndexableRobotsRule(
  computed(() =>
    brandHasProducts.value === false && !keepIndexableWithoutProducts.value
      ? { noindex: true, follow: true }
      : { index: true, follow: true },
  ),
)
</script>

<template>
  <div>
    <!-- Skeleton загрузки бренда -->
    <div v-if="brandPending" :class="`${containerClass} py-4 md:py-8`">
      <div class="space-y-4 md:space-y-6">
        <div class="flex gap-2">
          <Skeleton class="h-4 md:h-5 w-20 md:w-24" />
          <Skeleton class="h-4 md:h-5 w-3 md:w-4" />
          <Skeleton class="h-4 md:h-5 w-24 md:w-32" />
        </div>

        <div
          class="rounded-2xl md:rounded-3xl border border-border/50 bg-gradient-to-b from-muted/40 to-background p-5 md:p-10 lg:p-12"
        >
          <div class="flex flex-col md:flex-row items-center gap-5 md:gap-8">
            <Skeleton class="w-20 h-20 md:w-32 md:h-32 rounded-2xl" />
            <div class="flex-1 space-y-3 text-center md:text-left w-full">
              <Skeleton class="h-8 md:h-12 w-40 md:w-56 mx-auto md:mx-0" />
              <div class="flex gap-2 justify-center md:justify-start">
                <Skeleton class="h-7 w-28 rounded-full" />
                <Skeleton class="h-7 w-24 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Бренд не найден -->
    <div v-else-if="!brand" :class="`${containerClass} py-12 md:py-20`">
      <div class="text-center">
        <div
          class="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-full bg-destructive/10 mb-4 md:mb-6"
        >
          <Package class="w-8 h-8 md:w-10 md:h-10 text-destructive" />
        </div>
        <h1 class="text-2xl md:text-4xl font-bold mb-2 md:mb-3">
          Бренд не найден
        </h1>
        <p
          class="text-sm md:text-base text-muted-foreground mb-6 md:mb-8 max-w-md mx-auto px-4"
        >
          К сожалению, бренд с таким названием не существует или был удален.
        </p>
        <NuxtLink to="/brands">
          <Button>
            <ArrowLeft class="w-4 h-4 mr-2" />
            Все бренды
          </Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Кастомный шаблон -->
    <div v-else-if="isCustomPage" :class="`${containerClass} py-4 md:py-8`">
      <BrandCustomTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :featured-product-lines="featuredProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
      />

      <!--
        Ссылки на бренд-лендинги. Рисуются НА СЕРВЕРЕ и только на те адреса,
        что открыты для индекса, — см. `brandCategoryLinks`.
      -->
      <nav
        v-if="brandCategoryLinks.length > 0"
        class="mt-6 md:mt-12 border-t pt-4 md:pt-8"
        :aria-label="`${brand.name} в категориях`"
      >
        <h2 class="text-base md:text-lg font-semibold mb-3 md:mb-4">
          {{ brand.name }} в категориях
        </h2>
        <div class="flex flex-wrap gap-2 md:gap-2.5">
          <NuxtLink
            v-for="link in brandCategoryLinks"
            :key="link.path"
            :to="link.path"
            class="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            {{ link.name }}
          </NuxtLink>
        </div>
      </nav>
    </div>

    <!-- Стандартный шаблон -->
    <div v-else :class="`${containerClass} py-4 md:py-8`">
      <BrandStandardTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
      />

      <!--
        Ссылки на бренд-лендинги. Рисуются НА СЕРВЕРЕ и только на те адреса,
        что открыты для индекса, — см. `brandCategoryLinks`.
      -->
      <nav
        v-if="brandCategoryLinks.length > 0"
        class="mt-6 md:mt-12 border-t pt-4 md:pt-8"
        :aria-label="`${brand.name} в категориях`"
      >
        <h2 class="text-base md:text-lg font-semibold mb-3 md:mb-4">
          {{ brand.name }} в категориях
        </h2>
        <div class="flex flex-wrap gap-2 md:gap-2.5">
          <NuxtLink
            v-for="link in brandCategoryLinks"
            :key="link.path"
            :to="link.path"
            class="inline-flex items-center rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            {{ link.name }}
          </NuxtLink>
        </div>
      </nav>
    </div>
  </div>
</template>

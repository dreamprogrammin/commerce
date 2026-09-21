<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import type {
  AttributeFilter,
  AttributeWithValue,
  BrandForFilter,
  Country,
  IBreadcrumbItem,
  IProductFilters,
  Material,
  NumericAttributeFilter,
  ProductLine,
  SortByType,
} from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { watchDebounced } from '@vueuse/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCatalogQuery, useCatalogSsrData } from '@/composables/useCatalogQuery'
import { useSafeHtml } from '@/composables/useSafeHtml'
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT, SITE_OG_IMAGE_URL } from '@/constants'
import { categoryStaticFor } from '@/constants/categoryStaticText'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import {
  buildBrandLandingPath,
  countProductsByCategoryBrand,
  decideBrandLanding,
  parseCatalogSlug,
} from '@/utils/brandLanding'
import {
  brandCategoryPhrase,
  brandLandingFacts,
  composeBrandLandingMeta,
  composeBrandLandingSummary,
  composeBrandLandingText,
  composeBrandLandingTitle,
  prependBrandLandingFacts,
} from '@/utils/brandLandingText'
import { isWholeRange } from '@/utils/catalogFilterRange'
import { isCategoryIndexable } from '@/utils/categoryLanding'
import { composeCategoryMeta, hasLegacyTemplateMarks } from '@/utils/seoDescription'

// ─── Ленивая загрузка тяжёлых компонентов ────────────────────────────────────
// DynamicFilters: 28KB + MobileCatalogDrawer — основные виновники
// Script Evaluation 1459ms на мобилке. Грузим только когда нужны.
const DynamicFilters = defineAsyncComponent(
  () => import('@/components/DynamicFilters.vue'),
)
const MobileCatalogDrawer = defineAsyncComponent(
  () => import('@/components/category/MobileCatalogDrawer.vue'),
)

// Некритичные компоненты — грузим после первого рендера
const CategoryBrands = defineAsyncComponent(
  () => import('@/components/category/CategoryBrands.vue'),
)
const CategoryProductLines = defineAsyncComponent(
  () => import('@/components/category/CategoryProductLines.vue'),
)
const CategoryQuestions = defineAsyncComponent(
  () => import('@/components/category/CategoryQuestions.vue'),
)
const CategoryRatingBlock = defineAsyncComponent(
  () => import('@/components/category/CategoryRatingBlock.vue'),
)
const CategoryReviews = defineAsyncComponent(
  () => import('@/components/category/CategoryReviews.vue'),
)
const SEOContentRenderer = defineAsyncComponent(
  () => import('@/components/category/SEOContentRenderer.vue'),
)

definePageMeta({ layout: 'shell' })

// --- 1. Инициализация ---
const route = useRoute()
const router = useRouter()

/*
 * Старые ссылки вида `/catalog/all?q=лего`. Каталог текстового фильтра не
 * имеет — параметр здесь молча игнорировался, и покупатель, нажавший в поиске
 * «Показать все», видел весь каталог вместо найденного (проверено на проде
 * 4 сентября 2026: `?q=lego` отдавал ровно тот же список, что и без него).
 * Такие ссылки уводим на страницу результатов.
 */
if (route.query.q) {
  await navigateTo(
    { path: '/search', query: { q: String(route.query.q) } },
    { replace: true },
  )
}
const supabase = useSupabaseClient()
const categoriesStore = useCategoriesStore()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getVariantUrl } = useSupabaseStorage()
const { sanitizeHtml } = useSafeHtml()

const priceValidUntil = new Date(
  new Date().setFullYear(new Date().getFullYear() + 1),
)
  .toISOString()
  .split('T')[0]

const abortController = ref<AbortController | null>(null)

// ─── ОПТИМИЗАЦИЯ: флаг готовности некритичных данных ──────────────────────────
const isNonCriticalLoaded = ref(false)

onUnmounted(() => {
  if (abortController.value) {
    abortController.value.abort()
  }
})

// ─── Плавающая кнопка «Наверх» на десктопе (из Категория.dc.html) ──────────────
const showScrollTop = ref(false)
let scrollTopTicking = false

function applyScrollTopVisibility() {
  scrollTopTicking = false
  showScrollTop.value = window.scrollY > 560
}

function onWindowScroll() {
  if (!scrollTopTicking) {
    scrollTopTicking = true
    requestAnimationFrame(applyScrollTopVisibility)
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', onWindowScroll, { passive: true })
})
onUnmounted(() => {
  window.removeEventListener('scroll', onWindowScroll)
})

function cleanDescription(html: string | null, maxLength = 200): string {
  if (!html)
    return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}

// --- 1.5. Brand Landing ---
/*
 * Бренд и категория разбираются из пути: `/catalog/boys/brand/mattel`.
 *
 * Раньше бренд приходил параметром `?brand=`, и из-за этого нельзя было
 * включить кеш страниц категорий: vercel-пресет подменяет query-строку в
 * маршруте ISR-функции, и бренд-лендинг отдавал всю категорию. Подробности
 * и цифры — в комментарии к `routeRules` в nuxt.config.ts.
 *
 * Старые адреса с параметром не забыты: их редиректит на новый путь
 * `server/middleware/brand-query-redirect.ts`, постоянным 301.
 */
const catalogSlugParts = computed(() =>
  parseCatalogSlug(route.params.slug as string[] | undefined),
)

const activeBrandSlug = computed(() => catalogSlugParts.value.brandSlug)

/*
 * `useState`, а не `ref`: значение обязано пережить гидратацию.
 *
 * Наполняет его `loadFilterData` внутри `useAsyncData(..., { server: true })`,
 * а на клиенте этот обработчик при гидратации не выполняется — payload по
 * ключу уже есть. Обычный `ref` в payload не попадает, поэтому на сервере
 * бренд-SEO был, а на клиенте становился null. Пока SEO-блок рисовался
 * только на клиенте, это было незаметно; теперь он серверный, и расхождение
 * дало бы рассинхрон гидратации — разный текст на сервере и на клиенте.
 */
const categoryBrandSeo = useState<{
  brand_id: string
  seo_h1: string | null
  seo_title: string | null
  seo_description: string | null
  seo_text: string | null
} | null>('catalog-brand-seo', () => null)
const brandSeoLoading = ref(false)

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ ---
interface FilterAttribute {
  id: number
  name: string
  slug: string
  display_type: string
  unit: string | null
  attribute_options: {
    id: number
    attribute_id: number
    value: string
    meta: any
  }[]
}

interface CatalogProductImage {
  id: string
  image_url: string
  display_order: number
  alt_text: string | null
}

interface CatalogProduct {
  id: string
  name: string
  slug: string
  description: string | null
  price: number
  discount_percentage: number | null
  stock_quantity: number
  product_images: CatalogProductImage[]
  brands: { id: string, name: string, slug: string } | null
}

const currentPage = ref(1)
const PAGE_SIZE = 12
const availableFilters = ref<FilterAttribute[]>([])

/*
 * Бренды и линейки живут в `useState`, а не в обычном `ref`, — иначе блоки,
 * которые ими управляются, схлопываются сразу после гидратации.
 *
 * Механизм. Наполняет их `loadFilterData`, а он вызывается внутри
 * `useAsyncData('catalog-filters-…', { server: true })`. На клиенте
 * обработчик при гидратации НЕ выполняется: payload по ключу уже есть.
 * Обычный `ref` в payload не попадает, поэтому на сервере список был, а на
 * клиенте становился пустым — и `v-if="availableBrands.length > 1"` снимал
 * блок «Другие бренды» вместе с его 211 пикселями.
 *
 * Во что это обходилось: CLS бренд-лендинга 0.2468 и 0.4672 в двух
 * пассивных прогонах браузера при пороге Google 0.1. В отличие от CLS
 * категории (тот оказался лабораторным, см. аудит) этот сдвиг настоящий и
 * воспроизводится.
 *
 * `useState` Nuxt сериализует сам, поэтому значения переживают гидратацию и
 * пустого окна не возникает. Ключ постоянный, без слага: при переходе в
 * другую категорию `loadFilterData` перезапишет списки — ровно так же, как
 * это делали обычные `ref`.
 *
 * Остальные списки (материалы, страны, атрибуты) оставлены обычными `ref`:
 * они управляют содержимым фильтров, а те до открытия скрыты, и их
 * заполнение ничего в потоке страницы не двигает.
 */
const availableBrands = useState<BrandForFilter[]>('catalog-brands', () => [])
const availableProductLines = useState<ProductLine[]>('catalog-lines', () => [])
const availableMaterials = ref<Material[]>([])
const availableCountries = ref<Country[]>([])
const isLoadingFilters = ref(true)

const displayableFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(
    f => f.display_type !== 'number_range' && f.display_type !== 'numeric',
  )
})

const _numericFilters = computed<FilterAttribute[]>(() => {
  return availableFilters.value.filter(f => f.display_type === 'numeric')
})

const numericAttributeRanges = ref<
  Record<number, { min: number, max: number }>
>({})
const accumulatedProducts = ref<CatalogProduct[]>([])
const isMobileFiltersOpen = ref(false)
const isSortDrawerOpen = ref(false)
const isSortPopoverOpen = ref(false)
const isSeoTextExpanded = ref(false)

interface ActiveFilters {
  sortBy: SortByType
  subCategoryIds: string[]
  price: [number, number]
  pieceCount: [number, number] | null
  brandIds: string[]
  productLineIds: string[]
  materialIds: string[]
  countryIds: string[]
  attributes: Record<string, (string | number)[]>
  numericAttributes: Record<number, [number, number]>
}

const activeFilters = ref<ActiveFilters>({
  sortBy: getSortByFromQuery(route.query.sort_by),
  subCategoryIds: getArrayFromQuery(route.query.subcategories),
  price: [0, 50000],
  pieceCount: null,
  brandIds: getArrayFromQuery(route.query.brands),
  productLineIds: getArrayFromQuery(route.query.lines),
  materialIds: getArrayFromQuery(route.query.materials),
  countryIds: getArrayFromQuery(route.query.countries),
  attributes: {},
  numericAttributes: {},
})

const filteredProductLines = computed(() => {
  const selectedBrands = activeFilters.value.brandIds
  if (selectedBrands.length === 0)
    return availableProductLines.value
  return availableProductLines.value.filter(line =>
    selectedBrands.includes(line.brand_id),
  )
})

// --- 3. Вычисляемые свойства ---
const currentCategorySlug = computed(
  () => catalogSlugParts.value.categorySegments.slice(-1)[0] ?? 'all',
)

const activeBrand = computed(() => {
  if (!activeBrandSlug.value || availableBrands.value.length === 0)
    return null
  return (
    availableBrands.value.find(b => b.slug === activeBrandSlug.value) || null
  )
})

/**
 * Название бренда для мета-тегов — отдельным точечным запросом.
 *
 * `activeBrand` выше резолвится через `availableBrands`, а это обычный
 * `ref([])`, который наполняется только на клиенте. На сервере он пуст,
 * поэтому ветка с брендом в `metaTitle` не срабатывала, и страница
 * `?brand=play-smart` отдавала краулеру тот же заголовок, что и категория
 * без фильтра. Обход sitemap 14 августа нашёл так две группы дублей:
 * конструкторы мальчикам (`play-smart`, `mg-toys`) и автотреки (`soba`).
 *
 * Запрос на одну строку и только когда фильтр по бренду вообще выставлен.
 */
/*
 * Бренд из адреса резолвится здесь, до выборки товаров, и берётся не только
 * имя, но и id.
 *
 * Раньше id приходил из `availableBrands`, а тот наполняется в
 * `loadFilterData` — то есть ПОСЛЕ того, как товары уже запрошены. На сервере
 * это означало, что бренд-лендинг отдавал роботу всю категорию: на
 * `/catalog/boys?brand=mattel` было 12 карточек вместо одной, при том что
 * заголовок и H1 бренд показывали правильно. Таких адресов 14 в sitemap —
 * это единственные страницы с фильтром, которые вообще задуманы для индекса.
 *
 * Ключ запроса от этого не разъезжается: `loadFilterData` позже поставит в
 * `activeFilters.brandIds` тот же самый id, и `catalogFilters` останется
 * прежним — ни повторной выборки, ни рассинхрона гидратации.
 */
const { data: activeBrandSeo } = await useAsyncData(
  () => `brand-seo-${activeBrandSlug.value ?? 'none'}`,
  async () => {
    const slug = activeBrandSlug.value
    if (!slug)
      return null

    const { data } = await supabase
      .from('brands')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle()

    return (data as { id: string, name: string | null } | null) ?? null
  },
  { watch: [activeBrandSlug] },
)

const activeBrandSeoName = computed(() => activeBrandSeo.value?.name ?? null)

/*
 * Все товары связки «раздел + бренд» — одной выборкой, без страниц.
 *
 * Зачем отдельно от сетки. Сетка грузит по PAGE_SIZE = 12, а у LEGO в
 * «Конструкторах мальчикам» 14 товаров: по показанному списку цены «от … до …»
 * и правило об индексе считались бы по неполным данным. Правило
 * (decideBrandLanding) к тому же смотрит, не совпадает ли набор с каким-то
 * подразделом, — для этого нужны разделы ВСЕХ товаров связки.
 *
 * Набор тот же, что показывает фильтр: активные товары бренда во всей ветке
 * раздела. Сбой выборки не закрывает страницу: без данных решение
 * откладывается, и работает прежний fail-open.
 */
const { data: brandLandingAll } = await useAsyncData(
  () => `brand-landing-all-${currentCategorySlug.value}-${activeBrandSlug.value ?? 'none'}`,
  async () => {
    const brandId = activeBrandSeo.value?.id
    if (!activeBrandSlug.value || !brandId)
      return null
    if (!categoriesStore.allCategories.length)
      await categoriesStore.fetchCategoryData()

    const all = categoriesStore.allCategories
    const root = all.find(c => c.slug === currentCategorySlug.value)
    if (!root)
      return null

    // Ветка раздела: он сам и все потомки.
    const branch = new Set<string>([root.id])
    for (let grew = true; grew;) {
      grew = false
      for (const c of all) {
        if (c.parent_id && branch.has(c.parent_id) && !branch.has(c.id)) {
          branch.add(c.id)
          grew = true
        }
      }
    }

    const { data, error } = await supabase
      .from('products')
      .select('name, slug, price, final_price, stock_quantity, min_age_years, max_age_years, category_id, brand_id')
      .eq('is_active', true)
      .eq('brand_id', brandId)
      .in('category_id', [...branch])
    if (error)
      throw error

    return { categoryId: root.id, brandId, products: data ?? [] }
  },
  { watch: [currentCategorySlug, activeBrandSlug] },
)

/** id бренда из адреса — известен до первой выборки товаров. */
const activeBrandIdFromQuery = computed(() => activeBrandSeo.value?.id ?? null)

/** Имя бренда, доступное и на сервере, и после гидратации. */
const activeBrandName = computed(
  () => activeBrand.value?.name || activeBrandSeoName.value || null,
)

const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (currentCategorySlug.value === 'all') {
    return [{ id: 'all', name: 'Все товары', href: '/catalog/all' }]
  }
  const crumbs = categoriesStore.getBreadcrumbs(currentCategorySlug.value)

  if (activeBrand.value && crumbs.length > 0) {
    return [
      ...crumbs,
      {
        id: `brand-${activeBrand.value.id}`,
        name: activeBrand.value.name,
      },
    ]
  }

  return crumbs
})

const currentCategory = computed(() => {
  if (!categoriesStore.allCategories.length)
    return null
  return categoriesStore.allCategories.find(
    c => c.slug === currentCategorySlug.value,
  )
})

const categoryOgImageUrl = computed(() => {
  const imageFilename = currentCategory.value?.image_url
  if (!imageFilename)
    return undefined
  return getVariantUrl(BUCKET_NAME_CATEGORY, imageFilename, 'lg')
})

const categoryName = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }
  const crumbs = categoriesStore.getBreadcrumbs(currentCategorySlug.value)
  if (crumbs && crumbs.length > 0)
    return crumbs[crumbs.length - 1]?.name
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

/*
 * Запасной текст, заголовок и вопросы для корневых разделов — из репозитория.
 * База ГЛАВНЕЕ: как только `seo_text` или `seo_h1` заполнят в админке,
 * показываться будет она. Зачем это вообще нужно — в шапке
 * `constants/categoryStaticText.ts`.
 */
const categoryStatic = computed(() =>
  activeBrand.value ? undefined : categoryStaticFor(currentCategorySlug.value),
)

/*
 * Связка «раздел + бренд»: всё — из её собственных товаров.
 *
 * Название раздела берётся читаемое (`seo_h1`): в `name` у части разделов
 * дательный падеж — «Мальчикам», «Конструкторы Мальчикам», — и на бою висели
 * H1 и заголовок «Конструкторы Мальчикам LEGO». Бренд встаёт перед «для …»:
 * «Конструкторы LEGO для мальчиков».
 */
const brandLandingProducts = computed(() => brandLandingAll.value?.products ?? [])
const brandFacts = computed(() => brandLandingFacts(brandLandingProducts.value))
const readableCategoryName = computed(
  () => currentCategory.value?.seo_h1?.trim() || categoryName.value || '',
)
const brandPhrase = computed(() =>
  activeBrandName.value ? brandCategoryPhrase(readableCategoryName.value, activeBrandName.value) : '',
)
const brandLandingVerdict = computed(() => {
  const all = brandLandingAll.value
  if (!all)
    return null
  const counts = countProductsByCategoryBrand(all.products, categoriesStore.allCategories)
  return decideBrandLanding(
    all.categoryId,
    all.brandId,
    counts,
    categoriesStore.allCategories,
    activeBrandName.value,
  )
})
/** «9 моделей · от 7 490 до 18 890 ₸» — под H1 связки. */
const brandLandingSummary = computed(() =>
  activeBrandSlug.value ? composeBrandLandingSummary(brandFacts.value) : '',
)

const title = computed(() => {
  if (currentCategorySlug.value === 'all') {
    return 'Все товары'
  }

  if (activeBrand.value || (activeBrandSlug.value && activeBrandName.value)) {
    if (categoryBrandSeo.value?.seo_h1) {
      return categoryBrandSeo.value.seo_h1
    }
    return `${brandPhrase.value} в Алматы`
  }

  return currentCategory.value?.seo_h1 || categoryStatic.value?.h1 || categoryName.value
})

const priceRange = ref({ min: 0, max: 50000 })
const pieceCountRange = ref<{ min: number, max: number } | null>(null)

const subcategories = computed(() =>
  categoriesStore.getSubcategories(currentCategorySlug.value),
)

const activeFiltersCount = computed(() => {
  let count = 0
  count += activeFilters.value.subCategoryIds.length
  count += activeFilters.value.brandIds.length
  count += activeFilters.value.productLineIds.length
  count += activeFilters.value.materialIds.length
  count += activeFilters.value.countryIds.length

  Object.values(activeFilters.value.attributes).forEach((values) => {
    count += values.length
  })

  if (
    activeFilters.value.price[0] !== priceRange.value.min
    || activeFilters.value.price[1] !== priceRange.value.max
  ) {
    count += 1
  }

  if (pieceCountRange.value && activeFilters.value.pieceCount) {
    if (
      activeFilters.value.pieceCount[0] !== pieceCountRange.value.min
      || activeFilters.value.pieceCount[1] !== pieceCountRange.value.max
    ) {
      count += 1
    }
  }

  Object.entries(activeFilters.value.numericAttributes).forEach(
    ([attrId, range]) => {
      const attrRange = numericAttributeRanges.value[Number(attrId)]
      if (
        attrRange
        && (range[0] !== attrRange.min || range[1] !== attrRange.max)
      ) {
        count += 1
      }
    },
  )

  return count
})

const canonicalUrl = computed(() => {
  const baseUrl = 'https://uhti.kz'
  const basePath
    = currentCategory.value?.canonical_url
      || currentCategory.value?.href
      || route.path

  /*
   * Связка «раздел + бренд» ссылается canonical'ом на СЕБЯ — всегда, открыта
   * она или закрыта.
   *
   * Открытая: canonical на раздел сказал бы Google «эта страница — копия
   * раздела», и связка в индекс не попала бы, как бы её ни открывал
   * robotsRule. До 21 сентября 2026 на себя ссылались только связки со
   * строкой в category_brand_seo; остальные указывали на раздел, и после
   * открытия связок без написанного текста (decideBrandLanding) это
   * перечеркнуло бы всё открытие — поймано стражем
   * check-category-brand-landings.mjs.
   *
   * Закрытая: связка «noindex + canonical на ДРУГОЙ адрес» — противоречивые
   * указания, Google переносит запрет на цель canonical, а целью была бы
   * страница раздела, которую закрывать нельзя ни в коем случае. Ссылаться
   * на себя при `noindex` безопасно и однозначно.
   */
  if (activeBrandSlug.value) {
    return `${baseUrl}${buildBrandLandingPath(basePath, activeBrandSlug.value)}`
  }

  return `${baseUrl}${basePath}`
})

const catalogFilters = computed<IProductFilters>(() => {
  const attributeFilters: AttributeFilter[] = Object.entries(
    activeFilters.value.attributes,
  )
    .filter(([, optionIds]) => optionIds.length > 0)
    .map(([slug, optionIds]) => ({ slug, option_ids: optionIds as number[] }))

  const numericAttributeFilters: NumericAttributeFilter[] = Object.entries(
    activeFilters.value.numericAttributes,
  )
    .filter(([attrId, range]) => {
      const attrRange = numericAttributeRanges.value[Number(attrId)]
      return (
        attrRange && (range[0] !== attrRange.min || range[1] !== attrRange.max)
      )
    })
    .map(([attrId, range]) => ({
      attributeId: Number(attrId),
      minValue: range[0],
      maxValue: range[1],
    }))

  /*
   * Цена и число деталей попадают в фильтр только когда пользователь реально
   * сузил диапазон. Причина не косметическая.
   *
   * Диапазон категории грузится асинхронно (`loadFilters` ->
   * `fetchPriceRangeForCategory`) уже ПОСЛЕ того, как `useCatalogQuery`
   * посеял кеш на сервере. Пока он не пришёл, здесь стоит заглушка
   * [0, 50000]; когда пришёл — реальные границы категории. То есть ключ
   * запроса меняется под ногами: посев лёг под старый ключ, а `useQuery`
   * при отрисовке читает уже новый, не находит данных и отдаёт скелетоны —
   * при том, что товары к этому моменту лежат в payload.
   *
   * Так терялась вся сетка: на превью пустыми приходили 4 обхода из 12,
   * локально — 9 из 12. Пустой рендер попадал в SWR-кеш маршрута и
   * раздавался оттуда полчаса, в том числе поисковому роботу.
   *
   * Сравнение с самим диапазоном устойчиво в обоих состояниях: до загрузки
   * значение равно заглушке диапазона, после — реальным границам. Ключ
   * получается один и тот же, и посев попадает туда, откуда его читают.
   */
  const pieceCount = activeFilters.value.pieceCount
  const priceIsWholeRange = isWholeRange(activeFilters.value.price, priceRange.value)
  const pieceCountIsWholeRange = isWholeRange(pieceCount, pieceCountRange.value)

  return {
    categorySlug: currentCategorySlug.value,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds:
      activeFilters.value.subCategoryIds.length > 0
        ? activeFilters.value.subCategoryIds
        : undefined,
    /*
     * Пока `loadFilterData` не наполнил `availableBrands`, бренд берём из
     * адреса: иначе первая — и на сервере единственная — выборка товаров
     * уходит без фильтра, и бренд-лендинг отдаёт всю категорию.
     */
    brandIds:
      activeFilters.value.brandIds.length > 0
        ? activeFilters.value.brandIds
        : activeBrandIdFromQuery.value
          ? [activeBrandIdFromQuery.value]
          : undefined,
    productLineIds:
      activeFilters.value.productLineIds.length > 0
        ? activeFilters.value.productLineIds
        : undefined,
    materialIds:
      activeFilters.value.materialIds.length > 0
        ? activeFilters.value.materialIds
        : undefined,
    countryIds:
      activeFilters.value.countryIds.length > 0
        ? activeFilters.value.countryIds
        : undefined,
    priceMin: priceIsWholeRange ? undefined : activeFilters.value.price[0],
    priceMax: priceIsWholeRange ? undefined : activeFilters.value.price[1],
    pieceCountMin: pieceCountIsWholeRange ? undefined : pieceCount?.[0],
    pieceCountMax: pieceCountIsWholeRange ? undefined : pieceCount?.[1],
    attributes: attributeFilters.length > 0 ? attributeFilters : undefined,
    numericAttributes:
      numericAttributeFilters.length > 0 ? numericAttributeFilters : undefined,
  }
})

/*
 * Ожидание стоит ЗДЕСЬ, а не внутри композабла, и это принципиально.
 *
 * Верхнеуровневый await в <script setup> компилятор оборачивает
 * в withAsyncContext, поэтому после него живы и контекст Nuxt, и активный
 * effect scope. Когда тот же await лежал внутри useCatalogQuery, scope
 * терялся: в консоли висели «useQuery() should only be used inside setup()»
 * и «onScopeDispose() is called when there is no active effect scope»,
 * а страница категории получала рассинхрон гидратации.
 */
const catalogSsrData = await useCatalogSsrData(
  catalogFilters,
  currentPage,
  PAGE_SIZE,
)

const {
  products: currentPageProducts,
  hasMore,
  isLoading: isLoadingProducts,
  isFetching,
} = useCatalogQuery(catalogFilters, currentPage, PAGE_SIZE, catalogSsrData)

const displayedProducts = computed<CatalogProduct[]>(() => {
  if (currentPage.value === 1) {
    return currentPageProducts.value as CatalogProduct[]
  }
  return accumulatedProducts.value
})

/*
 * Здесь жил brandLandingProductsCount — число товаров связки по сетке. Им
 * решалось, открывать ли связку, но сетка грузит по 12, а у связки бывает
 * больше. С 21 сентября 2026 число и всё прочее считается по полной выборке
 * brandLandingAll (см. выше), а решение — decideBrandLanding.
 */

// --- 4. Функции-обработчики ---

function getArrayFromQuery(
  queryValue: LocationQueryValue | LocationQueryValue[] | undefined,
): string[] {
  if (!queryValue)
    return []
  if (Array.isArray(queryValue))
    return queryValue.filter(Boolean) as string[]
  return queryValue ? [queryValue] : []
}

function getSortByFromQuery(
  queryValue: LocationQueryValue | LocationQueryValue[] | undefined,
): SortByType {
  if (!queryValue)
    return 'popularity'
  const value = Array.isArray(queryValue) ? queryValue[0] : queryValue
  if (
    value === 'popularity'
    || value === 'newest'
    || value === 'price_asc'
    || value === 'price_desc'
  ) {
    return value
  }
  return 'popularity'
}

// ─── ОПТИМИЗАЦИЯ: разделение на критичные и некритичные данные ────────────────
// Критичные данные нужны для первого рендера (цены → фильтр цены → URL params)
// Некритичные грузятся после — не блокируют FCP/LCP
async function loadFilterData(slug: string) {
  if (abortController.value) {
    abortController.value.abort()
  }

  abortController.value = new AbortController()
  isLoadingFilters.value = true

  try {
    const productsStore = useProductsStore()

    // ── ШАГ 1: только критичные данные (быстро, нужны для SSR) ──────────────
    const [priceRangeResult, pieceCountRangeResult] = await Promise.allSettled([
      productsStore.fetchPriceRangeForCategory(slug),
      productsStore.fetchPieceCountRangeForCategory(slug),
    ])

    const priceRangeData
      = priceRangeResult.status === 'fulfilled'
        ? priceRangeResult.value
        : { min_price: 0, max_price: 50000 }

    const priceMin = Math.floor(Number(priceRangeData.min_price))
    const priceMax = Math.ceil(Number(priceRangeData.max_price))
    priceRange.value = { min: priceMin, max: priceMax }

    const pieceCountRangeData
      = pieceCountRangeResult.status === 'fulfilled'
        ? pieceCountRangeResult.value
        : null
    pieceCountRange.value = pieceCountRangeData
      ? {
          min: pieceCountRangeData.min_count,
          max: pieceCountRangeData.max_count,
        }
      : null

    // ── Читаем query params и сразу инициализируем activeFilters ────────────
    // Это нужно до первого рендера, чтобы товары грузились с правильными фильтрами
    const priceMinFromQuery = route.query.price_min
      ? Number(route.query.price_min)
      : priceMin
    const priceMaxFromQuery = route.query.price_max
      ? Number(route.query.price_max)
      : priceMax

    const pieceCountMinFromQuery = route.query.piece_count_min
      ? Number(route.query.piece_count_min)
      : pieceCountRangeData?.min_count
    const pieceCountMaxFromQuery = route.query.piece_count_max
      ? Number(route.query.piece_count_max)
      : pieceCountRangeData?.max_count

    // Бренды по slug из URL (временно без полного списка брендов)
    const resolvedBrandIds = getArrayFromQuery(route.query.brands)

    activeFilters.value = {
      sortBy: getSortByFromQuery(route.query.sort_by),
      subCategoryIds: getArrayFromQuery(route.query.subcategories),
      price: [priceMinFromQuery, priceMaxFromQuery],
      pieceCount: pieceCountRangeData
        ? [
            pieceCountMinFromQuery ?? pieceCountRangeData.min_count,
            pieceCountMaxFromQuery ?? pieceCountRangeData.max_count,
          ]
        : null,
      brandIds: resolvedBrandIds,
      productLineIds: getArrayFromQuery(route.query.lines),
      materialIds: getArrayFromQuery(route.query.materials),
      countryIds: getArrayFromQuery(route.query.countries),
      attributes: {},
      numericAttributes: {},
    }

    currentPage.value = 1
    accumulatedProducts.value = []

    // ── ШАГ 2: Brand SEO — нужен для H1/title, грузим если есть brand в URL ─
    /*
     * Бренд берётся из пути, а не из `route.query.brand`. Это же значение
     * решает, покажется ли уникальный SEO-текст пары категория+бренд и
     * встанет ли canonical на бренд-лендинг вместо категории — при чтении
     * из query после переезда на путь обе вещи молча ломались.
     */
    const brandSlugParam = parseCatalogSlug(
      route.params.slug as string[] | undefined,
    ).brandSlug
    if (brandSlugParam) {
      brandSeoLoading.value = true
      try {
        const { data: seoData } = await supabase.rpc('get_category_brand_seo', {
          p_category_slug: slug,
          p_brand_slug: brandSlugParam,
        })
        categoryBrandSeo.value
          = seoData && seoData.length > 0 ? seoData[0] : null
      }
      catch {
        categoryBrandSeo.value = null
      }
      finally {
        brandSeoLoading.value = false
      }
    }
    else {
      categoryBrandSeo.value = null
    }

    // ── ШАГ 3: Некритичные данные — грузим ПАРАЛЛЕЛЬНО после рендера ────────
    // На сервере грузим сразу (нужно для hydration), на клиенте — после nextTick
    const loadNonCritical = async () => {
      const [
        brandsResult,
        productLinesResult,
        attributesResult,
        materialsResult,
        countriesResult,
      ] = await Promise.allSettled([
        productsStore.fetchBrandsForCategory(slug),
        productsStore.fetchProductLinesForCategory(slug),
        productsStore.fetchAttributesForCategory(slug),
        productsStore.fetchAllMaterials(),
        productsStore.fetchAllCountries(),
      ])

      availableBrands.value
        = brandsResult.status === 'fulfilled' ? brandsResult.value : []
      availableProductLines.value
        = productLinesResult.status === 'fulfilled'
          ? productLinesResult.value
          : []
      availableFilters.value = (
        attributesResult.status === 'fulfilled' ? attributesResult.value : []
      ) as FilterAttribute[]
      availableMaterials.value
        = materialsResult.status === 'fulfilled' ? materialsResult.value : []
      availableCountries.value
        = countriesResult.status === 'fulfilled' ? countriesResult.value : []

      // Numeric attribute ranges
      const numericAttrs = availableFilters.value.filter(
        f => f.display_type === 'numeric',
      )
      const numericRangesResults = await Promise.allSettled(
        numericAttrs.map(attr =>
          productsStore.fetchNumericAttributeRange(slug, attr.id),
        ),
      )

      const newNumericRanges: Record<number, { min: number, max: number }> = {}
      for (let i = 0; i < numericAttrs.length; i++) {
        const attr = numericAttrs[i]
        const result = numericRangesResults[i]
        if (!attr || !result)
          continue

        if (result.status === 'fulfilled') {
          const value = result.value
          if (value) {
            newNumericRanges[attr.id] = value
          }
        }
      }
      numericAttributeRanges.value = newNumericRanges

      // Инициализируем attribute-фильтры из URL теперь, когда знаем список атрибутов
      const newAttributeFilters: Record<string, (string | number)[]> = {}
      for (const attr of availableFilters.value) {
        const queryKey = `attr_${attr.slug}`
        const queryValue = route.query[queryKey]
        newAttributeFilters[attr.slug] = getArrayFromQuery(queryValue)
      }

      const initNumericAttrs: Record<number, [number, number]> = {}
      Object.entries(newNumericRanges).forEach(([attrId, range]) => {
        const id = Number(attrId)
        const queryMin = route.query[`numeric_${id}_min`]
        const queryMax = route.query[`numeric_${id}_max`]
        initNumericAttrs[id] = [
          queryMin ? Number(queryMin) : range.min,
          queryMax ? Number(queryMax) : range.max,
        ]
      })

      // Резолвим brand id по slug теперь, когда есть список брендов
      let resolvedBrandIdsWithSlug = getArrayFromQuery(route.query.brands)
      if (brandSlugParam && availableBrands.value.length > 0) {
        const brandBySlug = availableBrands.value.find(
          b => b.slug === brandSlugParam,
        )
        if (brandBySlug) {
          resolvedBrandIdsWithSlug = [brandBySlug.id]
        }
      }

      // Обновляем только те поля, которые требовали некритичных данных
      activeFilters.value = {
        ...activeFilters.value,
        brandIds: resolvedBrandIdsWithSlug,
        attributes: newAttributeFilters,
        numericAttributes: initNumericAttrs,
      }

      isNonCriticalLoaded.value = true
    }

    if (import.meta.server) {
      // На сервере грузим сразу — нужно для SSR hydration
      await loadNonCritical()
    }
    else {
      // На клиенте не блокируем рендер — грузим после первого фрейма
      isLoadingFilters.value = false
      nextTick(() => {
        loadNonCritical().finally(() => {
          isLoadingFilters.value = false
        })
      })
    }

    return {
      brands: availableBrands.value,
      productLines: availableProductLines.value,
      filters: availableFilters.value as FilterAttribute[],
      materials: availableMaterials.value,
      countries: availableCountries.value,
      priceRange: priceRange.value,
      pieceCountRange: pieceCountRange.value,
      numericRanges: numericAttributeRanges.value,
      activeFilters: activeFilters.value,
      categoryBrandSeo: categoryBrandSeo.value,
    }
  }
  catch (error: unknown) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error('Error loading filters:', error)
    }
    return null
  }
  finally {
    if (import.meta.server) {
      isLoadingFilters.value = false
    }
  }
}

function loadMoreProducts() {
  if (currentPage.value === 1) {
    accumulatedProducts.value = [
      ...currentPageProducts.value,
    ] as CatalogProduct[]
  }
  currentPage.value++
}

watch(
  () => activeFilters.value.brandIds,
  (newBrandIds) => {
    if (newBrandIds.length === 0)
      return
    const validLineIds = activeFilters.value.productLineIds.filter((lineId) => {
      const line = availableProductLines.value.find(l => l.id === lineId)
      return line && newBrandIds.includes(line.brand_id)
    })
    if (validLineIds.length !== activeFilters.value.productLineIds.length) {
      activeFilters.value = {
        ...activeFilters.value,
        productLineIds: validLineIds,
      }
    }
  },
)

watch(activeBrandSlug, async (newSlug) => {
  if (newSlug && availableBrands.value.length > 0) {
    const brand = availableBrands.value.find(b => b.slug === newSlug)
    if (brand) {
      const alreadySet
        = activeFilters.value.brandIds.length === 1
          && activeFilters.value.brandIds[0] === brand.id
      if (!alreadySet) {
        activeFilters.value = {
          ...activeFilters.value,
          brandIds: [brand.id],
          productLineIds: [],
        }
        currentPage.value = 1
        accumulatedProducts.value = []
      }
    }
    brandSeoLoading.value = true
    try {
      const { data: seoData } = await supabase.rpc('get_category_brand_seo', {
        p_category_slug: currentCategorySlug.value,
        p_brand_slug: newSlug,
      })
      categoryBrandSeo.value
        = seoData && seoData.length > 0 ? seoData[0] : null
    }
    catch {
      categoryBrandSeo.value = null
    }
    finally {
      brandSeoLoading.value = false
    }
  }
  else if (!newSlug) {
    if (activeFilters.value.brandIds.length > 0) {
      activeFilters.value = {
        ...activeFilters.value,
        brandIds: getArrayFromQuery(route.query.brands),
      }
      currentPage.value = 1
      accumulatedProducts.value = []
    }
    categoryBrandSeo.value = null
  }
})

watch(currentPageProducts, (newProducts) => {
  if (currentPage.value > 1 && newProducts.length > 0) {
    const existingIds = new Set(accumulatedProducts.value.map(p => p.id))
    const uniqueNewProducts = newProducts.filter(
      p => !existingIds.has(p.id),
    ) as CatalogProduct[]
    accumulatedProducts.value = [
      ...accumulatedProducts.value,
      ...uniqueNewProducts,
    ]
  }
})

function updateAttribute(
  checked: boolean,
  attributeSlug: string,
  optionId: string | number,
) {
  const stringId = String(optionId)
  const currentSelection: string[] = (
    activeFilters.value.attributes[attributeSlug] || []
  ).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (checked)
    newSelection.add(stringId)
  else newSelection.delete(stringId)

  activeFilters.value = {
    ...activeFilters.value,
    attributes: {
      ...activeFilters.value.attributes,
      [attributeSlug]: Array.from(newSelection),
    },
  }
}

function clearAttributeFilter(attributeSlug: string) {
  activeFilters.value = {
    ...activeFilters.value,
    attributes: {
      ...activeFilters.value.attributes,
      [attributeSlug]: [],
    },
  }
}

// ─── Сортировка — стеклянная пилюля из CatalogFilterBar.dc.html (десктоп) ──────
const catalogSortOptions: { value: SortByType, label: string }[] = [
  { value: 'popularity', label: 'Популярные' },
  { value: 'newest', label: 'По новизне' },
  { value: 'price_asc', label: 'Цена: по возрастанию' },
  { value: 'price_desc', label: 'Цена: по убыванию' },
]

const currentSortLabel = computed(
  () =>
    catalogSortOptions.find(o => o.value === activeFilters.value.sortBy)
      ?.label ?? catalogSortOptions[0].label,
)

function selectCatalogSort(value: SortByType) {
  activeFilters.value = { ...activeFilters.value, sortBy: value }
  isSortPopoverOpen.value = false
}

// ─── Бренды — вторая пилюля из CatalogFilterBar.dc.html (десктоп) ──────────────
const isBrandPopoverOpen = ref(false)

// Только один из двух поповеров бара открыт одновременно — тот же приём,
// что и в CategoryScrollBar.vue для пары «Сортировка»/«Категории».
watch(isSortPopoverOpen, (open) => {
  if (open)
    isBrandPopoverOpen.value = false
})
watch(isBrandPopoverOpen, (open) => {
  if (open)
    isSortPopoverOpen.value = false
})

function toggleCatalogBrand(checked: boolean, brandId: string) {
  const current = activeFilters.value.brandIds
  const next = checked
    ? [...current, brandId]
    : current.filter(id => id !== brandId)
  activeFilters.value = { ...activeFilters.value, brandIds: next }
}

// CategoryScrollBar's list toggles by id only (no separate checked flag),
// same shape as toggleSubCategory below — compute checked from current state.
function toggleCatalogBrandById(brandId: string) {
  toggleCatalogBrand(!activeFilters.value.brandIds.includes(brandId), brandId)
}

function toggleSubCategory(catId: string) {
  const newIds = new Set(activeFilters.value.subCategoryIds)
  if (newIds.has(catId)) {
    newIds.delete(catId)
  }
  else {
    newIds.add(catId)
  }
  activeFilters.value = {
    ...activeFilters.value,
    subCategoryIds: Array.from(newIds),
  }
}

function resetAllFilters() {
  activeFilters.value = {
    sortBy: 'popularity',
    subCategoryIds: [],
    price: [priceRange.value.min, priceRange.value.max],
    pieceCount: pieceCountRange.value
      ? [pieceCountRange.value.min, pieceCountRange.value.max]
      : null,
    brandIds: [],
    productLineIds: [],
    materialIds: [],
    countryIds: [],
    attributes: {},
    numericAttributes: {},
  }
}

function updateQueryParams() {
  const query: Record<string, any> = {}

  if (activeFilters.value.sortBy !== 'popularity') {
    query.sort_by = activeFilters.value.sortBy
  }

  if (activeFilters.value.subCategoryIds.length > 0) {
    query.subcategories = activeFilters.value.subCategoryIds
  }

  if (activeBrandSlug.value && activeFilters.value.brandIds.length === 1) {
    const matchedBrand = availableBrands.value.find(
      b => b.id === activeFilters.value.brandIds[0],
    )
    /*
     * Бренд лендинга уже лежит в ПУТИ (`activeBrandSlug` читается из
     * `catalogSlugParts`), поэтому в query его дублировать нечем и незачем.
     * Раньше здесь писалось `query.brand`, и адрес получался
     * `/catalog/boys/brand/mattel?brand=mattel` — остаток от времён, когда
     * бренд жил в параметре. Такие адреса пользователи копируют и
     * пересылают, а до починки правила в vercel.json любой заход по ним
     * уходил в бесконечный редирект.
     *
     * Если же выбранный бренд не тот, что в пути, — это уже обычный фильтр,
     * и он едет списком `brands`.
     */
    if (!matchedBrand || matchedBrand.slug !== activeBrandSlug.value) {
      query.brands = activeFilters.value.brandIds
    }
  }
  else if (activeFilters.value.brandIds.length > 0) {
    query.brands = activeFilters.value.brandIds
  }

  if (activeFilters.value.productLineIds.length > 0) {
    query.lines = activeFilters.value.productLineIds
  }

  if (activeFilters.value.materialIds.length > 0) {
    query.materials = activeFilters.value.materialIds
  }

  if (activeFilters.value.countryIds.length > 0) {
    query.countries = activeFilters.value.countryIds
  }

  if (activeFilters.value.price[0] !== priceRange.value.min) {
    query.price_min = activeFilters.value.price[0]
  }

  if (activeFilters.value.price[1] !== priceRange.value.max) {
    query.price_max = activeFilters.value.price[1]
  }

  Object.entries(activeFilters.value.attributes).forEach(([slug, values]) => {
    if (values.length > 0) {
      query[`attr_${slug}`] = values
    }
  })

  router.replace({ query })
}

const hasActiveFilters = computed(() => {
  return (
    activeFiltersCount.value > 0 || activeFilters.value.sortBy !== 'popularity'
  )
})

const categoryDescription = computed(
  () => currentCategory.value?.description || null,
)

const selectedSingleLine = computed(() => {
  if (activeFilters.value.productLineIds.length !== 1)
    return null
  return (
    availableProductLines.value.find(
      l => l.id === activeFilters.value.productLineIds[0],
    ) || null
  )
})

const selectedSingleBrand = computed(() => {
  if (activeFilters.value.brandIds.length !== 1)
    return null
  return (
    availableBrands.value.find(
      b => b.id === activeFilters.value.brandIds[0],
    ) || null
  )
})

const minPrice = computed(() => {
  if (!displayedProducts.value || displayedProducts.value.length === 0)
    return null
  return Math.min(
    ...displayedProducts.value.map(p => p.final_price || p.price),
  )
})

/**
 * Сколько активных товаров в категории вместе со всеми подкатегориями.
 *
 * Нужно ровно для одного — честного числа в мета-описании. Прежний шаблон
 * писал «В каталоге N моделей», подставляя длину ПЕРВОЙ СТРАНИЦЫ выдачи, а
 * это максимум 12 (`PAGE_SIZE`). У категории с полусотней товаров в выдаче
 * стояло «12 моделей»: число занижено втрое и вдобавок одинаково у половины
 * категорий.
 *
 * Дерево берём из хранилища — оно уже загружено выше (`catalog-meta-…`) и
 * приходит в серверную разметку, отдельного запроса за категориями не нужно.
 * Обход вниз повторяет `get_category_and_children_ids` в базе, которым
 * пользуется сама выборка товаров.
 *
 * `null` означает «сосчитать не удалось»; описание тогда просто обходится без
 * количества, а не показывает ноль.
 */
const { data: categoryProductsCount } = await useAsyncData(
  () => `catalog-count-${currentCategorySlug.value}`,
  async (): Promise<number | null> => {
    if (currentCategorySlug.value === 'all')
      return null

    /*
     * `fetchCategoryData` — а не `categoriesStore.allCategories` напрямую:
     * блок стоит ВЫШЕ основной загрузки категорий, и на голое поле хранилища
     * тут рассчитывать нельзя. Повторным запросом это не оборачивается —
     * у метода ранний выход, если категории уже загружены.
     */
    const all = await categoriesStore.fetchCategoryData()
    const root = all.find(c => c.slug === currentCategorySlug.value)
    if (!root)
      return null

    const ids: string[] = []
    const queue = [root.id]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const id = queue.shift()!
      if (seen.has(id))
        continue
      seen.add(id)
      ids.push(id)
      for (const child of all) {
        if (child.parent_id === id)
          queue.push(child.id)
      }
    }

    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .in('category_id', ids)
      .eq('is_active', true)

    return error ? null : count
  },
  { watch: [currentCategorySlug] },
)

const categoryStats = computed(() => {
  let totalReviews = 0
  let sumRatings = 0

  displayedProducts.value.forEach((p) => {
    if (Number(p.review_count) > 0) {
      totalReviews += Number(p.review_count)
      sumRatings += (Number(p.avg_rating) || 5) * Number(p.review_count)
    }
  })

  return {
    reviews: totalReviews,
    rating:
      totalReviews > 0
        ? (sumRatings / totalReviews).toFixed(1).replace('.', ',')
        : null,
  }
})

const topBrands = computed(() => {
  if (!availableBrands.value || availableBrands.value.length === 0)
    return []

  return availableBrands.value
    .slice()
    .sort((a, b) => (b.products_count || 0) - (a.products_count || 0))
    .slice(0, 3)
    .map(b => b.name)
})

const metaDescription = computed(() => {
  /*
   * Связка «раздел + бренд» — своё описание ВСЕГДА, а не только когда для неё
   * написан текст. До 21 сентября 2026 без строки в category_brand_seo сюда
   * молча попадало описание всего раздела: у «Радиоуправляемых машинок
   * MokaToys» стояло «24 модели» — это весь раздел, у MokaToys их 9. Теперь
   * число моделей и цены «от … до …» — по товарам самой связки.
   */
  if (activeBrandSlug.value && activeBrandName.value && !categoryBrandSeo.value?.seo_description && brandFacts.value.count > 0)
    return composeBrandLandingMeta(brandPhrase.value, brandFacts.value)

  if ((activeBrand.value || activeBrandSlug.value) && categoryBrandSeo.value) {
    /*
     * Сохранённое описание показываем, только если оно не собрано СТАРЫМ
     * шаблоном: тот открывался эмодзи, вставлял звёзды с одного отзыва и
     * обещал доставку «за 1 день» — по условиям магазина это 1–3 рабочих дня.
     * Таких строк в базе пять из четырнадцати, остальные написаны руками.
     * Их не трогаем, а машинные собираем заново по нынешним правилам.
     *
     * Написанное руками — с числом моделей и ценами «от … до …» впереди:
     * владелец писал эти тексты без цен, а цены в выдаче — то, ради чего
     * связку открывают (см. prependBrandLandingFacts).
     */
    const stored = categoryBrandSeo.value.seo_description
    if (stored && !hasLegacyTemplateMarks(stored)) {
      return prependBrandLandingFacts(stored, brandFacts.value)
    }

    // Сохранённое собрано старым шаблоном — собираем заново из товаров связки.
    // Прежний сборщик брал «до» из min_price, то есть цена «до» никогда не
    // была правильной.
    return composeBrandLandingMeta(brandPhrase.value || categoryName.value, brandFacts.value)
  }

  /*
   * Дальше — описание категории. Порядок веток: сперва написанное руками,
   * потом собранное из фактов.
   *
   * Что изменилось 2 сентября 2026 и почему. Прежний шаблон открывался
   * эмодзи («💰 Цены от…»), вставлял ряд звёзд («⭐⭐⭐⭐⭐ 5,0 (1 отз)» —
   * пять звёзд с ОДНОГО отзыва) и заканчивался призывом «Заказывайте
   * оригиналы!». Search Console по этим страницам за 90 дней: на позициях
   * до десятой — 238 показов и НОЛЬ кликов. Ноль при живых позициях 5–10 —
   * это не про позиции, это про то, как выглядит строка в выдаче.
   *
   * Поэтому вперёд вынесены факты, ради которых кликают: что за товар,
   * сколько его и от какой цены. Сборка и её правила — в
   * `utils/seoDescription.ts`, там же тесты.
   */
  const ratingValue
    = categoryStats.value.reviews > 0 && categoryStats.value.rating
      ? Number.parseFloat(categoryStats.value.rating.replace(',', '.'))
      : null

  return composeCategoryMeta({
    categoryName: categoryName.value,
    // Написанное руками вступление, если владелец его завёл, — оно идёт
    // первым, а факты дописываются следом.
    lead: currentCategory.value?.meta_description,
    productsCount: categoryProductsCount.value,
    minPrice: minPrice.value,
    topBrands: topBrands.value,
    city: 'Алматы',
    rating: ratingValue,
    reviewsCount: categoryStats.value.reviews,
  })
})

const metaTitle = computed(() => {
  // activeBrandName, а не activeBrand: последний на сервере всегда null,
  // и заголовок страницы с фильтром совпадал с заголовком категории.
  if (activeBrandName.value) {
    if (categoryBrandSeo.value?.seo_title) {
      return categoryBrandSeo.value.seo_title
    }
    // Читаемое название раздела и цена «от» по товарам самой связки — см.
    // brandPhrase и brandFacts выше.
    return composeBrandLandingTitle(brandPhrase.value, brandFacts.value)
  }

  if (selectedSingleLine.value) {
    const brandName = selectedSingleBrand.value?.name || ''
    const lineName = selectedSingleLine.value.name
    const prefix = brandName ? `${brandName} ${lineName}` : lineName
    const priceText = minPrice.value
      ? ` — от ${formatPrice(minPrice.value)} ₸`
      : ''
    return `${prefix}${priceText} | Ухтышка`
  }

  if (hasActiveFilters.value) {
    return `${categoryName.value} - Фильтр | Ухтышка`
  }

  if (currentCategory.value?.meta_title) {
    return currentCategory.value.meta_title
  }

  const seoTitle = currentCategory.value?.seo_title
  if (seoTitle) {
    return seoTitle
  }

  return `${categoryName.value} купить в интернет-магазине Ухтышка Казахстан`
})

const metaKeywords = computed(() => {
  const metaKw = currentCategory.value?.meta_keywords
  if (metaKw && metaKw.length > 0) {
    return metaKw.join(', ')
  }
  const keywords = currentCategory.value?.seo_keywords
  if (keywords && keywords.length > 0) {
    return keywords.join(', ')
  }
  return null
})

/**
 * SEO-текст текущей категории — точечным запросом, одной строкой.
 *
 * В `categoriesStore` это поле намеренно не выбирается: оно весит 76 КБ
 * на все 64 категории и раздувало payload на каждой странице сайта.
 * Но выбросить его совсем нельзя — на странице категории оно рисует
 * SEO-блок и попадает в `articleBody` разметки Schema.org.
 *
 * Именно это я и сломал коммитом c8e77b5: убрал поле из общей выборки,
 * не заметив здешнего потребителя. На превью пропали три заголовка
 * и `articleBody`, текста на странице стало 2620 знаков против 4913
 * на проде. Тут — восстановление, но уже без общего раздувания.
 */
const { data: currentCategorySeoText } = await useAsyncData(
  () => `category-seo-text-${currentCategorySlug.value}`,
  async () => {
    const slug = currentCategorySlug.value
    if (!slug || slug === 'all')
      return null

    const { data } = await supabase
      .from('categories')
      .select('seo_text')
      .eq('slug', slug)
      .maybeSingle()

    return (data as { seo_text: string | null } | null)?.seo_text ?? null
  },
  { watch: [currentCategorySlug] },
)

const seoText = computed(() => {
  /*
   * Написанный текст связки — только если он РИСУЕТСЯ. parseHTMLToBlocks
   * берёт блоки (h2/h3/p/ul) и пропускает голый текст без тегов, а такие в
   * category_brand_seo были: шесть шаблонов старого генератора. На странице
   * от них оставалось пустое место — лучше свой текст из товаров связки.
   */
  if ((activeBrand.value || activeBrandSlug.value) && categoryBrandSeo.value?.seo_text) {
    const own = sanitizeHtml(categoryBrandSeo.value.seo_text)
    if (parseHTMLToBlocks(own).length > 0)
      return own
  }

  /*
   * У связки без написанного текста — текст из её товаров
   * (utils/brandLandingText.ts). Раньше здесь показывался текст ВСЕГО
   * раздела: дубль, одинаковый на разделе и на каждой его связке.
   */
  if (activeBrandSlug.value && activeBrandName.value && brandFacts.value.count > 0) {
    return sanitizeHtml(composeBrandLandingText({
      phrase: brandPhrase.value,
      brandName: activeBrandName.value,
      products: brandLandingProducts.value,
    }))
  }

  const text = currentCategorySeoText.value
  return text ? sanitizeHtml(text) : null
})

/*
 * Раньше здесь стояла заглушка `import.meta.server → []`, из-за которой
 * SEO-текст категории не попадал в серверную разметку вовсе: для поисковика
 * этого текста не существовало, хотя ради него он и написан.
 *
 * Технических препятствий у серверного разбора нет — проверено:
 * `parseHTMLToBlocks` работает регулярками, без DOM, а `sanitizeHtml` из
 * `useSafeHtml` на сервере сам возвращает строку как есть, не трогая
 * DOMPurify.
 *
 * Чтобы серверная и клиентская ветки совпадали, `categoryBrandSeo` выше
 * переведён в `useState` — иначе на клиенте он был бы null и текст
 * подменился бы категорийным.
 */
const seoBlocks = computed(() => {
  if (!seoText.value)
    return []
  return parseHTMLToBlocks(seoText.value)
})

/*
 * Оба значения берутся здесь, в setup, а не внутри computed: композабл
 * читает runtimeConfig, а вычисляемое свойство может пересчитаться уже вне
 * контекста Nuxt. На превью оба превращаются в noindex, nofollow.
 */
const robotsIndexable = useRobotsContent('index, follow')
const robotsNoindexFollow = useRobotsContent('noindex, follow')

const robotsRule = computed(() => {
  /*
   * Бренд-лендинг разбирается отдельно и ПЕРВЫМ, потому что обе ветки ниже
   * для него врут.
   *
   * Уникального текста мало: страница обязана ещё и показывать товар. К
   * сентябрю 2026 три адреса из четырнадцати в карте сайта содержали ноль
   * товаров — текст писали давно, товары с тех пор разошлись, а `index,
   * follow` держался на одном факте существования строки в
   * `category_brand_seo`. У такой страницы и H1 теряет бренд: резолвить его
   * не из чего, когда у бренда нет товаров в этой категории.
   *
   * Обратный случай — бренд в пути БЕЗ строки в `category_brand_seo` — до
   * этой правки утекал в индекс тем же путём: фильтр по бренду ставится по
   * найденным товарам, а когда их нет, `activeFiltersCount` равен нулю, и
   * проверка ниже возвращала `index, follow`.
   *
   * Порог общий с картой сайта, обе стороны зовут одну функцию — иначе в
   * карте появятся `noindex`-адреса. См. MIN_PRODUCTS_FOR_BRAND_LANDING.
   */
  if (activeBrandSlug.value) {
    /*
     * С 21 сентября 2026 решает decideBrandLanding — та же функция, что
     * отбирает связки в карту сайта: не меньше трёх товаров, не корневой
     * раздел и не дубль более точного подраздела. Написанный текст в
     * category_brand_seo больше не условие: у связки без него теперь свой
     * текст из её товаров (см. seoText).
     *
     * Пока выборки нет (или она упала) — открыто: закрывать рабочую
     * страницу из-за сбоя запроса нельзя, прежний fail-open.
     */
    const verdict = brandLandingVerdict.value
    return verdict === null || verdict.indexable
      ? { index: true, follow: true }
      : { noindex: true, follow: true }
  }

  if (
    activeFiltersCount.value > 0
    || activeFilters.value.sortBy !== 'popularity'
  ) {
    return { noindex: true, follow: true }
  }

  /*
   * Пустая категория в индексе — то же, что пустой бренд-лендинг, и правило
   * здесь общее с картой сайта (обе стороны зовут `isCategoryIndexable`).
   *
   * Замер 16 сентября 2026: 13 категорий из 64 не имели ни одного активного
   * товара во всей ветке, и все тринадцать лежали в карте. За 90 дней они
   * собрали 347 показов и НОЛЬ кликов, причём часть стояла высоко —
   * бизидоски на 6-м месте, мягкие игрушки на 4,8. Человек приходил по
   * запросу и видел пустую полку.
   *
   * Считаем по ВСЕЙ ветке (`categoryProductsCount` обходит дерево вниз):
   * иначе закрылись бы родительские разделы вроде «Кукол», где своих товаров
   * ноль, а в подкатегориях девятнадцать.
   *
   * Список исключений — в `constants/index.ts`, туда владелец кладёт
   * страницы, которые собирается наполнить.
   */
  if (!isCategoryIndexable(currentCategorySlug.value, categoryProductsCount.value))
    return { noindex: true, follow: true }

  return { index: true, follow: true }
})

// --- 5. Загрузка данных ---
const [{ data: _categoriesData }, { data: _filterPayload }] = await Promise.all(
  [
    useAsyncData(
      `catalog-meta-${currentCategorySlug.value}`,
      () => categoriesStore.fetchCategoryData(),
      { watch: [currentCategorySlug] },
    ),
    useAsyncData(
      `catalog-filters-${currentCategorySlug.value}`,
      () => loadFilterData(currentCategorySlug.value),
      {
        watch: [currentCategorySlug],
        server: true,
      },
    ),
  ],
)

/*
 * Несуществующая категория обязана отвечать 404.
 *
 * До этой проверки `/catalog/qwerty-zzz-999` отдавал HTTP 200, заголовок
 * собирался из самого слага («qwerty zzz 999 купить в интернет-магазине…»),
 * а в мете стояло `robots: index, follow`. То есть сайт сам порождал
 * неограниченное число индексируемых страниц-пустышек: любая опечатка в
 * ссылке, любой битый адрес из чужой выдачи становился отдельной тонкой
 * страницей. У карточек товара такой дыры нет — там `createError` стоит
 * с самого начала.
 *
 * Условие на непустой список принципиально. Пустой список означает не
 * «категорий нет», а «загрузка не удалась», и превращать сбой в 404 нельзя:
 * маршрут `/catalog` кешируется SWR на 30 минут, и разовый сбой раздавался
 * бы как 404 всем, включая робота. По этой же причине проверка стоит после
 * `await` загрузки категорий, а не рядом с `currentCategory`.
 *
 * `all` — не категория, а весь каталог: и `/catalog`, и `/catalog/all`
 * приходят сюда именно с этим слагом.
 */
if (
  currentCategorySlug.value !== 'all'
  && categoriesStore.allCategories.length > 0
  && !currentCategory.value
) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Категория не найдена',
    fatal: true,
  })
}

/*
 * Несуществующий бренд в пути — тоже 404.
 *
 * `/catalog/boys/brand/net-takogo-brenda` иначе отдавал бы 200 и полную
 * категорию под её собственным заголовком: тот же мягкий 404, что чинился
 * для категорий, только с новой формой адреса. Раз путь индексируемый,
 * мусор по нему порождать нельзя.
 *
 * Проверяется по `activeBrandSeo` — запросу, который ждётся выше и уже
 * резолвит бренд по слагу. Пустой ответ означает именно «такого бренда
 * нет»; ошибка запроса сюда не попадает, `useAsyncData` вернул бы её
 * отдельно, и 404 из сбоя базы не сделается.
 */
if (activeBrandSlug.value && !activeBrandSeo.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Бренд не найден',
    fatal: true,
  })
}

/*
 * Неверный родительский путь — 301 на канонический, а не 200.
 *
 * Категория ищется по ПОСЛЕДНЕМУ сегменту, а остальные не проверяются вовсе.
 * Из-за этого одна и та же категория отдавалась по любому пути. Замер на
 * проде 20 августа:
 *
 *   /catalog/constructors-root/konstruktory-malchikam       200
 *   /catalog/constructors/konstruktory-malchikam            200
 *   /catalog/vydumannaya-kategoriya/konstruktory-malchikam  200
 *   /catalog/boys/konstruktory-malchikam                    200
 *   /catalog/konstruktory-malchikam                         200
 *
 * `canonical` у всех указывал на верный путь, поэтому дублей в индексе не
 * возникало. Но робот скачивал каждый такой адрес целиком (медиана документа
 * тут 242 КБ), чтобы затем его выбросить, и пространство таких адресов
 * бесконечно. И это не теория: в Search Console показы получает
 * `/catalog/constructors/konstruktory-malchikam?brand=cada` — сегмента
 * `constructors` в базе нет вовсе.
 *
 * Почему цель берётся из `href`, а не из `canonical_url`: `canonical_url`
 * может указывать на ЧУЖУЮ страницу, и редирект туда увёл бы посетителя не
 * туда, куда он шёл. Канонический адрес самой категории — это `href`.
 *
 * Бренд-хвост сохраняется: `/catalog/boys/brand/mattel` — законный адрес,
 * правится только категорийная часть пути.
 *
 * ЗАЩИТА ОТ ПЕТЛИ. Редирект срабатывает, только если цель — неподвижная
 * точка этой же проверки, то есть последний сегмент `href` совпадает со
 * слагом найденной категории. На боевых данных это верно у всех 64 категорий,
 * но проверка стоит: если однажды заведут категорию с рассогласованным
 * `href`, страница просто отдаст 200 без редиректа, а не уйдёт в цикл. На
 * этом проекте петля редиректов уже случалась (см. комментарий к
 * `server/middleware/brand-query-redirect.ts`), второй раз незачем.
 *
 * Только на сервере: внутри сайта переходы делает роутер, туда битые пути не
 * попадают, а лишний клиентский переход дал бы мигание выдачи.
 */
if (
  import.meta.server
    && currentCategorySlug.value !== 'all'
    && currentCategory.value?.href
) {
  const categoryHref = currentCategory.value.href.replace(/\/+$/, '')
  const expectedPath = activeBrandSlug.value
    ? buildBrandLandingPath(categoryHref, activeBrandSlug.value)
    : categoryHref

  const targetSlug = categoryHref.split('/').filter(Boolean).at(-1) ?? null

  if (expectedPath !== route.path && targetSlug === currentCategorySlug.value) {
    await navigateTo(
      { path: expectedPath, query: route.query },
      { redirectCode: 301, replace: true },
    )
  }
}

if (import.meta.client && _filterPayload.value) {
  availableBrands.value = _filterPayload.value.brands
  availableProductLines.value = _filterPayload.value.productLines
  availableFilters.value = _filterPayload.value.filters
  availableMaterials.value = _filterPayload.value.materials
  availableCountries.value = _filterPayload.value.countries
  priceRange.value = _filterPayload.value.priceRange
  pieceCountRange.value = _filterPayload.value.pieceCountRange
  numericAttributeRanges.value = _filterPayload.value.numericRanges
  activeFilters.value = _filterPayload.value.activeFilters
  categoryBrandSeo.value = _filterPayload.value.categoryBrandSeo
  isLoadingFilters.value = false
}

/*
 * Здесь лежал `useAsyncData('catalog-faq-…')`, тянувший вопросы категории (или
 * связки категория+бренд) в `faqQuestions`. Снят 15 сентября 2026: результат
 * не использовался НИГДЕ — ни в разметке страницы, ни в JSON-LD. Вопросы на
 * странице рисует `CategoryQuestions`, он грузит их сам по `category_id`.
 *
 * Чем это было плохо: лишний запрос к базе на каждый серверный рендер любой
 * категории и лишний вес payload — тексты вопросов уезжали в `__NUXT_DATA__`
 * и тут же выбрасывались.
 */

const currentCategoryId = computed(() => {
  const cat = categoriesStore.allCategories.find(
    c => c.slug === currentCategorySlug.value,
  )
  return cat?.id || null
})

const { data: categoryRatingData } = useQuery({
  queryKey: ['category-rating', currentCategoryId],
  queryFn: async () => {
    if (!currentCategoryId.value || currentCategorySlug.value === 'all')
      return null

    const { data, error } = await supabase.rpc(
      'get_category_aggregate_rating',
      {
        p_category_id: currentCategoryId.value,
      },
    )
    if (error) {
      console.error('Error fetching category rating:', error)
      return null
    }
    return data as { avg_rating: number, total_reviews: number } | null
  },
  enabled: computed(
    () => !!currentCategoryId.value && currentCategorySlug.value !== 'all',
  ),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

const showCategoryRating = computed(
  () =>
    categoryRatingData.value
    && categoryRatingData.value.total_reviews >= 3
    && categoryRatingData.value.avg_rating > 0,
)

// ─── ОПТИМИЗАЦИЯ: stringify вместо deep watcher ────────────────────────────────
// deep: true на большом объекте — дорогая операция на каждое изменение
// JSON.stringify сравнивает строку — в разы дешевле для сложных объектов
watchDebounced(
  () => JSON.stringify(activeFilters.value),
  () => {
    currentPage.value = 1
    accumulatedProducts.value = []
    updateQueryParams()
  },
  { debounce: 300 },
)

// см. composables/useRobotsContent.ts — на превью правило закрывается флагом
useIndexableRobotsRule(robotsRule)

const isLoading = computed(
  () =>
    isLoadingFilters.value
    || (isLoadingProducts.value && currentPage.value === 1),
)

const ogImageDescription = computed(() => {
  if (hasActiveFilters.value) {
    return `Найдено товаров: ${displayedProducts.value.length}`
  }
  return 'Широкий ассортимент качественных товаров по выгодным ценам'
})

defineOgImageComponent('OgImageCatalog', {
  title: title.value,
  description: ogImageDescription.value,
  productsCount: displayedProducts.value.length || undefined,
})

useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogUrl: canonicalUrl,
  ogSiteName: 'Ухтышка',
  ogLocale: 'ru_RU',
  twitterCard: 'summary_large_image',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,
  robots: computed(() =>
    robotsRule.value.noindex ? robotsNoindexFollow : robotsIndexable,
  ),
})

useBreadcrumbSchema(
  computed(() =>
    breadcrumbs.value.map(crumb => ({
      name: crumb.name,
      ...(crumb.href ? { path: crumb.href } : {}),
    })),
  ),
)

/**
 * Preload картинки первого товара.
 *
 * LCP страницы категории — это именно она. Сетка теперь приходит в разметке,
 * но браузер добирается до её <img> только дочитав тело страницы, а тело
 * конкурирует за канал с двумя десятками modulepreload из <head>. Ссылка
 * в самой голове даёт запросу стартовать раньше.
 *
 * srcset и sizes повторяют то, что объявляет карточка (ProductCard.vue ->
 * ProgressiveImage): иначе браузер выберет другой кандидат и скачает лишний
 * файл вместо нужного.
 */
const lcpImageVariants = computed(() => {
  const imageUrl = displayedProducts.value?.[0]?.product_images?.[0]?.image_url
  if (!imageUrl)
    return null

  return {
    sm: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm'),
    md: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'md'),
    lg: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'lg'),
  }
})

useHead(() => {
  const links: any[] = [{ rel: 'canonical', href: canonicalUrl.value }]

  const lcp = lcpImageVariants.value
  if (lcp?.sm) {
    links.push({
      rel: 'preload',
      as: 'image',
      href: lcp.sm,
      imagesrcset: [
        lcp.sm ? `${lcp.sm} 400w` : null,
        lcp.md ? `${lcp.md} 800w` : null,
        lcp.lg ? `${lcp.lg} 1440w` : null,
      ]
        .filter(Boolean)
        .join(', '),
      imagesizes: '(max-width: 767px) 50vw, (max-width: 1024px) 33vw, 25vw',
      fetchpriority: 'high',
    })
  }

  return {
    meta: [{ name: 'keywords', content: metaKeywords.value || '' }],
    link: links,
  }
})

// ─── ОПТИМИЗАЦИЯ: useSchemaOrg откладываем на клиенте ─────────────────────────
// JSON-LD с 10 товарами + ShippingDetails + ReturnPolicy = тяжёлый computation
// На сервере нужен для SEO, на клиенте — блокирует главный поток без пользы
const schemaData = computed(() => {
  const schemas: any[] = []

  // CollectionPage — самая важная для SEO, генерируем всегда
  schemas.push({
    '@type': 'CollectionPage',
    'name': metaTitle.value,
    'description': metaDescription.value,
    'url': canonicalUrl.value,
    'isPartOf': {
      '@type': 'WebSite',
      'name': 'Ухтышка',
      'url': 'https://uhti.kz',
    },
    ...(categoryOgImageUrl.value && { image: categoryOgImageUrl.value }),
    ...(metaKeywords.value && { keywords: metaKeywords.value }),
    ...(seoText.value && {
      mainEntity: {
        '@type': 'Article',
        'headline': title.value,
        'image': SITE_OG_IMAGE_URL,
        'articleBody': cleanDescription(seoText.value, 500),
        'author': {
          '@type': 'Organization',
          'name': 'Ухтышка',
          'url': 'https://uhti.kz',
        },
      },
    }),
    ...(displayedProducts.value.length > 0 && {
      numberOfItems: displayedProducts.value.length,
    }),
    /*
     * `aggregateRating` здесь БЫТЬ НЕ ДОЛЖЕН, и это не вкусовщина.
     *
     * Search Console по адресу
     * /catalog/constructors-root/konstruktory-malchikam/brand/mg-toys отдаёт
     * вердикт FAIL и ошибку «Invalid object type for field "<parent_node>"»
     * для Review snippets: `CollectionPage` не входит в список типов, которым
     * Google разрешает сниппет с отзывами. Разметка была, а звёзд в выдаче по
     * ней не появлялось — страница просто числилась с ошибкой. На 20 августа
     * такой узел стоял на 11 адресах, и число росло вместе с отзывами.
     *
     * Звёзды в выдаче даёт не этот узел, а рейтинги отдельных товаров внутри
     * ItemList — они на месте и не тронуты.
     *
     * `categoryRatingData` не удалён: он же питает блок рейтинга на самой
     * странице (`showCategoryRating`) и описание в мета-теге.
     */
  })

  // SiteNavigationElement
  const subcatParts = subcategories.value.slice(0, 6).map(cat => ({
    '@type': 'WebPage',
    'name': cat.name,
    'url': `https://uhti.kz${cat.href}`,
  }))
  const brandParts = availableBrands.value.slice(0, 6).map(brand => ({
    '@type': 'WebPage',
    'name': `${categoryName.value} ${brand.name}`,
    'url': `https://uhti.kz${buildBrandLandingPath(currentCategory.value?.href ?? '', brand.slug)}`,
  }))
  const navParts = [...subcatParts, ...brandParts]
  if (navParts.length > 0) {
    schemas.push({
      '@type': 'SiteNavigationElement',
      'name': `Подкатегории ${categoryName.value}`,
      'hasPart': navParts,
    })
  }

  // ItemList — тяжёлая часть, только если данные загружены
  if (displayedProducts.value.length > 0) {
    schemas.push({
      '@type': 'ItemList',
      'numberOfItems': displayedProducts.value.length,
      'itemListElement': displayedProducts.value
        .slice(0, 10)
        .map((product, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'item': {
            '@type': 'Product',
            'name': product.name,
            'description': cleanDescription(product.description) || product.name,
            'url': `https://uhti.kz/catalog/products/${product.slug}`,
            'sku': product.sku || product.id,
            'mpn': product.sku || product.id,
            'brand': {
              '@type': 'Brand',
              'name': product.brands?.name || 'Ухтышка',
              ...(product.brands?.slug && {
                url: `https://uhti.kz/brand/${product.brands.slug}`,
              }),
            },
            ...(product.barcode && { gtin: product.barcode }),
            /*
             * `IMAGE_SIZES.CARD` третьим аргументом здесь НЕ работал: пока
             * `IMAGE_OPTIMIZATION_ENABLED = false`, `getImageUrl` игнорирует
             * опции и отдаёт голый путь, а он на хранилище отдаёт 400.
             * Нужен вариант с суффиксом — как на карточке товара.
             */
            ...(product.product_images?.[0]?.image_url && {
              image: getVariantUrl(
                BUCKET_NAME_PRODUCT,
                product.product_images[0].image_url,
                'lg',
              ),
            }),
            'offers': {
              '@type': 'Offer',
              'price': product.final_price || product.price,
              'priceCurrency': 'KZT',
              'availability':
                product.stock_quantity > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
              'url': `https://uhti.kz/catalog/products/${product.slug}`,
              'priceValidUntil': priceValidUntil,
              'seller': { '@type': 'Organization', 'name': 'Ухтышка' },
              'hasMerchantReturnPolicy': {
                '@type': 'MerchantReturnPolicy',
                'applicableCountry': 'KZ',
                'returnPolicyCategory':
                  'https://schema.org/MerchantReturnFiniteReturnWindow',
                'merchantReturnDays': 14,
                'returnMethod': 'https://schema.org/ReturnByMail',
                'returnFees': 'https://schema.org/FreeReturn',
              },
              'shippingDetails': {
                '@type': 'OfferShippingDetails',
                'shippingDestination': {
                  '@type': 'DefinedRegion',
                  'addressCountry': 'KZ',
                },
                'shippingRate': {
                  '@type': 'MonetaryAmount',
                  'value': 0,
                  'currency': 'KZT',
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
            ...(Number(product.review_count) > 0
              && product.avg_rating && {
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
    })
  }

  /*
   * FAQPage — ТОЛЬКО из статических вопросов раздела, то есть из тех, что
   * показаны на странице блоком `StaticSeoBlock`.
   *
   * Вопросы, которые генерирует SQL-функция и показывает `CategoryQuestions`,
   * в разметку не идут намеренно: они собираются подстановкой названия
   * категории в шаблон, а названия у нас в дательном падеже. На
   * `/catalog/girls` это выглядит как «Что такое Девочкам?» и «Сколько стоят
   * Девочкам в Алматы?». Такое нельзя отдавать поиску расширенным сниппетом.
   */
  if (categoryStatic.value?.faq.length) {
    schemas.push({
      '@type': 'FAQPage',
      'mainEntity': categoryStatic.value.faq.map(item => ({
        '@type': 'Question',
        'name': item.q,
        'acceptedAnswer': { '@type': 'Answer', 'text': item.a },
      })),
    })
  }

  return schemas
})

if (import.meta.server) {
  // На сервере регистрируем сразу — нужно для SEO-краулеров
  useSchemaOrg(schemaData)
}
else {
  // На клиенте откладываем до после первого рендера — не блокируем главный поток
  onMounted(() => {
    nextTick(() => {
      useSchemaOrg(schemaData)
    })
  })
}
</script>

<template>
  <CategoryMobileHeader
    :sort-active="isSortDrawerOpen"
    :filters-active="isMobileFiltersOpen"
    :has-active-filters="activeFiltersCount > 0"
    @sort="isSortDrawerOpen = true"
    @filters="isMobileFiltersOpen = true"
  />

  <CategoryScrollBar
    v-model:sort-by="activeFilters.sortBy"
    :subcategories="subcategories"
    :active-subcategory-ids="activeFilters.subCategoryIds"
    :brands="availableBrands"
    :active-brand-ids="activeFilters.brandIds"
    @toggle-subcategory="toggleSubCategory"
    @toggle-brand="toggleCatalogBrandById"
  />

  <div :class="`${containerClass} py-4 lg:py-8`">
    <!-- ─── ОПТИМИЗАЦИЯ: убрали ClientOnly — breadcrumbs доступны на сервере ─── -->
    <!-- ClientOnly скрывал хлебные крошки до гидрации, увеличивая FCP -->
    <Breadcrumbs
      v-if="breadcrumbs && breadcrumbs.length > 0"
      :items="breadcrumbs"
      class="mb-3 lg:mb-6"
      compact
    />

    <!-- ЕДИНСТВЕННЫЙ H1 ДЛЯ SEO И ЛЮДЕЙ -->
    <h1
      class="text-xl md:text-3xl font-bold mb-1 lg:mb-2 transition-opacity duration-200"
      :class="brandSeoLoading ? 'opacity-0' : 'opacity-100'"
    >
      {{ title }}
    </h1>
    <!--
      Связка «раздел + бренд»: сколько моделей и цены «от … до …». Считается
      по ВСЕМ товарам связки, а не по первой странице сетки.
    -->
    <p v-if="brandLandingSummary" class="mb-2 text-sm text-muted-foreground">
      {{ brandLandingSummary }}
    </p>
    <CategoryRatingBlock
      v-if="showCategoryRating"
      :avg-rating="categoryRatingData!.avg_rating"
      :total-reviews="categoryRatingData!.total_reviews"
      class="mb-3 lg:mb-4"
    />
    <div v-else class="mb-3 lg:mb-4" />

    <!--
      С бренд-лендинга ведём на страницу самого бренда.
      Обратная ссылка была только одна и шла с /brands: Search Console
      11 сентября 2026 показывал у `/brand/lego` последний обход 30 июня и
      28-ю позицию, тогда как лендинг в категории обходился в августе и
      держался на 20-й. Две страницы делят один интент, и связать их надо
      хотя бы в одну сторону — с частой на редкую.

      Рисуется на сервере: ссылка нужна роботу, а не только человеку.
    -->
    <NuxtLink
      v-if="activeBrandSlug && activeBrandName"
      :to="`/brand/${activeBrandSlug}`"
      class="inline-flex items-center gap-1.5 mb-3 lg:mb-4 text-sm font-semibold text-primary hover:underline"
    >
      Все товары {{ activeBrandName }}
      <Icon name="lucide:arrow-right" class="size-4" />
    </NuxtLink>

    <!-- Бренды как 3-й уровень навигации (перед товарами) -->
    <CategoryBrands
      v-if="availableBrands.length > 1 && !activeBrandSlug"
      :brands="availableBrands"
      :category-slug="currentCategorySlug"
      :category-name="categoryName || undefined"
      :active-brand-slug="activeBrandSlug"
    />

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Десктоп фильтры -->
      <ClientOnly>
        <aside class="hidden lg:block col-span-1">
          <DynamicFilters
            v-model="activeFilters"
            :available-filters="
              availableFilters as unknown as AttributeWithValue[]
            "
            :available-brands="availableBrands"
            :available-product-lines="filteredProductLines"
            :price-range="priceRange"
            :piece-count-range="pieceCountRange"
            :available-materials="availableMaterials"
            :available-countries="availableCountries"
            :numeric-attribute-ranges="numericAttributeRanges"
            :is-loading="isLoadingFilters"
          />
        </aside>

        <template #fallback>
          <aside class="hidden lg:block col-span-1">
            <div class="p-4 border rounded-lg bg-card space-y-6 sticky top-24">
              <Skeleton class="h-6 w-24" />
              <div class="space-y-4 pt-4">
                <Skeleton class="h-5 w-32" />
                <div class="space-y-2">
                  <div
                    v-for="i in 4"
                    :key="i"
                    class="flex items-center space-x-2"
                  >
                    <Skeleton class="h-4 w-4 rounded" />
                    <Skeleton class="h-4 w-3/4" />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </template>
      </ClientOnly>

      <div class="col-span-1 lg:col-span-3 min-w-0">
        <div class="mb-6 space-y-4">
          <!-- Подкатегории на мобильных — горизонтальная лента чипов, из Категория.dc.html -->
          <div
            v-if="subcategories.length > 0"
            class="flex lg:hidden cf-chip-scroller"
          >
            <button
              v-for="cat in subcategories"
              :key="cat.id"
              type="button"
              class="cf-chip"
              :class="{
                'cf-chip--active': activeFilters.subCategoryIds.includes(
                  cat.id,
                ),
              }"
              @click="toggleSubCategory(cat.id)"
            >
              {{ cat.name }}
            </button>
          </div>

          <!-- Атрибутные фильтры (в потоке, не sticky) — сортировка и чипы подкатегорий
               теперь в статичном баре CatalogFilterBar над breadcrumbs. Скрываем весь
               блок целиком, если показывать нечего — иначе остаётся пустая полоса
               с бордером (сортировка раньше всегда заполняла эту строку). -->
          <div
            v-if="!isLoadingFilters && displayableFilters.length > 0"
            class="lg:bg-white dark:lg:bg-card lg:py-3 lg:border-b lg:border-border"
          >
            <div class="flex flex-wrap items-center gap-2">
              <template v-for="filter in displayableFilters" :key="filter.id">
                <!-- Select type -->
                <Popover v-if="filter.display_type === 'select'">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="cf-glass-btn hidden lg:inline-flex"
                      :class="{
                        'cf-glass-btn--active':
                          (activeFilters.attributes[filter.slug] || []).length
                          > 0,
                      }"
                    >
                      {{ filter.name }}
                      <span
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        class="cf-glass-badge"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </span>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-60"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-2">
                      <div class="flex items-center justify-between mb-2">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="
                            (activeFilters.attributes[filter.slug] || [])
                              .length > 0
                          "
                          variant="ghost"
                          size="sm"
                          class="h-6 px-2 text-xs"
                          @click="clearAttributeFilter(filter.slug)"
                        >
                          <Icon name="lucide:x" class="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div class="max-h-64 overflow-y-auto space-y-2">
                        <div
                          v-for="option in filter.attribute_options"
                          :key="option.id"
                          class="flex items-center space-x-2"
                        >
                          <Checkbox
                            :id="`attr-${filter.slug}-${option.id}`"
                            :model-value="
                              (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id)
                            "
                            @update:model-value="
                              (checked) =>
                                updateAttribute(
                                  !!checked,
                                  filter.slug,
                                  option.id,
                                )
                            "
                          />
                          <Label
                            :for="`attr-${filter.slug}-${option.id}`"
                            class="font-normal cursor-pointer text-sm"
                          >
                            {{ option.value }}
                          </Label>
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <!-- Color type -->
                <Popover v-else-if="filter.display_type === 'color'">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="cf-glass-btn hidden lg:inline-flex"
                      :class="{
                        'cf-glass-btn--active':
                          (activeFilters.attributes[filter.slug] || []).length
                          > 0,
                      }"
                    >
                      {{ filter.name }}
                      <span
                        v-if="
                          (activeFilters.attributes[filter.slug] || []).length
                            > 0
                        "
                        class="cf-glass-badge"
                      >
                        {{
                          (activeFilters.attributes[filter.slug] || []).length
                        }}
                      </span>
                      <Icon
                        name="lucide:chevron-down"
                        class="w-3.5 h-3.5 opacity-60"
                      />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent class="w-64 p-3" align="start">
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <h4 class="font-semibold text-sm">
                          {{ filter.name }}
                        </h4>
                        <Button
                          v-if="
                            (activeFilters.attributes[filter.slug] || [])
                              .length > 0
                          "
                          variant="ghost"
                          size="sm"
                          class="h-6 px-2 text-xs"
                          @click="clearAttributeFilter(filter.slug)"
                        >
                          <Icon name="lucide:x" class="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="option in filter.attribute_options"
                          :key="option.id"
                          type="button"
                          :title="option.value"
                          :style="{
                            backgroundColor: (
                              option.meta as { hex?: string } | null
                            )?.hex,
                          }"
                          class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 active:scale-95"
                          :class="{
                            'border-primary ring-2 ring-primary ring-offset-2':
                              (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id),
                            'border-border': !(
                              activeFilters.attributes[filter.slug] || []
                            ).includes(option.id),
                          }"
                          @click="
                            () => {
                              const isCurrentlyChecked = (
                                activeFilters.attributes[filter.slug] || []
                              ).includes(option.id);
                              updateAttribute(
                                !isCurrentlyChecked,
                                filter.slug,
                                option.id,
                              );
                            }
                          "
                        />
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </template>
            </div>
          </div>

          <!-- Сортировка + бренды + чипы подкатегорий (десктоп) — над сеткой
               товаров, из CatalogFilterBar.dc.html. Без фона: просто ряд пилюль. -->
          <div class="hidden lg:flex items-center gap-2">
            <CatalogHeader
              v-model:sort-by="activeFilters.sortBy"
              v-model:open="isSortDrawerOpen"
              hide-mobile-trigger
              hide-desktop-trigger
            />

            <Popover v-model:open="isSortPopoverOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="cf-glass-btn inline-flex"
                  :class="{
                    'cf-glass-btn--active': activeFilters.sortBy !== 'popularity',
                  }"
                >
                  {{ currentSortLabel }}
                  <Icon
                    name="lucide:chevron-down"
                    class="w-3.5 h-3.5 opacity-60 transition-transform"
                    :class="{ 'rotate-180': isSortPopoverOpen }"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                class="w-56 p-1.5 rounded-2xl shadow-xl flex flex-col gap-0.5"
              >
                <button
                  v-for="option in catalogSortOptions"
                  :key="option.value"
                  type="button"
                  class="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors hover:bg-accent"
                  :class="{ 'font-bold': activeFilters.sortBy === option.value }"
                  @click="selectCatalogSort(option.value)"
                >
                  {{ option.label }}
                  <Icon
                    v-if="activeFilters.sortBy === option.value"
                    name="lucide:check"
                    class="w-4 h-4 text-primary"
                  />
                </button>
              </PopoverContent>
            </Popover>

            <Popover v-if="availableBrands.length > 0" v-model:open="isBrandPopoverOpen">
              <PopoverTrigger as-child>
                <button
                  type="button"
                  class="cf-glass-btn inline-flex"
                  :class="{ 'cf-glass-btn--active': activeFilters.brandIds.length > 0 }"
                >
                  Бренды
                  <span v-if="activeFilters.brandIds.length > 0" class="cf-glass-badge">
                    {{ activeFilters.brandIds.length }}
                  </span>
                  <Icon
                    name="lucide:chevron-down"
                    class="w-3.5 h-3.5 opacity-60 transition-transform"
                    :class="{ 'rotate-180': isBrandPopoverOpen }"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                class="w-60 p-1.5 rounded-2xl shadow-xl flex flex-col gap-1 max-h-80 overflow-y-auto"
              >
                <div
                  v-for="brand in availableBrands"
                  :key="brand.id"
                  class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-accent"
                >
                  <Checkbox
                    :id="`cfb-brand-${brand.id}`"
                    :model-value="activeFilters.brandIds.includes(brand.id)"
                    @update:model-value="(checked) => toggleCatalogBrand(!!checked, brand.id)"
                  />
                  <Label
                    :for="`cfb-brand-${brand.id}`"
                    class="flex-1 min-w-0 flex items-center justify-between gap-2 font-normal cursor-pointer text-sm"
                  >
                    <span class="truncate">{{ brand.name }}</span>
                    <span v-if="brand.products_count" class="text-xs text-muted-foreground shrink-0">
                      {{ brand.products_count }}
                    </span>
                  </Label>
                </div>
              </PopoverContent>
            </Popover>

            <div
              v-if="subcategories.length > 0"
              class="flex cf-chip-scroller flex-1 min-w-0"
            >
              <button
                v-for="cat in subcategories"
                :key="cat.id"
                type="button"
                class="cf-chip"
                :class="{
                  'cf-chip--active': activeFilters.subCategoryIds.includes(cat.id),
                }"
                @click="toggleSubCategory(cat.id)"
              >
                {{ cat.name }}
              </button>
            </div>
          </div>
        </div>

        <!-- Контент с плавным переходом.
             ClientOnly здесь больше нет: под ним сетка товаров не попадала
             в разметку вовсе, сервер отдавал 68 скелетонов, и LCP на мобиле
             доходил до 10 с — картинки начинали грузиться только после того,
             как браузер скачает и разберёт JS и заново сходит за товарами.
             Данные для сервера даёт useCatalogQuery. -->
        <Transition
          enter-active-class="transition-opacity duration-200"
          leave-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-to-class="opacity-0"
          mode="out-in"
        >
          <div :key="isLoading ? 'loading' : 'content'">
            <ProductGridSkeleton
              v-if="isLoading && displayedProducts.length === 0"
            />

            <div v-else-if="displayedProducts.length > 0" class="space-y-8">
              <ProductGrid :products="displayedProducts" />

              <div v-if="hasMore" class="text-center">
                <button
                  type="button"
                  class="cf-glass-btn cf-glass-btn--lg inline-flex"
                  :disabled="isFetching"
                  @click="loadMoreProducts"
                >
                  <span v-if="isFetching">Загрузка...</span>
                  <template v-else>
                    <span>Показать ещё</span>
                    <Icon name="lucide:chevron-down" class="w-4 h-4" />
                  </template>
                </button>
              </div>

              <div
                v-if="isFetching && currentPage > 1"
                class="text-center text-sm text-muted-foreground"
              >
                Загрузка товаров...
              </div>
            </div>

            <div
              v-else
              class="text-center py-16 bg-white dark:bg-card border border-border rounded-[22px]"
            >
              <div
                class="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4"
              >
                <Icon
                  name="lucide:package-open"
                  class="w-7 h-7 text-muted-foreground"
                />
              </div>
              <h3 class="text-xl font-bold">
                {{
                  hasActiveFilters
                    ? "Товары не найдены"
                    : "Скоро здесь появятся товары"
                }}
              </h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{
                  hasActiveFilters
                    ? "Попробуйте изменить фильтры или выбрать другую категорию."
                    : "Мы работаем над наполнением этой категории. Загляните позже!"
                }}
              </p>
              <button
                v-if="hasActiveFilters"
                type="button"
                class="cf-glass-btn cf-glass-btn--primary mt-5 inline-flex"
                @click="resetAllFilters"
              >
                <Icon name="lucide:x" class="w-4 h-4" />
                Сбросить все фильтры
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Другие бренды внизу (показываем только когда бренд уже выбран) -->
    <CategoryBrands
      v-if="availableBrands.length > 1 && activeBrandSlug"
      :brands="availableBrands"
      :category-slug="currentCategorySlug"
      :category-name="categoryName || undefined"
      :active-brand-slug="activeBrandSlug"
    />

    <!-- Линейки продуктов в категории -->
    <CategoryProductLines
      v-if="availableProductLines.length > 0"
      :product-lines="availableProductLines"
      :brands="availableBrands"
    />

    <!-- ─── Отложенные блоки ─────────────────────────────────────────────
         Всё, что ниже, рисуется ТОЛЬКО на клиенте и появляется через
         несколько секунд после первой отрисовки. Поэтому эти блоки стоят
         в самом конце — после серверных «Других брендов» и «Линеек».

         Порядок здесь не вкусовщина, а починка CLS. Раньше они шли ВЫШЕ
         серверных блоков, и появление отзывов на 6-й секунде выталкивало
         уже отрисованное: высота страницы прыгала 3178 → 3850 → 4928, а
         «Другие бренды» уезжали с y645 на y2396. Lighthouse давал
         бренд-лендингу CLS 0.2464, пассивные прогоны браузера — 0.2468 и
         0.4672 при пороге Google 0.1.

         Теперь вставка происходит ниже сгиба и видимого контента не
         двигает. Настоящее решение — отдавать эти блоки с сервера: тогда
         вставки не будет вовсе, а тексты отзывов и FAQ станут видны
         поисковику. Это отдельная работа: нужны их данные в SSR.
    ─────────────────────────────────────────────────────────────────── -->

    <!-- SEO текст категории — рисуется НА СЕРВЕРЕ.

         `ClientOnly` снят вместе с заглушкой в `seoBlocks`: пока они стояли,
         текст не попадал в серверную разметку и поисковик его не видел.

         Условие `!hasActiveFilters` оставлено: на отфильтрованной выдаче
         категорийный текст не к месту. На таких адресах блок может исчезнуть
         после гидратации (ISR срезает query, и сервер считает фильтры
         пустыми), но они закрыты `noindex`, а сам блок стоит ниже сгиба —
         видимого сдвига это не даёт. -->
    <SEOContentRenderer
      v-if="seoBlocks.length > 0 && !hasActiveFilters"
      :blocks="seoBlocks"
      class="mt-8"
    />

    <!-- Свой текст и вопросы корневого раздела — из репозитория.

         Показываются, только когда в базе текста нет (`seoBlocks` пуст) и
         фильтры не активны. Почему не через `SEOContentRenderer`, которым
         рисуется текст из базы: тот разбирает HTML регулярками и ВЫРЕЗАЕТ
         ССЫЛКИ, а половина смысла этого текста — увести в подразделы. -->
    <CommonStaticSeoBlock
      v-if="categoryStatic && !hasActiveFilters"
      :html="seoBlocks.length > 0 ? undefined : categoryStatic.html"
      :faq="categoryStatic.faq"
    />

    <!-- FAQ блок для категории — рисуется НА СЕРВЕРЕ.

         `ClientOnly` снят: пока он стоял, вопросы и ответы не попадали в
         серверную разметку, хотя FAQ — ровно тот контент, который Google
         показывает расширенными сниппетами. Данные компонент берёт через
         useAsyncData, а санитайзер в нём переведён с DOM на регулярки —
         иначе серверный рендер был бы невозможен.

         У разделов со СВОИМИ вопросами (блок выше) этот скрыт: шаблонные
         вопросы SQL-генератора подставляют название раздела в дательном
         падеже и получаются нечитаемыми — разбор в шапке
         `constants/categoryStaticText.ts`. -->
    <CategoryQuestions
      v-if="currentCategory && !categoryStatic"
      :category-id="currentCategory.id"
      :category-name="currentCategory.name"
    />

    <!-- Отзывы категории — рисуются НА СЕРВЕРЕ.

         Показывать или нет — решает сам компонент: у него есть данные по всей
         категории, а categoryStats считает только по текущей странице выдачи,
         из-за чего блок то появлялся, то исчезал при смене страницы.

         `ClientOnly` снят намеренно: пока он стоял, тексты отзывов не попадали
         в серверную разметку и для поисковика их не существовало. Данные
         компонент берёт через useAsyncData, обращений к DOM у него нет. -->
    <CategoryReviews
      v-if="currentCategory"
      :category-id="currentCategory.id"
      :category-name="currentCategory.name"
      class="mt-8"
    />

    <!-- Мобильные компоненты -->
    <ClientOnly>
      <!-- Мобильные фильтры (bottom sheet) -->
      <MobileCatalogDrawer
        v-model="activeFilters"
        :open="isMobileFiltersOpen"
        :available-filters="availableFilters as unknown as AttributeWithValue[]"
        :available-brands="availableBrands"
        :available-product-lines="filteredProductLines"
        :price-range="priceRange"
        :piece-count-range="pieceCountRange"
        :available-materials="availableMaterials"
        :available-countries="availableCountries"
        :numeric-attribute-ranges="numericAttributeRanges"
        :is-loading="isLoadingFilters"
        @update:open="isMobileFiltersOpen = $event"
      />
    </ClientOnly>
  </div>

  <!-- Плавающая кнопка «Наверх» — только десктоп, из Категория.dc.html -->
  <button
    v-if="showScrollTop"
    type="button"
    class="hidden lg:flex cf-scrolltop"
    aria-label="Наверх"
    @click="scrollToTop"
  >
    <Icon name="lucide:arrow-up" class="w-4 h-4 text-primary" />
    Наверх
  </button>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  @keyframes shimmer {
    0% {
      background-position: -200% center;
    }
    100% {
      background-position: 200% center;
    }
  }

  /* ─── Стеклянные пилюли из Категория.dc.html (панель управления, чипсы, "Наверх") ─── */
  /* display здесь задавать нельзя: scoped-стиль компилируется вне @layer, а
     утилиты Tailwind лежат в @layer utilities, и беслойное правило бьёт слой
     независимо от специфичности. Пока тут стоял display: inline-flex, классы
     `hidden` и `lg:inline-flex` на кнопках атрибутных фильтров не работали
     вовсе, и кнопки для десктопа были видны на мобильном. Раскладку задаём
     утилитами на самой кнопке. */
  .cf-glass-btn {
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.9), rgba(224, 233, 247, 0.55));
    -webkit-backdrop-filter: blur(14px) saturate(1.7);
    backdrop-filter: blur(14px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 -1px 2px rgba(15, 23, 42, 0.06),
      0 6px 18px rgba(15, 23, 42, 0.1);
    color: var(--foreground);
    font: 600 14px var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .cf-glass-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .cf-glass-btn--active {
    border-color: var(--primary);
    background: linear-gradient(150deg, rgba(219, 234, 254, 0.95), rgba(191, 219, 254, 0.6));
    color: var(--blue-700);
  }

  .cf-glass-btn--lg {
    height: 50px;
    padding: 0 26px;
    font-size: 15px;
  }

  .cf-glass-btn--primary {
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: linear-gradient(150deg, rgba(77, 148, 255, 0.95), rgba(23, 101, 235, 0.85));
    color: #fff;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -2px 8px rgba(6, 53, 138, 0.28),
      0 8px 20px rgba(43, 127, 255, 0.35);
  }

  .cf-glass-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font: 700 11px var(--font-sans);
  }

  .cf-chip-scroller {
    /* display is driven by the Tailwind flex/hidden/lg:* utilities on each
       usage site — a scoped display here would out-specificity them (see
       mobilenav-dc-port memory) and the element would never actually hide. */
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .cf-chip-scroller::-webkit-scrollbar {
    display: none;
  }

  .cf-chip {
    flex: none;
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: none;
    background: var(--muted);
    color: var(--foreground);
    font: 600 13.5px var(--font-sans);
    white-space: nowrap;
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .cf-chip--active {
    background: rgba(43, 127, 255, 0.12);
    color: var(--primary);
    font-weight: 700;
  }

  .cf-scrolltop {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 70;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 18px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.18));
    -webkit-backdrop-filter: blur(24px) saturate(1.9);
    backdrop-filter: blur(24px) saturate(1.9);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.85),
      inset 0 -1px 1px rgba(15, 23, 42, 0.05),
      0 12px 32px rgba(15, 23, 42, 0.18);
    color: var(--foreground);
    font: 700 13px var(--font-sans);
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  .cf-scrolltop:active {
    transform: translateX(-50%) scale(0.96);
  }
}
</style>

<script setup lang="ts">
import type { BrandPageLayout, IBreadcrumbItem, ProductLine } from '@/types'

import { ArrowLeft, Package } from 'lucide-vue-next'

import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useBrandPageFilters } from '@/composables/useBrandPageFilters'
import {
  BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS,
  BUCKET_NAME_BRANDS,
  BUCKET_NAME_PRODUCT,
  SITE_OG_IMAGE_URL,
} from '@/constants'
import { brandStaticFaq, emptyBrandAlternatives } from '@/constants/brandStaticText'
import { pageShell, setShellOverride } from '@/lib/shell'
import { carouselContainerVariants } from '@/lib/variants'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { brandHeadingWord } from '@/utils/brandHeading'
import { composeBrandMeta, composeEmptyBrandMeta } from '@/utils/brandMeta'
import { validGtin } from '@/utils/gtin'
import { merchantReturnPolicy, offerPrice, offerShippingDetails, strikethroughPrice } from '@/utils/offerSchema'

definePageMeta({ layout: 'shell', shell: pageShell })

const route = useRoute()
const supabase = useSupabaseClient()
const productsStore = useProductsStore()
const { getVariantUrl } = useSupabaseStorage()
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
 * Коллекция каждого товара бренда.
 *
 * Лендинг раскладывает товары по сериям, а выдача `get_filtered_products`
 * своей линейки не отдаёт — в списке колонок её просто нет. Отдельный лёгкий
 * запрос дешевле правки RPC: две колонки на весь бренд, и он идёт на сервере,
 * чтобы разбивка попала в серверную разметку вместе с товарами.
 */
const { data: lineByProduct } = await useAsyncData(
  `brand-product-lines-${brandSlug}`,
  async () => {
    if (!brand.value)
      return {}

    const { data, error } = await supabase
      .from('products')
      .select('id, product_line_id')
      .eq('brand_id', brand.value.id)
      .eq('is_active', true)
      .not('product_line_id', 'is', null)

    if (error) {
      console.error('Error loading product lines map:', error)
      return {}
    }

    const map: Record<string, string> = {}
    for (const row of data ?? []) {
      if (row.product_line_id)
        map[row.id] = row.product_line_id
    }
    return map
  },
  { watch: [brand], default: (): Record<string, string> => ({}) },
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
 * карты сайта, — одна функция `decideBrandLanding`. Ссылаться на адрес,
 * закрытый `noindex`, незачем — он и в карте отсутствует.
 *
 * До 21 сентября 2026 ссылки ставились только на связки со строкой в
 * `category_brand_seo`, а подписью шло имя раздела как есть — на /brand/lego
 * это было «Конструкторы Мальчикам». Теперь связка открыта и без написанного
 * текста (он собирается из её товаров), а подпись — читаемое имя `seo_h1`.
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
/*
 * Частые вопросы бренда для секции FAQ.
 *
 * Таблица `brand_questions` существовала и наполнялась (50 записей,
 * `generate_brand_questions`), но на странице не показывалась нигде — блока
 * FAQ в шаблоне не было вовсе.
 *
 * Через `useAsyncData`, а не клиентским запросом: вопросы и ответы — это
 * текст, ради которого страницу и открывают из поиска, он обязан быть в
 * серверной разметке. Ровно та беда, что была у товаров бренд-страниц до
 * правки 22 августа.
 *
 * Берём только отвеченные и по порядку `priority_order`: в таблице лежат и
 * заготовки без ответа, им в публичном FAQ делать нечего.
 */
const { data: brandQuestions } = await useAsyncData(
  `brand-questions-${brandSlug}`,
  async () => {
    if (!brand.value)
      return []

    const { data, error } = await supabase
      .from('brand_questions')
      .select('id, question_text, answer_text, priority_order')
      .eq('brand_id', brand.value.id)
      .not('answer_text', 'is', null)
      .order('priority_order', { ascending: true })
      .limit(8)

    if (error) {
      console.error('Не удалось загрузить вопросы бренда:', error)
      return []
    }
    return data ?? []
  },
  { watch: [brand] },
)

/*
 * Соседние бренды для рельса перелинковки внизу страницы.
 *
 * На сервере, а не на клиенте: это внутренние ссылки, робот должен видеть
 * их в разметке. Берём только те, у кого есть логотип — плитка без него
 * пустая, — и с запасом, лишние отсечёт сам компонент.
 */
const { data: otherBrands } = await useAsyncData(
  `brand-siblings-${brandSlug}`,
  async () => {
    const { data, error } = await supabase
      .from('brands')
      .select('name, slug, logo_url')
      .not('logo_url', 'is', null)
      .neq('slug', brandSlug)
      .order('name')
      .limit(16)

    if (error) {
      console.error('Не удалось загрузить соседние бренды:', error)
      return []
    }
    return data ?? []
  },
)

const { data: brandCategoryData } = await useAsyncData(
  `brand-category-links-${brandSlug}`,
  async () => {
    const empty = {
      links: [] as { name: string, path: string }[],
      topCategory: null as string | null,
      topRootSlug: null as string | null,
    }
    if (!brand.value)
      return empty

    const brandId = brand.value.id

    const [brandProducts, allCategories] = await Promise.all([
      supabase
        .from('products')
        .select('category_id')
        .eq('brand_id', brandId)
        .eq('is_active', true),
      supabase.from('categories').select('id, parent_id, name, slug, href, seo_h1'),
    ])

    const categories = (allCategories.data ?? []) as {
      id: string
      parent_id: string | null
      name: string
      slug: string | null
      href: string | null
      seo_h1: string | null
    }[]

    /*
     * Корневая категория, в которой у бренда больше всего товаров. Из её
     * слага берётся слово для заголовка — «Конструкторы LEGO»; почему не имя
     * категории как есть, объяснено в `utils/brandHeading.ts`.
     *
     * Берём именно корень дерева, а не категорию товара: «Конструкторы»
     * читается как раздел, «Конструкторы Мальчикам» в заголовке бренда
     * звучит криво.
     *
     * Поля `seo_h1` и `meta_title` из админки по-прежнему главнее: это
     * фолбэк для 32 брендов, у которых они пустые.
     */
    const byId = new Map(categories.map(c => [c.id, c]))
    const rootCounts = new Map<string, number>()
    for (const product of brandProducts.data ?? []) {
      let current = product.category_id ? byId.get(product.category_id) : undefined
      // Ограничение глубины — страховка от петли `parent_id` в данных.
      for (let depth = 0; current?.parent_id && depth < 10; depth++)
        current = byId.get(current.parent_id)
      if (current)
        rootCounts.set(current.id, (rootCounts.get(current.id) ?? 0) + 1)
    }
    const topRootId = [...rootCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    const topRootSlug = topRootId ? byId.get(topRootId)?.slug ?? null : null
    const topCategory = brandHeadingWord(topRootSlug)

    const counts = countProductsByCategoryBrand(
      (brandProducts.data ?? []).map(p => ({
        category_id: p.category_id,
        brand_id: brandId,
      })),
      categories,
    )

    const seen = new Set<string>()
    const links: { name: string, path: string }[] = []

    for (const category of categories) {
      if (!category.slug || !counts.has(brandLandingPairKey(category.id, brandId)))
        continue
      if (!decideBrandLanding(category.id, brandId, counts, categories, brand.value.name).indexable)
        continue

      const path = buildBrandLandingPath(
        category.href || `/catalog/${category.slug}`,
        brandSlug,
      )
      if (seen.has(path))
        continue
      seen.add(path)
      links.push({ name: category.seo_h1?.trim() || category.name, path })
    }

    return {
      links: links.sort((a, b) => a.name.localeCompare(b.name, 'ru')),
      topCategory,
      topRootSlug,
    }
  },
  {
    watch: [brand],
    default: () => ({
      links: [] as { name: string, path: string }[],
      topCategory: null as string | null,
      topRootSlug: null as string | null,
    }),
  },
)

/**
 * Лента «Рекомендуем» на лендинге: товары ТОГО ЖЕ раздела каталога, но
 * других брендов.
 *
 * Данных о совместных покупках у нас нет — `accessory_ids` у товаров бренда
 * пустой, а заказы на клиент не приходят. Поэтому лента честно показывает
 * соседей по разделу; заодно это внутренние ссылки на другие бренды.
 *
 * На сервере и только для лендинга: обычному шаблону лента не нужна, а
 * лишний запрос иначе платят все 32 бренда.
 */
const { data: recommendedProducts } = await useAsyncData(
  `brand-recommended-${brandSlug}`,
  async () => {
    const rootSlug = brandCategoryData.value?.topRootSlug
    if (!brand.value || !(brand.value as any).is_custom_page || !rootSlug)
      return []

    const result = await productsStore.fetchProducts(
      { categorySlug: rootSlug, sortBy: 'newest' } as any,
      1,
      24,
    )

    return (result.products ?? [])
      .filter(product => product.brand_id !== brand.value!.id)
      .slice(0, 12)
  },
  { watch: [brand, brandCategoryData], default: () => [] },
)

/** Ссылки на бренд-лендинги в категориях. */
const brandCategoryLinks = computed(() => brandCategoryData.value?.links ?? [])

/*
 * Товары бренда для описания в выдаче (utils/brandMeta.ts): цены и серии.
 * Отдельная лёгкая выборка — все активные товары бренда, а не первая
 * страница сетки, иначе «от … до …» считалось бы по неполному списку.
 */
const { data: brandMetaProducts } = await useAsyncData(
  `brand-meta-products-${brandSlug}`,
  async () => {
    if (!brand.value)
      return []
    const { data, error } = await supabase
      .from('products')
      .select('price, final_price, stock_quantity, product_lines(name)')
      .eq('brand_id', brand.value.id)
      .eq('is_active', true)
    if (error) {
      console.error('Не удалось загрузить товары бренда для описания:', error)
      return []
    }
    return (data ?? []).map((p: any) => ({
      price: p.price,
      final_price: p.final_price,
      stock_quantity: p.stock_quantity,
      lineName: p.product_lines?.name ?? null,
    }))
  },
  { watch: [brand] },
)

/**
 * Слово для заголовка: «Конструкторы» у LEGO, «Игрушки» у бренда из раздела
 * аудитории. Пустое, пока у бренда нет товаров ни в одной категории.
 */
const topCategory = computed(() => brandCategoryData.value?.topCategory ?? null)

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

/*
 * У лендинга своя липкая панель разделов, и липкая шапка сайта над ней
 * ставила бы две полосы друг на друге. Гасим её только здесь — остальные 31
 * бренд идут обычным шаблоном, и у них шапка остаётся липкой. Так же, к
 * слову, устроен каталог: там шапка нелипкая, а сверху плавает капсула.
 */
setShellOverride(() => (isCustomPage.value ? { header: 'static' } : null))

/** Вопросы из статики: те же, что показаны на лендинге блоком «Частые вопросы». */
const staticFaq = computed(() => brandStaticFaq(brand.value?.slug))
/** Куда вести с пустой страницы бренда: и в блоке на странице, и в описании. */
const brandAlternatives = computed(() => emptyBrandAlternatives(brand.value?.slug))
const pageLayout = computed(
  () => (brand.value as any)?.page_layout as BrandPageLayout | null,
)

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
  /*
   * «Конструкторы LEGO — купить в Алматы с доставкой», а не «LEGO - Купить
   * товары бренда в Алматы». Формулировка повторяет заголовок бренд-лендинга
   * в категории: по тем же запросам он держится на 20-й позиции против 28-й
   * у страницы бренда (Search Console, лето 2026). Слово раздела берётся из
   * товаров бренда — см. `topCategory`.
   */
  if (topCategory.value)
    return `${topCategory.value} ${brand.value.name} — купить в Алматы с доставкой | ${siteName}`
  return `${brand.value.name} - Купить товары бренда в Алматы | ${siteName}`
})

const metaDescription = computed(() => {
  if (!brand.value)
    return `Товары бренда в ${siteName}`
  /*
   * Из товаров бренда: число моделей, цены «от … до …» и серии, которые
   * реально есть (utils/brandMeta.ts). Написанное владельцем мета-описание
   * остаётся — факты встают впереди. Запасные варианты ниже — только для
   * бренда без товаров: кусок текста о бренде рекламировал серии, которых в
   * магазине нет (у ZURU — X-Shot, 5 Surprise, Pets Alive).
   */
  const composed = composeBrandMeta({
    word: topCategory.value,
    brandName: brand.value.name,
    products: brandMetaProducts.value ?? [],
    lead: brand.value.meta_description,
  })
  if (composed)
    return composed
  /*
   * Пустой бренд (план по аудиту, п. 10): ниже шли «Купить игрушки BOWA в
   * Казахстане…» из базы, а на странице ни одного товара. Строка в выдаче
   * говорит, как есть, и называет те же разделы, что блок на странице.
   */
  if (brandHasProducts.value === false)
    return composeEmptyBrandMeta(brand.value.name, brandAlternatives.value)
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
    /*
     * Brand. Линеек здесь больше нет: они стояли в `subOrganization`, а у типа
     * `Brand` такого свойства нет — оно есть только у `Organization`, и
     * проверка разметки его отбрасывала (аудит 24 сентября 2026). К тому же в
     * список шли и пустые серии — Friends, Technic, Ninjago у LEGO с нулём
     * товаров и `noindex`. Страницы серий поисковик видит по ссылкам мозаики
     * и по карте сайта.
     */
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
              ...filterState.products.value.map(p => offerPrice(p)),
            ),
            'highPrice': Math.max(
              ...filterState.products.value.map(p => offerPrice(p)),
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
        // Столько, сколько элементов в списке, а не всех товаров бренда: у
        // LEGO стояло 14 при 10 элементах (аудит 24 сентября 2026)
        'numberOfItems': Math.min(filterState.products.value.length, 10),
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
              /*
               * Вариант с суффиксом, а не голый путь. В `product_images.image_url`
               * лежит путь БЕЗ расширения (`.../uhti-product-…-46e271a8`), файлы
               * на хранилище называются `…_sm.webp`, `…_md.webp`, `…_lg.webp`.
               * Публичный URL по голому пути отдаёт 400 — проверено на бою
               * 15 сентября 2026 на всех бренд-страницах.
               *
               * `getImageUrl` здесь не подходит и с третьим аргументом:
               * трансформация выключена (`IMAGE_OPTIMIZATION_ENABLED = false`),
               * и опции размера молча игнорируются.
               */
              ...(product.product_images?.[0]?.image_url && {
                image: getVariantUrl(
                  BUCKET_NAME_PRODUCT,
                  product.product_images[0].image_url,
                  'lg',
                ),
              }),
              // FIX: короткий SKU из поля БД, не slug
              'sku': getProductSku(product),
              // FIX: mpn дублирует sku для устранения варнингов Google
              'mpn': getProductSku(product),
              // Только настоящий GTIN (utils/gtin.ts): «8497» из базы — не штрихкод.
              ...(validGtin(product.barcode) ? { gtin: validGtin(product.barcode) } : {}),
              // FIX: brand без дублирования name
              'brand': {
                '@type': 'Brand',
                '@id': `${brandUrl.value}#brand`,
                'name': brand.value!.name,
              },
              /*
               * Условия продавца и скидка — те же, что на карточке товара
               * (utils/offerSchema.ts). До 21 сентября 2026 здесь жила отдельная
               * копия: текущая цена с пометкой SalePrice (Google ждёт её без пометок,
               * а старую — как StrikethroughPrice), доставка 0 ₸, срок 1–3 дня,
               * возврат почтой и бесплатно.
               */
              'offers': {
                '@type': 'Offer',
                'price': offerPrice(product),
                'priceCurrency': 'KZT',
                ...strikethroughPrice(product),
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
                'hasMerchantReturnPolicy': merchantReturnPolicy(),
                'shippingDetails': offerShippingDetails(),
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

    /*
     * FAQPage.
     *
     * Вопросы берутся из статики бренда (`constants/brandStaticText.ts`) —
     * ровно те, что ПОКАЗАНЫ на странице блоком «Частые вопросы». Раньше
     * здесь лежали три общих вопроса, которых в разметке страницы не было
     * вовсе: Google такие блоки игнорирует, а то и считает нарушением.
     *
     * Для брендов без статики разметки нет. До 25 сентября 2026 им уходила
     * общая тройка («Где купить…», «Как быстро доставляют…», «Какая
     * гарантия…»), которой на странице не было, — аудит 24 сентября нашёл её
     * на /brand/cada и /brand/mokatoys: три вопроса в JSON-LD, ноль на
     * странице. Google требует, чтобы разметка повторяла видимый текст. Что у
     * таких брендов видно — вопросы из `brand_questions` (BrandFaqList), — в
     * FAQPage намеренно не идёт, причина записана в самом компоненте.
     */
    brand.value && staticFaq.value.length > 0 && {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        'mainEntity': staticFaq.value.map(item => ({
          '@type': 'Question',
          'name': item.q,
          'acceptedAnswer': { '@type': 'Answer', 'text': item.a },
        })),
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

    <!--
      Кастомный шаблон. БЕЗ общего контейнера и вертикальных отступов: полосы
      лендинга идут во всю ширину экрана, ширину держит каждая полоса сама.
    -->
    <div v-else-if="isCustomPage">
      <BrandCustomTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
        :line-by-product="lineByProduct"
        :featured-line-ids="pageLayout?.featuredLineIds ?? null"
        :category-links="brandCategoryLinks"
        :top-category="topCategory"
        :recommended="recommendedProducts"
      />
    </div>

    <!-- Стандартный шаблон -->
    <div v-else :class="`${containerClass} py-4 md:py-8`">
      <BrandStandardTemplate
        :brand="brand"
        :product-lines="brandProductLines"
        :breadcrumbs="breadcrumbs"
        :filter-state="filterState"
        :brand-stats="brandStats"
        :questions="brandQuestions"
        :other-brands="otherBrands"
        :top-category="topCategory"
        :has-products="brandHasProducts"
        :alternatives="brandAlternatives"
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

import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'

interface SitemapImage {
  loc: string
}

interface SitemapRoute {
  loc: string
  lastmod: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
  images?: SitemapImage[]
}

const SUPABASE_STORAGE_URL = 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images'

/**
 * Даты последней правки страниц, чьё содержимое живёт в коде, а не в базе.
 *
 * Зачем вообще. Инспекция всех 309 адресов через Search Console 17 августа
 * показала: шесть страниц уходили в sitemap БЕЗ `lastmod` — `/about`,
 * `/privacy-policy`, `/returns`, `/terms`, `/catalog/new`, `/catalog/promotions`.
 * Две из них Google не переобходил с апреля и до сих пор считает `/about`
 * несуществующей (Not found 404 по обходу от 5 апреля), хотя страница живая
 * и отдаёт 200. Без `lastmod` у робота нет повода вернуться.
 *
 * Даты взяты из истории git по самим файлам страниц — то есть отражают, когда
 * текст действительно менялся.
 *
 * ВАЖНО: правите текст такой страницы — обновите дату здесь же. Забыть не
 * страшно (робот просто не получит подсказку), но смысл поля именно в этом.
 */
const STATIC_PAGE_LASTMOD: Record<string, string> = {
  '/about': '2026-08-16T11:15:06+05:00',
  '/terms': '2026-08-16T11:15:06+05:00',
  '/returns': '2026-05-25T12:05:55+05:00',
  '/privacy-policy': '2026-03-18T15:33:05+05:00',
}

export default defineEventHandler(async (event): Promise<SitemapRoute[]> => {
  const client = await serverSupabaseClient<Database>(event)
  const sitemapRoutes: SitemapRoute[] = []

  try {
    // Статические страницы добавляются НИЖЕ, после загрузки товаров: датой
    // листингов служит время правки самого свежего товара, а его надо сперва
    // узнать. Раньше здесь стоял `new Date()` — см. пояснение у STATIC_PAGES.
    //
    // ❌ '/brand/all' убран: страница возвращает 404 — pages/brand/[slug].vue
    // не обрабатывает "all" как валидный слаг, а страница со списком всех
    // брендов живёт на /brands (уже исключена из sitemap в nuxt.config.ts).

    // --- ТОВАРЫ (с изображениями для Google Images) ---
    const { data: products, error: productsError } = await client
      .from('products')
      .select('slug, updated_at, product_images(image_url, display_order)')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10000) // ✅ Явно указываем большой лимит

    if (productsError) {
      console.error('❌ Ошибка загрузки товаров для sitemap:', productsError)
    }

    // ✅ Логирование количества товаров
    console.log(`✅ Sitemap: Загружено ${products?.length || 0} товаров`)

    if (products && products.length > 0) {
      products.forEach((product: any) => {
        const images: SitemapImage[] = (product.product_images || [])
          .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
          .slice(0, 3)
          .map((img: any) => ({
            loc: `${SUPABASE_STORAGE_URL}/${img.image_url}`,
          }))

        sitemapRoutes.push({
          loc: `/catalog/products/${product.slug}`,
          lastmod: product.updated_at ?? new Date().toISOString(),
          changefreq: 'daily',
          priority: 0.8,
          ...(images.length > 0 && { images }),
        })
      })
    }
    else {
      console.warn('⚠️ Товары не найдены в базе данных')
    }

    /*
     * --- СТРАНИЦЫ-ЛИСТИНГИ И СТАТИКА ---
     *
     * Датой листингов служит время правки самого свежего товара: именно этим
     * их содержимое и меняется. Прежде здесь стоял `new Date()`, то есть
     * `lastmod` менялся на КАЖДЫЙ запрос sitemap. Это хуже, чем не указывать
     * его вовсе: Google перестаёт доверять полю, которое всегда «только что».
     *
     * Товары приходят отсортированными по created_at, поэтому максимум по
     * updated_at считаем отдельно.
     */
    const newestProductLastmod = (products ?? []).reduce<string | null>(
      (max, p: any) => {
        const value = p.updated_at
        if (!value)
          return max
        return !max || value > max ? value : max
      },
      null,
    ) ?? new Date().toISOString()

    const listingPages: SitemapRoute[] = [
      { loc: '/', priority: 1.0, changefreq: 'daily', lastmod: newestProductLastmod },
      { loc: '/catalog', priority: 0.9, changefreq: 'daily', lastmod: newestProductLastmod },
      { loc: '/catalog/new', priority: 0.7, changefreq: 'daily', lastmod: newestProductLastmod },
      { loc: '/catalog/promotions', priority: 0.7, changefreq: 'daily', lastmod: newestProductLastmod },
    ]

    const legalPages: SitemapRoute[] = Object.entries(STATIC_PAGE_LASTMOD).map(
      ([loc, lastmod]) => ({
        loc,
        lastmod,
        changefreq: 'yearly',
        priority: 0.3,
      }),
    )

    sitemapRoutes.push(...listingPages, ...legalPages)

    // --- КАТЕГОРИИ ---
    const { data: categories, error: categoriesError } = await client
      .from('categories')
      .select('slug, href, updated_at')
      .not('slug', 'is', null)
      .limit(1000)

    if (categoriesError) {
      console.error('❌ Ошибка загрузки категорий для sitemap:', categoriesError)
    }

    console.log(`✅ Sitemap: Загружено ${categories?.length || 0} категорий`)

    if (categories && categories.length > 0) {
      categories.forEach((category) => {
        sitemapRoutes.push({
          loc: category.href || `/catalog/${category.slug}`,
          lastmod: category.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.75,
        })
      })
    }
    else {
      console.warn('⚠️ Категории не найдены в базе данных')
    }

    // --- БРЕНДЫ (БЕЗ query параметров) ---
    const { data: brands, error: brandsError } = await client
      .from('brands')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .limit(1000) // ✅ Явно указываем лимит

    if (brandsError) {
      console.error('❌ Ошибка загрузки брендов для sitemap:', brandsError)
    }

    // ✅ Логирование количества брендов
    console.log(`✅ Sitemap: Загружено ${brands?.length || 0} брендов`)

    if (brands && brands.length > 0) {
      brands.forEach((brand) => {
        sitemapRoutes.push({
          loc: `/brand/${brand.slug}`,
          lastmod: brand.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.75,
        })
      })
    }
    else {
      console.warn('⚠️ Бренды не найдены в базе данных')
    }

    // --- ТОВАРНЫЕ ЛИНЕЙКИ ---
    const { data: productLines, error: productLinesError } = await client
      .from('product_lines')
      .select('slug, updated_at, brand_id, brands!inner(slug)')
      .not('slug', 'is', null)
      .limit(1000)

    if (productLinesError) {
      console.error('❌ Ошибка загрузки товарных линеек для sitemap:', productLinesError)
    }

    console.log(`✅ Sitemap: Загружено ${productLines?.length || 0} товарных линеек`)

    if (productLines && productLines.length > 0) {
      productLines.forEach((line: any) => {
        const brandSlug = line.brands?.slug
        if (brandSlug) {
          sitemapRoutes.push({
            loc: `/brand/${brandSlug}/${line.slug}`,
            lastmod: line.updated_at ?? new Date().toISOString(),
            changefreq: 'weekly',
            priority: 0.7,
          })
        }
      })
    }

    // --- BRAND LANDING PAGES (?brand=slug) ---
    // ⚠️ Включаем в sitemap ТОЛЬКО те пары категория+бренд, для которых реально
    // существует уникальный SEO-контент (category_brand_seo) — именно от него
    // зависит index/noindex в pages/catalog/[...slug].vue (см. robotsRule).
    // Раньше здесь брались все комбинации из products, из-за чего в sitemap
    // попадали noindex-страницы (без уникального SEO-текста) — расхождение
    // sitemap/индексации, найденное в SEO-аудите.
    const { data: brandLandings, error: brandLandingsError } = await client
      .from('category_brand_seo')
      .select('updated_at, categories!inner(slug, href, parent_id), brands!inner(slug)')
      .not('categories.slug', 'is', null)
      .not('brands.slug', 'is', null)
      .limit(10000)

    if (brandLandingsError) {
      console.error('❌ Ошибка загрузки brand landing для sitemap:', brandLandingsError)
    }

    if (brandLandings && brandLandings.length > 0) {
      // Дедупликация — уникальные пары (categoryHref, brandSlug)
      const seen = new Set<string>()
      brandLandings.forEach((item: any) => {
        const category = item.categories
        const brand = item.brands
        if (!category || !brand)
          return
        // Brand landing только для категорий второго уровня (имеющих родителя)
        if (!category.parent_id)
          return
        const categoryPath = category.href || `/catalog/${category.slug}`
        const key = `${categoryPath}|${brand.slug}`
        if (seen.has(key))
          return
        seen.add(key)
        sitemapRoutes.push({
          loc: `${categoryPath}?brand=${brand.slug}`,
          lastmod: item.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.65,
        })
      })
      console.log(`✅ Sitemap: Загружено ${seen.size} brand landing страниц`)
    }

    // ✅ Итоговое логирование
    console.log(`✅ Sitemap: Всего сгенерировано ${sitemapRoutes.length} URLs`)

    return sitemapRoutes
  }
  catch (error) {
    console.error('Критическая ошибка при генерации sitemap:', error)
    return sitemapRoutes
  }
})

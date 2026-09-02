import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'
import {
  BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS,
  MIN_PRODUCTS_FOR_BRAND_LANDING,
} from '@/constants'
import {
  brandLandingPairKey,
  buildBrandLandingPath,
  countProductsByCategoryBrand,
  isBrandLandingIndexable,
} from '~/utils/brandLanding'

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
      // `is_new` нужен не карточкам, а листингу `/catalog/new` — см. ниже,
      // где он решает, попадёт ли страница в карту вообще. `brand_id` — там же
      // ниже, чтобы отсеять бренды без товара, закрытые `noindex`.
      // `category_id` — для подсчёта товаров у пар категория+бренд, от него
      // зависит, попадёт ли в карту бренд-лендинг (см. ниже).
      .select('slug, updated_at, is_new, brand_id, category_id, product_images(image_url, display_order)')
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

    /*
     * `/catalog/new` попадает в карту, ТОЛЬКО если новинки существуют.
     *
     * На 20 августа 2026 в базе не было ни одного товара с `is_new`, страница
     * показывала «Пока нет новинок», а в карте сайта при этом лежала.
     * Search Console отвечала по ней ровно тем, чего и следовало ждать:
     * «Crawled — currently not indexed», последний обход 10 апреля.
     *
     * Пустой адрес в карте — это не безобидная строка: карта заявляет
     * «страница стоит обхода», робот приходит и ничего не находит, и доверие
     * к остальным 309 адресам от этого не растёт. Как только товар пометят
     * новинкой, страница вернётся в карту сама.
     */
    const hasNewProducts = (products ?? []).some((p: any) => p.is_new === true)

    const listingPages: SitemapRoute[] = [
      { loc: '/', priority: 1.0, changefreq: 'daily', lastmod: newestProductLastmod },
      { loc: '/catalog', priority: 0.9, changefreq: 'daily', lastmod: newestProductLastmod },
      ...(hasNewProducts
        ? [{ loc: '/catalog/new', priority: 0.7, changefreq: 'daily' as const, lastmod: newestProductLastmod }]
        : []),
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
      // `id` и `parent_id` — для того же подсчёта пар: товар засчитывается
      // категории и всем её родителям, как это делает get_filtered_products.
      .select('id, slug, href, parent_id, updated_at')
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
      .select('id, slug, updated_at')
      .not('slug', 'is', null)
      .limit(1000) // ✅ Явно указываем лимит

    if (brandsError) {
      console.error('❌ Ошибка загрузки брендов для sitemap:', brandsError)
    }

    // ✅ Логирование количества брендов
    console.log(`✅ Sitemap: Загружено ${brands?.length || 0} брендов`)

    if (brands && brands.length > 0) {
      /*
       * Карта обязана согласовываться с мета-тегом страницы: закрытый
       * `noindex` адрес в карте — это прямое противоречие, робот тратит обход
       * и получает запрет.
       *
       * Условие повторяет pages/brand/[slug].vue: закрыт бренд без единого
       * активного товара, кроме перечисленных в
       * BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS. Держать два места в согласии
       * помогает общая константа — она одна и та же для страницы и для карты.
       *
       * До 20 августа 2026 расхождение было: все десять пустых брендов лежали
       * в карте, а код на странице считал их закрытыми (и не закрывал, но это
       * отдельная история — см. комментарий к правилу на самой странице).
       */
      const brandIdsWithProducts = new Set(
        (products ?? [])
          .map((p: any) => p.brand_id)
          .filter((id: string | null): id is string => !!id),
      )

      const indexableBrands = brands.filter(
        brand =>
          brandIdsWithProducts.has(brand.id)
          || BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS.includes(brand.slug!),
      )

      const skipped = brands.length - indexableBrands.length
      if (skipped > 0) {
        console.warn(
          `⚠️ Sitemap: ${skipped} брендов без товаров закрыты noindex и в карту не попали`,
        )
      }

      indexableBrands.forEach((brand) => {
        sitemapRoutes.push({
          loc: `/brand/${brand.slug}`,
          lastmod: brand.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.75,
        })
      })

      /*
       * Страница-хаб со списком всех брендов.
       *
       * Именно через неё робот попадает на страницы брендов: других ссылок
       * на них в разметке почти нет. Пока /brands был исключён из sitemap
       * (см. nuxt.config.ts), Google заходил туда раз в два с половиной
       * месяца, и раздаваемые ею ссылки терялись.
       *
       * Дата — время правки самого свежего бренда: список меняется вместе
       * с ними.
       */
      const newestBrandLastmod = brands.reduce<string | null>(
        (max, b) => {
          const value = b.updated_at
          if (!value)
            return max
          return !max || value > max ? value : max
        },
        null,
      ) ?? new Date().toISOString()

      sitemapRoutes.push({
        loc: '/brands',
        lastmod: newestBrandLastmod,
        changefreq: 'weekly',
        priority: 0.6,
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

    // --- BRAND LANDING PAGES (/catalog/<категория>/brand/<бренд>) ---
    // ⚠️ Включаем в sitemap ТОЛЬКО те пары категория+бренд, для которых реально
    // существует уникальный SEO-контент (category_brand_seo) — именно от него
    // зависит index/noindex в pages/catalog/[...slug].vue (см. robotsRule).
    // Раньше здесь брались все комбинации из products, из-за чего в sitemap
    // попадали noindex-страницы (без уникального SEO-текста) — расхождение
    // sitemap/индексации, найденное в SEO-аудите.
    const { data: brandLandings, error: brandLandingsError } = await client
      .from('category_brand_seo')
      .select('updated_at, categories!inner(id, slug, href, parent_id), brands!inner(id, slug)')
      .not('categories.slug', 'is', null)
      .not('brands.slug', 'is', null)
      .limit(10000)

    if (brandLandingsError) {
      console.error('❌ Ошибка загрузки brand landing для sitemap:', brandLandingsError)
    }

    /*
     * Товаров у каждой пары категория+бренд — считаем рекурсивно, как это
     * делает сама страница (см. countProductsByCategoryBrand).
     *
     * Считать можно, только если обе выборки удались. Если хоть одна упала,
     * таблица останется пустой, и любая пара покажет ноль товаров — карта
     * потеряла бы все бренд-лендинги из-за разовой ошибки базы. Поэтому в
     * таком случае число товаров объявляется неизвестным (`null`), и
     * `isBrandLandingIndexable` пропускает адрес: тот же fail-open, что
     * применён к брендам выше.
     */
    const canCountBrandLandingProducts = !!products && !!categories
    const brandLandingProductCounts = canCountBrandLandingProducts
      ? countProductsByCategoryBrand(products as any[], categories as any[])
      : new Map<string, number>()

    if (brandLandings && brandLandings.length > 0) {
      // Дедупликация — уникальные пары (categoryHref, brandSlug)
      const seen = new Set<string>()
      let thin = 0
      brandLandings.forEach((item: any) => {
        const category = item.categories
        const brand = item.brands
        if (!category || !brand)
          return
        // Brand landing только для категорий второго уровня (имеющих родителя)
        if (!category.parent_id)
          return

        /*
         * Пустой лендинг в карту не идёт.
         *
         * Наличие строки в `category_brand_seo` говорит лишь о том, что текст
         * когда-то написали; товары с тех пор могли разойтись. На 2 сентября
         * 2026 три страницы из четырнадцати содержали ноль товаров и всё
         * равно лежали в карте под `index, follow`. Условие обязано совпадать
         * с `robotsRule` на странице — обе стороны зовут одну функцию.
         */
        const productsCount = canCountBrandLandingProducts
          ? brandLandingProductCounts.get(
            brandLandingPairKey(category.id, brand.id),
          ) ?? 0
          : null
        if (!isBrandLandingIndexable(productsCount)) {
          thin += 1
          return
        }

        const categoryPath = category.href || `/catalog/${category.slug}`
        const key = `${categoryPath}|${brand.slug}`
        if (seen.has(key))
          return
        seen.add(key)
        sitemapRoutes.push({
          loc: buildBrandLandingPath(categoryPath, brand.slug),
          lastmod: item.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.65,
        })
      })
      if (thin > 0) {
        console.warn(
          `⚠️ Sitemap: ${thin} бренд-лендингов с числом товаров меньше ${MIN_PRODUCTS_FOR_BRAND_LANDING} закрыты noindex и в карту не попали`,
        )
      }
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

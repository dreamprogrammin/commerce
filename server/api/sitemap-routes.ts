import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'
import { BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS } from '@/constants'
import {
  brandLandingPairKey,
  buildBrandLandingPath,
  countProductsByCategoryBrand,
  decideBrandLanding,
} from '~/utils/brandLanding'
import {
  countProductsByCategory,
  isCategoryIndexable,
} from '~/utils/categoryLanding'

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
      // `product_line_id` — тем же манером отсеивает пустые линейки: страница
      // закрывает их `noindex`, а карта до 11 сентября 2026 подавала их роботу.
      .select('slug, updated_at, is_new, brand_id, category_id, product_line_id, product_images(image_url, display_order)')
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
      // `name` и `seo_h1` — decideBrandLanding узнаёт по ним раздел, уже
      // названный брендом («Куклы L.O.L»).
      .select('id, slug, href, parent_id, updated_at, name, seo_h1')
      .not('slug', 'is', null)
      .limit(1000)

    if (categoriesError) {
      console.error('❌ Ошибка загрузки категорий для sitemap:', categoriesError)
    }

    console.log(`✅ Sitemap: Загружено ${categories?.length || 0} категорий`)

    /*
     * Пустые категории в карту не идут — то же правило, что у бренд-лендингов
     * выше, и та же функция, что у `robotsRule` на странице. Иначе в карте
     * снова окажутся адреса, закрытые `noindex`.
     *
     * Замер 16 сентября 2026: 13 категорий из 64 без единого активного товара
     * в ветке, и все тринадцать лежали в карте. За 90 дней — 347 показов и
     * ноль кликов.
     *
     * Fail-open, как у брендов: если выборка товаров не удалась, число
     * объявляется неизвестным, и карта отдаёт все категории. Разовая ошибка
     * базы не должна выкашивать полкарты.
     */
    const canCountCategoryProducts = !!products && !!categories
    const categoryProductCounts = canCountCategoryProducts
      ? countProductsByCategory(products as any[], categories as any[])
      : new Map<string, number>()

    if (categories && categories.length > 0) {
      let empty = 0
      categories.forEach((category) => {
        const productsCount = canCountCategoryProducts
          ? (categoryProductCounts.get(category.id) ?? 0)
          : null

        if (canCountCategoryProducts && !isCategoryIndexable(category.slug, productsCount)) {
          empty++
          return
        }

        sitemapRoutes.push({
          loc: category.href || `/catalog/${category.slug}`,
          lastmod: category.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.75,
        })
      })
      // `warn`, а не `log`: линтер в проекте пропускает только warn и error,
      // а строка нужна — по ней видно, почему карта вдруг короче.
      if (empty > 0)
        console.warn(`✅ Sitemap: пропущено пустых категорий: ${empty}`)
    }
    else {
      console.warn('⚠️ Категории не найдены в базе данных')
    }

    // --- БРЕНДЫ (БЕЗ query параметров) ---
    const { data: brands, error: brandsError } = await client
      .from('brands')
      .select('id, slug, updated_at, name')
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
      .select('id, slug, updated_at, brand_id, brands!inner(slug)')
      .not('slug', 'is', null)
      .limit(1000)

    if (productLinesError) {
      console.error('❌ Ошибка загрузки товарных линеек для sitemap:', productLinesError)
    }

    console.log(`✅ Sitemap: Загружено ${productLines?.length || 0} товарных линеек`)

    if (productLines && productLines.length > 0) {
      /*
       * Пустая линейка в карту не идёт.
       *
       * Страница линейки закрывает себя `noindex`, когда товаров нет
       * (pages/brand/[brandSlug]/[lineSlug].vue), а карта подавала роботу все
       * линейки подряд. Что из этого вышло, видно в инспекции 11 сентября
       * 2026: `/brand/lego/lego-technic` — Soft 404, `/brand/lego/ninjago` —
       * «исключено тегом noindex», `/brand/lego/lego-friends` — «обойдено, не
       * проиндексировано». Три адреса из восьми у одного бренда, и все три
       * лежали в карте. Ровно та же рассогласованность, что чинили у брендов
       * 20 августа.
       */
      const lineIdsWithProducts = new Set(
        (products ?? [])
          .map((p: any) => p.product_line_id)
          .filter((id: string | null): id is string => !!id),
      )

      const indexableLines = productLines.filter(
        (line: any) => lineIdsWithProducts.has(line.id),
      )

      const skippedLines = productLines.length - indexableLines.length
      if (skippedLines > 0) {
        console.warn(
          `⚠️ Sitemap: ${skippedLines} линеек без товаров закрыты noindex и в карту не попали`,
        )
      }

      indexableLines.forEach((line: any) => {
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
    /*
     * Какие связки «раздел + бренд» идут в карту — решает decideBrandLanding
     * (utils/brandLanding.ts), та же функция, что ставит index/noindex на
     * самой странице. Разойтись они не могут: иначе в карте окажутся
     * закрытые адреса.
     *
     * До 21 сентября 2026 в карту шли только пары со строкой в
     * category_brand_seo — написанным руками текстом, таких 14 на 63 пары с
     * товарами. Теперь текст связки собирается из её товаров
     * (utils/brandLandingText.ts), и открыть можно любую пару, где набор
     * товаров свой: не меньше трёх и не дубль более точного подраздела.
     *
     * Если товары или разделы не загрузились, считать не из чего — тогда
     * берём прежний путь через category_brand_seo без проверки числа: разовый
     * сбой базы не должен выкидывать связки из карты (fail-open, как у
     * брендов выше).
     */
    const canDecideBrandLandings = !!products && !!categories && !!brands
    const brandLandingSeen = new Set<string>()

    if (canDecideBrandLandings) {
      const counts = countProductsByCategoryBrand(products as any[], categories as any[])
      const categoryById = new Map((categories as any[]).map(c => [c.id, c]))
      const brandById = new Map((brands as any[]).map(b => [b.id, b]))

      // Самая свежая правка товара в паре — повод роботу вернуться.
      const newestInPair = new Map<string, string>()
      for (const product of products as any[]) {
        if (!product.brand_id || !product.category_id || !product.updated_at)
          continue
        let cid: string | null = product.category_id
        const guard = new Set<string>()
        while (cid && !guard.has(cid)) {
          guard.add(cid)
          const key = brandLandingPairKey(cid, product.brand_id)
          if ((newestInPair.get(key) ?? '') < product.updated_at)
            newestInPair.set(key, product.updated_at)
          cid = categoryById.get(cid)?.parent_id ?? null
        }
      }

      let closed = 0
      for (const key of counts.keys()) {
        const [categoryId, brandId] = key.split('|')
        const verdict = decideBrandLanding(categoryId, brandId, counts, categories as any[], brandById.get(brandId)?.name)
        if (!verdict.indexable) {
          closed += 1
          continue
        }
        const category = categoryById.get(categoryId)
        const brand = brandById.get(brandId)
        if (!category || !brand?.slug)
          continue
        const categoryPath = category.href || `/catalog/${category.slug}`
        const loc = buildBrandLandingPath(categoryPath, brand.slug)
        if (brandLandingSeen.has(loc))
          continue
        brandLandingSeen.add(loc)
        sitemapRoutes.push({
          loc,
          lastmod: newestInPair.get(key) ?? category.updated_at ?? new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.65,
        })
      }
      console.log(`✅ Sitemap: связок «раздел + бренд» открыто ${brandLandingSeen.size}, закрыто ${closed} (мало товаров, корневой раздел, дубль подраздела или раздел назван брендом)`)
    }
    else {
      console.warn('⚠️ Sitemap: товары, разделы или бренды не загрузились — связки берутся из category_brand_seo без проверки числа товаров')
      const { data: brandLandings } = await client
        .from('category_brand_seo')
        .select('updated_at, categories!inner(id, slug, href, parent_id), brands!inner(id, slug)')
        .limit(10000)
      for (const item of (brandLandings ?? []) as any[]) {
        const category = item.categories
        const brand = item.brands
        if (!category?.parent_id || !brand?.slug)
          continue
        const loc = buildBrandLandingPath(category.href || `/catalog/${category.slug}`, brand.slug)
        if (brandLandingSeen.has(loc))
          continue
        brandLandingSeen.add(loc)
        sitemapRoutes.push({ loc, lastmod: item.updated_at ?? new Date().toISOString(), changefreq: 'weekly', priority: 0.65 })
      }
    }

    /*
     * --- АКЦИИ (/promo/<слаг>) ---
     *
     * Ветки для них в карте не было вовсе: заведи владелец акцию — робот
     * узнал бы о ней только случайно, по ссылке с витрины. Сейчас активных
     * кампаний ноль, поэтому карта не меняется ни на строку, но как только
     * первая появится, она попадёт в карту сама.
     *
     * В карту идут только НЕПУСТЫЕ акции — то же правило, что у категорий и
     * брендов, и то же, что теперь стоит на самой странице
     * (`pages/promo/[slug].vue`): кампания без единого активного товара
     * закрыта `noindex`, и класть её в карту значило бы гонять робота на
     * запрет.
     *
     * Даты правки у кампаний нет — в таблице только `created_at`, его и
     * берём.
     */
    const { data: campaigns, error: campaignsError } = await client
      .from('promo_campaigns')
      .select('id, slug, created_at')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .limit(500)

    if (campaignsError)
      console.error('❌ Ошибка загрузки акций для sitemap:', campaignsError)

    if (campaigns && campaigns.length > 0) {
      /*
       * Товары кампании считаем по связке, отсеивая снятые с продажи:
       * `products!inner` с фильтром по `is_active` — то же, что делает сама
       * страница акции.
       */
      const { data: campaignProducts, error: campaignProductsError } = await client
        .from('promo_campaign_products')
        .select('campaign_id, products!inner(id)')
        .eq('products.is_active', true)
        .limit(5000)

      if (campaignProductsError)
        console.error('❌ Ошибка загрузки товаров акций для sitemap:', campaignProductsError)

      /*
       * Fail-open, как у категорий и брендов: если выборка товаров не
       * удалась, число объявляется неизвестным и в карту идут все активные
       * акции. Разовая ошибка базы не должна выкашивать раздел целиком.
       */
      const canCountCampaignProducts = !!campaignProducts
      const campaignsWithProducts = new Set(
        (campaignProducts ?? []).map((row: any) => row.campaign_id as string),
      )

      let emptyCampaigns = 0
      campaigns.forEach((campaign) => {
        if (canCountCampaignProducts && !campaignsWithProducts.has(campaign.id)) {
          emptyCampaigns++
          return
        }

        sitemapRoutes.push({
          loc: `/promo/${campaign.slug}`,
          lastmod: campaign.created_at ?? new Date().toISOString(),
          changefreq: 'daily',
          priority: 0.7,
        })
      })

      // Без строки об успехе: линтер пропускает только `warn` и `error`,
      // а предупреждение ниже — то, ради чего в журнал вообще смотрят.
      if (emptyCampaigns > 0)
        console.warn(`⚠️ Sitemap: ${emptyCampaigns} акций без активных товаров закрыты noindex и в карту не попали`)
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

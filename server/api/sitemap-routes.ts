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

export default defineEventHandler(async (event): Promise<SitemapRoute[]> => {
  const client = await serverSupabaseClient<Database>(event)
  const sitemapRoutes: SitemapRoute[] = []

  try {
    // --- СТАТИЧЕСКИЕ СТРАНИЦЫ ---
    const staticPages = [
      { loc: '/', priority: 1.0, changefreq: 'daily' as const, lastmod: new Date().toISOString() },
      { loc: '/catalog', priority: 0.9, changefreq: 'daily' as const, lastmod: new Date().toISOString() },
      { loc: '/brand/all', priority: 0.7, changefreq: 'weekly' as const, lastmod: new Date().toISOString() },
    ]

    staticPages.forEach((page) => {
      sitemapRoutes.push(page)
    })

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

    // ✅ Итоговое логирование
    console.log(`✅ Sitemap: Всего сгенерировано ${sitemapRoutes.length} URLs`)

    return sitemapRoutes
  }
  catch (error) {
    console.error('Критическая ошибка при генерации sitemap:', error)
    return sitemapRoutes
  }
})

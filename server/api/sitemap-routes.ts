import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'

interface SitemapRoute {
  loc: string
  lastmod: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
}

export default defineEventHandler(async (event): Promise<SitemapRoute[]> => {
  const client = await serverSupabaseClient<Database>(event)
  const sitemapRoutes: SitemapRoute[] = []

  try {
    // --- СТАТИЧЕСКИЕ СТРАНИЦЫ ---
    const staticPages = [
      { loc: '/', priority: 1.0, changefreq: 'daily' as const, lastmod: '2025-02-11' },
      { loc: '/catalog', priority: 0.9, changefreq: 'daily' as const, lastmod: '2025-02-11' },
      { loc: '/brand/all', priority: 0.7, changefreq: 'weekly' as const, lastmod: '2025-02-11' },
    ]

    staticPages.forEach((page) => {
      sitemapRoutes.push(page)
    })

    // --- ТОВАРЫ ---
    const { data: products, error: productsError } = await client
      .from('products')
      .select('slug, updated_at')
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
      products.forEach((product) => {
        sitemapRoutes.push({
          loc: `/catalog/products/${product.slug}`,
          lastmod: product.updated_at ?? new Date().toISOString(),
          changefreq: 'daily',
          priority: 0.8,
        })
      })
    }
    else {
      console.warn('⚠️ Товары не найдены в базе данных')
    }

    // --- КАТЕГОРИИ ---
    const { data: categories, error: categoriesError } = await client
      .from('categories')
      .select('slug, updated_at')
      .not('slug', 'is', null)
      .limit(1000) // ✅ Явно указываем лимит

    if (categoriesError) {
      console.error('❌ Ошибка загрузки категорий для sitemap:', categoriesError)
    }

    // ✅ Логирование количества категорий
    console.log(`✅ Sitemap: Загружено ${categories?.length || 0} категорий`)

    if (categories && categories.length > 0) {
      categories.forEach((category) => {
        sitemapRoutes.push({
          loc: `/catalog/${category.slug}`,
          lastmod: category.updated_at ?? new Date().toISOString(), // ✅ Используем реальную дату обновления
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
          changefreq: 'monthly',
          priority: 0.6,
        })
      })
    }
    else {
      console.warn('⚠️ Бренды не найдены в базе данных')
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

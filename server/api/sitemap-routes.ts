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
      { loc: '/', priority: 1.0, changefreq: 'daily' as const },
      { loc: '/catalog', priority: 0.9, changefreq: 'daily' as const },
      { loc: '/brand/all', priority: 0.7, changefreq: 'weekly' as const },
    ]

    staticPages.forEach((page) => {
      sitemapRoutes.push({
        ...page,
        lastmod: new Date().toISOString(),
      })
    })

    // --- ТОВАРЫ ---
    const { data: products, error: productsError } = await client
      .from('products')
      .select('slug, updated_at')
      .eq('is_active', true)
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })

    if (productsError) {
      console.error('Ошибка загрузки товаров для sitemap:', productsError)
    }

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

    // --- КАТЕГОРИИ ---
    const { data: categories, error: categoriesError } = await client
      .from('categories')
      .select('slug')
      .not('slug', 'is', null)

    if (categoriesError) {
      console.error('Ошибка загрузки категорий для sitemap:', categoriesError)
    }

    if (categories && categories.length > 0) {
      categories.forEach((category) => {
        sitemapRoutes.push({
          loc: `/catalog/${category.slug}`,
          lastmod: new Date().toISOString(),
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

    if (brandsError) {
      console.error('Ошибка загрузки брендов для sitemap:', brandsError)
    }

    if (brands && brands.length > 0) {
      brands.forEach((brand) => {
        sitemapRoutes.push({
          // ИСПРАВЛЕНО: Используем чистый URL без query
          loc: `/brand/${brand.slug}`,
          lastmod: brand.updated_at ?? new Date().toISOString(),
          changefreq: 'monthly',
          priority: 0.6,
        })
      })
    }

    return sitemapRoutes
  }
  catch (error) {
    console.error('Критическая ошибка при генерации sitemap:', error)
    return sitemapRoutes
  }
})

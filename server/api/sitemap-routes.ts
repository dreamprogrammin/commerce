import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'

interface SitemapRoute {
  loc: string
  lastmod: string
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority: number
}

export default defineEventHandler(async (event): Promise<SitemapRoute[]> => {
  // 1. Инициализируем клиент Supabase на сервере с типизацией
  const client = await serverSupabaseClient<Database>(event)

  // Сюда будем складывать все найденные ссылки
  const sitemapRoutes: SitemapRoute[] = []

  // --- ШАГ 1: ПОЛУЧАЕМ ТОВАРЫ ---
  const { data: products, error: productsError } = await client
    .from('products')
    .select('slug, updated_at')
    .eq('is_active', true) // Только активные товары
    .not('slug', 'is', null)

  if (productsError) {
    console.error('Ошибка загрузки товаров для sitemap:', productsError)
  }

  if (products) {
    products.forEach((product) => {
      sitemapRoutes.push({
        loc: `/catalog/products/${product.slug}`,
        lastmod: product.updated_at ?? new Date().toISOString(),
        changefreq: 'daily',
        priority: 0.8,
      })
    })
  }

  // --- ШАГ 2: ПОЛУЧАЕМ КАТЕГОРИИ ---
  const { data: categories, error: categoriesError } = await client
    .from('categories')
    .select('slug, updated_at')
    .eq('is_active', true) // Только активные категории
    .not('slug', 'is', null)

  if (categoriesError) {
    console.error('Ошибка загрузки категорий для sitemap:', categoriesError)
  }

  if (categories) {
    categories.forEach((category) => {
      sitemapRoutes.push({
        loc: `/catalog/${category.slug}`,
        lastmod: category.updated_at ?? new Date().toISOString(),
        changefreq: 'weekly',
        priority: 0.7,
      })
    })
  }

  // --- ШАГ 3: ПОЛУЧАЕМ БРЕНДЫ ---
  const { data: brands, error: brandsError } = await client
    .from('brands')
    .select('slug, updated_at')
    .not('slug', 'is', null)

  if (brandsError) {
    console.error('Ошибка загрузки брендов для sitemap:', brandsError)
  }

  if (brands) {
    brands.forEach((brand) => {
      sitemapRoutes.push({
        loc: `/brand/all?brand=${brand.slug}`,
        lastmod: brand.updated_at ?? new Date().toISOString(),
        changefreq: 'monthly',
        priority: 0.6,
      })
    })
  }

  return sitemapRoutes
})

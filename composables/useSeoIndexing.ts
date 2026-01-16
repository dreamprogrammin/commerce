/**
 * Composable для автоматического уведомления поисковиков об изменениях
 */

interface IndexingResult {
  success: boolean
  indexnow: { submitted: boolean, error?: string, urls_count: number }
  google: { pinged: boolean, error?: string }
  processed_urls?: string[]
}

// ✅ Добавляем интерфейс для результата переиндексации
interface ReindexResult {
  success: boolean
  total: number
  submitted: number
  batches: number
  successfulBatches: number
  failedBatches: number
}

export const useSeoIndexing = () => {
  const config = useRuntimeConfig()
  const baseUrl = config.public.siteUrl || 'https://uhti.kz'

  /**
   * Уведомить поисковики о новых/обновлённых URL
   */
  const notifySearchEngines = async (
    urls: string | string[],
    options?: { silent?: boolean }
  ): Promise<IndexingResult | null> => {
    const urlArray = Array.isArray(urls) ? urls : [urls]
    
    // Конвертируем относительные пути в абсолютные
    const absoluteUrls = urlArray.map(url => 
      url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`
    )

    try {
      const result = await $fetch<IndexingResult>('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls: absoluteUrls }
      })

      if (!options?.silent) {
        if (result.success) {
          const services = []
          if (result.indexnow.submitted) services.push('IndexNow')
          if (result.google.pinged) services.push('Google')
          console.log(`✅ SEO: ${result.indexnow.urls_count} URL отправлено (${services.join(', ')})`)
        } else {
          console.warn(`⚠️ SEO: Ошибка индексации - IndexNow: ${result.indexnow.error}, Google: ${result.google.error}`)
        }
      }

      return result
    } catch (error) {
      if (!options?.silent) {
        console.error('❌ SEO: Ошибка уведомления поисковиков:', error)
      }
      return null
    }
  }

  /**
   * Уведомить о товаре (создание/обновление)
   */
  const notifyProduct = async (productSlug: string) => {
    return notifySearchEngines(`/catalog/products/${productSlug}`)
  }

  /**
   * Уведомить о нескольких товарах
   */
  const notifyProducts = async (productSlugs: string[]) => {
    const urls = productSlugs.map(slug => `/catalog/products/${slug}`)
    return notifySearchEngines(urls)
  }

  /**
   * Уведомить о бренде
   */
  const notifyBrand = async (brandSlug: string) => {
    return notifySearchEngines(`/brand/${brandSlug}`)
  }

  /**
   * Уведомить о категории
   */
  const notifyCategory = async (categorySlug: string) => {
    return notifySearchEngines(`/catalog?category=${categorySlug}`)
  }

  /**
   * Массовая переиндексация всех товаров (только для админов)
   */
  const reindexAllProducts = async () => {
    try {
      // ✅ Типизируем результат
      const result = await $fetch<ReindexResult>('/api/seo/reindex-all', {
        method: 'POST'
      })
      console.log(`✅ Переиндексация завершена: ${result.total} товаров`)
      return result
    } catch (error) {
      console.error('❌ Ошибка массовой переиндексации:', error)
      throw error
    }
  }

  return {
    notifySearchEngines,
    notifyProduct,
    notifyProducts,
    notifyBrand,
    notifyCategory,
    reindexAllProducts,
  }
}
/**
 * API для автоматического уведомления поисковиков о новых/обновлённых страницах
 *
 * Поддерживает:
 * - Google Sitemap Ping (уведомление об обновлении sitemap)
 * - IndexNow (мгновенная индексация для Yandex, Bing, Seznam, Naver)
 *
 * ВАЖНО: Google Indexing API НЕ работает для обычных страниц (только JobPosting/BroadcastEvent)
 * Поэтому используем ping sitemap - это официальный способ от Google
 */

interface NotifyRequest {
  urls: string[] // Список URL для индексации
  type?: 'created' | 'updated' | 'deleted' // Тип события
}

interface NotifyResult {
  success: boolean
  google: { pinged: boolean, error?: string }
  indexnow: { submitted: boolean, error?: string, urls_count: number }
}

export default defineEventHandler(async (event): Promise<NotifyResult> => {
  const config = useRuntimeConfig()
  const body = await readBody<NotifyRequest>(event)

  if (!body.urls || body.urls.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'urls array is required',
    })
  }

  // Фильтруем только валидные URL нашего сайта
  const siteUrl = 'https://uhti.kz'
  const validUrls = body.urls.filter(url =>
    url.startsWith(siteUrl) || url.startsWith('/'),
  ).map(url =>
    url.startsWith('/') ? `${siteUrl}${url}` : url,
  )

  if (validUrls.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'No valid URLs provided (must start with https://uhti.kz or /)',
    })
  }

  const result: NotifyResult = {
    success: false,
    google: { pinged: false },
    indexnow: { submitted: false, urls_count: 0 },
  }

  // 1. Ping Google Sitemap
  try {
    const sitemapUrl = `${siteUrl}/sitemap.xml`
    const googlePingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`

    const googleResponse = await fetch(googlePingUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Uhti-SEO-Bot/1.0' },
    })

    result.google.pinged = googleResponse.ok
    if (!googleResponse.ok) {
      result.google.error = `HTTP ${googleResponse.status}`
    }

    // Логируем результат (warn разрешён eslint)
  }
  catch (error: any) {
    result.google.error = error.message
    console.error('[SEO] Google ping error:', error.message)
  }

  // 2. IndexNow для Yandex/Bing/других
  const indexNowKey = config.indexnowKey

  if (indexNowKey) {
    try {
      // IndexNow принимает до 10000 URL за раз
      const urlsToSubmit = validUrls.slice(0, 10000)

      const indexNowResponse = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          host: 'uhti.kz',
          key: indexNowKey,
          keyLocation: `${siteUrl}/${indexNowKey}.txt`,
          urlList: urlsToSubmit,
        }),
      })

      // IndexNow возвращает 200, 202 или 400/403/422
      result.indexnow.submitted = indexNowResponse.ok || indexNowResponse.status === 202
      result.indexnow.urls_count = urlsToSubmit.length

      if (!result.indexnow.submitted) {
        const errorText = await indexNowResponse.text()
        result.indexnow.error = `HTTP ${indexNowResponse.status}: ${errorText}`
      }

      // Успешно отправлено в IndexNow
    }
    catch (error: any) {
      result.indexnow.error = error.message
      console.error('[SEO] IndexNow error:', error.message)
    }
  }
  else {
    result.indexnow.error = 'INDEXNOW_KEY not configured'
    console.warn('[SEO] IndexNow key not found, skipping')
  }

  result.success = result.google.pinged || result.indexnow.submitted

  return result
})

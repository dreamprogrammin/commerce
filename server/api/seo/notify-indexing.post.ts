/**
 * API для автоматического уведомления поисковиков о новых/обновлённых страницах
 *
 * Поддерживает:
 * - IndexNow (мгновенная индексация для Yandex, Bing, Seznam, Naver)
 * - Google Sitemap Ping (уведомление Google о обновлении sitemap)
 *
 * ПРИМЕЧАНИЕ:
 * - Google Sitemap Ping официально deprecated, но продолжает работать
 * - Для гарантированной индексации Google используйте Search Console
 */

interface NotifyRequest {
  urls: string[] // Список URL для индексации
  type?: 'created' | 'updated' | 'deleted' // Тип события
}

interface NotifyResult {
  success: boolean
  indexnow: { submitted: boolean, error?: string, urls_count: number }
  google: { pinged: boolean, error?: string }
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
    indexnow: { submitted: false, urls_count: 0 },
    google: { pinged: false },
  }

  // 1️⃣ Google Sitemap Ping
  // Уведомляем Google об обновлении sitemap (deprecated но работает)
  try {
    const sitemapUrl = encodeURIComponent(`${siteUrl}/sitemap.xml`)
    const googlePingUrl = `https://www.google.com/ping?sitemap=${sitemapUrl}`

    const googleResponse = await fetch(googlePingUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Uhti-SEO-Bot/1.0',
      },
    })

    result.google.pinged = googleResponse.ok
    if (!googleResponse.ok) {
      result.google.error = `HTTP ${googleResponse.status}`
    }
  }
  catch (error: any) {
    result.google.error = error.message
    console.error('[SEO] Google ping error:', error.message)
  }

  // 2️⃣ IndexNow для Yandex/Bing/Seznam/Naver
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

  // Успех если хотя бы один из сервисов сработал
  result.success = result.indexnow.submitted || result.google.pinged

  return result
})

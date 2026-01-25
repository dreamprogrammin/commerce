/**
 * API для автоматического уведомления поисковиков о новых/обновлённых страницах
 *
 * Поддерживает:
 * - IndexNow (Yandex, Bing, Seznam, Naver) - БЕЗ ЛИМИТОВ ✅
 * - Yandex Webmaster Ping (неофициальный) - БЕЗ ЛИМИТОВ ⚠️
 * - Bing Webmaster Ping (только для новых sitemap) - Ограничен ⚠️
 *
 * Для Google:
 * - Используется естественный краулинг через sitemap.xml (в robots.txt)
 * - Google автоматически проверяет sitemap каждые несколько дней
 * - Для критичных страниц можно использовать Google Indexing API (200 URL/день)
 */

interface NotifyRequest {
  urls: string[] // Список URL для индексации
  type?: 'created' | 'updated' | 'deleted' // Тип события
}

interface NotifyResult {
  success: boolean
  indexnow: { submitted: boolean, error?: string, urls_count: number }
  yandex_ping: { submitted: boolean, error?: string }
  bing_ping: { submitted: boolean, error?: string }
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
    yandex_ping: { submitted: false },
    bing_ping: { submitted: false },
  }

  // --- IndexNow для Yandex/Bing/Seznam/Naver (БЕЗ ЛИМИТОВ) ---
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

  // --- Yandex Webmaster Ping (неофициальный, но может работать) ---
  try {
    const sitemapUrl = `${siteUrl}/sitemap.xml`
    const yandexPingUrl = `https://webmaster.yandex.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`

    const yandexResponse = await fetch(yandexPingUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'UhtiBot/1.0 (+https://uhti.kz)',
      },
    })

    result.yandex_ping.submitted = yandexResponse.ok

    if (!yandexResponse.ok) {
      result.yandex_ping.error = `HTTP ${yandexResponse.status}`
    }
    else {
      console.log(`✅ [SEO] Yandex ping отправлен`)
    }
  }
  catch (error: any) {
    result.yandex_ping.error = error.message
    // Не логируем ошибку - это неофициальный API
  }

  // --- Bing Webmaster Ping (только для новых sitemap) ---
  try {
    const sitemapUrl = `${siteUrl}/sitemap.xml`
    const bingPingUrl = `https://www.bing.com/webmaster/ping.aspx?siteMap=${encodeURIComponent(sitemapUrl)}`

    const bingResponse = await fetch(bingPingUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'UhtiBot/1.0 (+https://uhti.kz)',
      },
    })

    result.bing_ping.submitted = bingResponse.ok

    if (!bingResponse.ok) {
      result.bing_ping.error = `HTTP ${bingResponse.status}`
    }
    else {
      console.log(`✅ [SEO] Bing ping отправлен`)
    }
  }
  catch (error: any) {
    result.bing_ping.error = error.message
    // Не логируем ошибку - это ограниченный API
  }

  // ℹ️ Для Google используется естественный краулинг
  // Sitemap.xml автоматически краулится Google (указан в robots.txt)
  // Google проверяет sitemap каждые несколько дней
  // Sitemap Ping был отключен Google в конце 2023 года

  result.success = result.indexnow.submitted || result.yandex_ping.submitted || result.bing_ping.submitted

  return result
})

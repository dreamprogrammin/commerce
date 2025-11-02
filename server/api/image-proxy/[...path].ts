/**
 * 🛡️ API Proxy для обхода Cloudflare bot detection
 *
 * Перенаправляет запросы к изображениям через наш сервер,
 * добавляя правильные заголовки для обхода защиты Cloudflare
 *
 * Использование:
 * /api/image-proxy/products/path/to/image.jpg
 * → https://...supabase.co/storage/v1/object/public/products/path/to/image.jpg
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  // Получаем путь из параметров
  const path = event.context.params?.path || ''

  if (!path) {
    throw createError({
      statusCode: 400,
      message: 'Image path is required',
    })
  }

  // Формируем URL к Supabase Storage
  const supabaseUrl = `${config.public.supabase.url}/storage/v1/object/public/${path}`

  try {
    console.log('🔄 Proxy запрос:', path.split('/').pop())

    // 🛡️ Делаем запрос с правильными заголовками
    const response = await $fetch(supabaseUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/avif,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': config.public.supabase.url,
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
      },
      // Получаем бинарные данные
      responseType: 'arrayBuffer',
      // Timeout 10 секунд
      timeout: 10000,
    })

    console.log('✅ Proxy загрузил:', path.split('/').pop())

    // Определяем MIME тип по расширению
    const ext = path.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      avif: 'image/avif',
      svg: 'image/svg+xml',
    }
    const contentType = mimeTypes[ext || ''] || 'image/jpeg'

    // 🎯 Устанавливаем заголовки ответа
    setResponseHeaders(event, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable', // Кеш на год
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Timing-Allow-Origin': '*',
    })

    // Возвращаем бинарные данные изображения
    return response
  }
  catch (error: any) {
    console.error('❌ Ошибка proxy:', error.message)

    throw createError({
      statusCode: error.statusCode || 500,
      message: `Failed to fetch image: ${error.message}`,
    })
  }
})

/**
 * 🚀 Автоматический запрос индексации всех URL в Google
 *
 * Использует Google Indexing API для программного запроса индексации
 * Получает список URL из вашего существующего API endpoint /api/sitemap-routes
 *
 * Установка:
 * 1. npm install googleapis
 * 2. Настройте Google Service Account (см. INDEXING_API_SETUP.md)
 * 3. Скачайте JSON ключ и положите в корень проекта как service-account.json
 * 4. Запустите: node scripts/request-indexing.js
 */

const fs = require('node:fs')
const path = require('node:path')
const { google } = require('googleapis')

// ============================================
// КОНФИГУРАЦИЯ
// ============================================

const SERVICE_ACCOUNT_FILE = path.join(__dirname, '..', 'service-account.json')
const SITE_URL = 'https://uhti.kz'
const SITEMAP_API_URL = `${SITE_URL}/api/sitemap-routes`

// Лимиты Google Indexing API
const DAILY_QUOTA = 200 // URL в день
const DELAY_BETWEEN_REQUESTS = 1000 // 1 секунда между запросами

// ============================================
// ФУНКЦИИ
// ============================================

/**
 * Задержка между запросами
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Получить все URL из вашего sitemap API
 */
async function fetchUrlsFromSitemap() {
  try {
    console.log('🔄 Получаю список URL из /api/sitemap-routes...')

    const response = await fetch(SITEMAP_API_URL)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const sitemapRoutes = await response.json()

    if (!Array.isArray(sitemapRoutes)) {
      throw new TypeError('API вернул неправильный формат данных')
    }

    console.log(`✅ Получено ${sitemapRoutes.length} URL из sitemap\n`)

    // Преобразуем в полные URL
    const urls = sitemapRoutes.map((route) => {
      // Если loc уже полный URL - используем как есть
      if (route.loc.startsWith('http')) {
        return route.loc
      }
      // Иначе добавляем домен
      return `${SITE_URL}${route.loc}`
    })

    return urls
  }
  catch (error) {
    console.error('❌ Ошибка получения URL из sitemap API:', error.message)
    console.log('\n💡 Убедитесь что:')
    console.log(`   1. Сайт доступен: ${SITE_URL}`)
    console.log(`   2. API работает: ${SITEMAP_API_URL}`)
    console.log('   3. Есть интернет соединение')
    process.exit(1)
  }
}

/**
 * Инициализация Google Indexing API
 */
async function initializeIndexingAPI() {
  try {
    // Проверяем существование файла
    if (!fs.existsSync(SERVICE_ACCOUNT_FILE)) {
      console.error('❌ Файл service-account.json не найден!')
      console.log('📄 Создайте его следуя инструкции в docs/INDEXING_API_SETUP.md')
      process.exit(1)
    }

    // Читаем ключ
    const keyFile = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_FILE, 'utf8'))

    // Создаём клиент авторизации
    const auth = new google.auth.GoogleAuth({
      keyFile: SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/indexing'],
    })

    const authClient = await auth.getClient()

    // Создаём API клиент
    const indexing = google.indexing({
      version: 'v3',
      auth: authClient,
    })

    console.log('✅ Google Indexing API инициализирован')
    console.log(`📧 Service Account: ${keyFile.client_email}\n`)

    return indexing
  }
  catch (error) {
    console.error('❌ Ошибка инициализации API:', error.message)
    process.exit(1)
  }
}

/**
 * Запрос индексации одного URL
 */
async function requestIndexing(indexing, url) {
  try {
    const response = await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type: 'URL_UPDATED', // URL_UPDATED или URL_DELETED
      },
    })

    return {
      success: true,
      url,
      data: response.data,
    }
  }
  catch (error) {
    return {
      success: false,
      url,
      error: error.message,
    }
  }
}

/**
 * Основная функция
 */
async function main() {
  console.log('🚀 Запуск автоматической индексации...\n')

  // Получаем URL из вашего sitemap API
  const urlsToIndex = await fetchUrlsFromSitemap()

  if (urlsToIndex.length === 0) {
    console.log('⚠️  Не найдено URL для индексации!')
    console.log('📄 Проверьте что API /api/sitemap-routes возвращает данные.')
    process.exit(0)
  }

  // Проверка дневного лимита
  if (urlsToIndex.length > DAILY_QUOTA) {
    console.log(`⚠️  Внимание: Найдено ${urlsToIndex.length} URL, но лимит Google - ${DAILY_QUOTA} в день`)
    console.log(`📊 Будут обработаны первые ${DAILY_QUOTA} URL`)
    urlsToIndex.length = DAILY_QUOTA // Обрезаем массив
  }

  console.log(`📊 Всего URL к обработке: ${urlsToIndex.length}`)
  console.log(`⏱️  Примерное время: ${Math.ceil(urlsToIndex.length * DELAY_BETWEEN_REQUESTS / 1000 / 60)} минут\n`)

  // Инициализация API
  const indexing = await initializeIndexingAPI()

  const results = {
    success: [],
    failed: [],
  }

  // Обработка каждого URL
  for (let i = 0; i < urlsToIndex.length; i++) {
    const url = urlsToIndex[i]
    const progress = `[${i + 1}/${urlsToIndex.length}]`

    console.log(`${progress} Обработка: ${url}`)

    // Запрос индексации
    const result = await requestIndexing(indexing, url)

    if (result.success) {
      console.log(`  ✅ Успешно отправлено`)
      results.success.push(url)
    }
    else {
      console.log(`  ❌ Ошибка: ${result.error}`)
      results.failed.push({ url, error: result.error })
    }

    // Задержка между запросами (чтобы не превысить квоты)
    if (i < urlsToIndex.length - 1) {
      await delay(DELAY_BETWEEN_REQUESTS)
    }
  }

  // Итоговая статистика
  console.log('\n📊 РЕЗУЛЬТАТЫ:')
  console.log(`✅ Успешно: ${results.success.length}`)
  console.log(`❌ Ошибок: ${results.failed.length}`)

  if (results.failed.length > 0) {
    console.log('\n❌ Ошибки:')
    results.failed.forEach(({ url, error }) => {
      console.log(`  - ${url}`)
      console.log(`    ${error}`)
    })
  }

  console.log('\n✅ Готово! Индексация запрошена.')
  console.log('⏳ Google обработает запросы в течение 1-3 дней.')
  console.log('📊 Проверяйте прогресс в Google Search Console.')
}

// ============================================
// ЗАПУСК
// ============================================

main().catch((error) => {
  console.error('❌ Критическая ошибка:', error)
  process.exit(1)
})

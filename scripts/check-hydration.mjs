/**
 * Скрипт для проверки hydration ошибок
 * Запуск: node scripts/check-hydration.mjs
 */

import { chromium } from 'playwright'

const BASE_URL = 'http://127.0.0.1:3000'

const PAGES_TO_CHECK = [
  '/',
  '/catalog',
  '/catalog/toys',
  '/catalog/construction-toys',
  '/brand/lego',
  '/cart', // SSR disabled
  '/checkout', // SSR disabled
  '/catalog/products/lego-minecraft-taiga-adventure-21162', // product page
]

const hydrationErrors = []
const allConsoleMessages = []

async function checkPage(browser, url) {
  const page = await browser.newPage()
  const errors = []

  // Слушаем ВСЕ консольные сообщения
  page.on('console', msg => {
    const text = msg.text()
    const type = msg.type()

    // Записываем все сообщения для отладки
    if (type === 'error' || type === 'warning') {
      allConsoleMessages.push({ url, type, text })
    }

    const isHydrationError =
      text.toLowerCase().includes('hydration') ||
      text.toLowerCase().includes('mismatch') ||
      text.includes('server rendered') ||
      text.includes('client rendered') ||
      text.includes('[Vue warn]')

    if (isHydrationError) {
      errors.push({
        url,
        type: msg.type(),
        message: text,
      })
    }
  })

  // Слушаем pageerror
  page.on('pageerror', err => {
    if (err.message.includes('hydration') || err.message.includes('Hydration')) {
      errors.push({
        url,
        type: 'pageerror',
        message: err.message,
      })
    }
  })

  try {
    console.log(`Checking: ${url}`)
    await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
    // Ждём выполнения Vue hydration
    await page.waitForTimeout(3000)

    // Ждём немного для возможных отложенных ошибок
    await page.waitForTimeout(2000)

    if (errors.length > 0) {
      console.log(`  ❌ Found ${errors.length} hydration error(s)`)
      hydrationErrors.push(...errors)
    } else {
      console.log(`  ✅ No hydration errors`)
    }
  } catch (e) {
    console.log(`  ⚠️ Error loading page: ${e.message}`)
  } finally {
    await page.close()
  }
}

async function main() {
  console.log('🔍 Checking for hydration errors...\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  for (const url of PAGES_TO_CHECK) {
    await checkPage(browser, url)
  }

  await browser.close()

  console.log('\n' + '='.repeat(50))

  // Показываем все ошибки/warnings для анализа
  if (allConsoleMessages.length > 0) {
    console.log(`\n📋 Все console errors/warnings (${allConsoleMessages.length}):\n`)
    for (const msg of allConsoleMessages) {
      console.log(`[${msg.type}] ${msg.url}`)
      console.log(`  ${msg.text.substring(0, 200)}${msg.text.length > 200 ? '...' : ''}`)
      console.log('')
    }
  }

  console.log('='.repeat(50))
  if (hydrationErrors.length > 0) {
    console.log(`\n❌ Found ${hydrationErrors.length} hydration error(s):\n`)
    for (const error of hydrationErrors) {
      console.log(`URL: ${error.url}`)
      console.log(`Type: ${error.type}`)
      console.log(`Message: ${error.message}`)
      console.log('-'.repeat(50))
    }
    process.exit(1)
  } else {
    console.log('\n✅ No hydration errors found!')
    process.exit(0)
  }
}

main().catch(console.error)

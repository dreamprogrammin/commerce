const fs = require('node:fs')
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 OAuth авторизация - тест с ручным входом\n')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
    args: ['--start-maximized'],
  })

  const context = await browser.newContext({
    viewport: null,
  })

  const page = await context.newPage()

  // Собираем логи
  const consoleLogs = []
  const authLogs = []
  const profileLogs = []

  page.on('console', (msg) => {
    const text = msg.text()
    consoleLogs.push({ type: msg.type(), text, timestamp: new Date().toISOString() })

    if (text.includes('[Auth Plugin]')) {
      authLogs.push(text)
      console.log(`📋 ${text}`)
    }
    if (text.includes('[ProfileStore]')) {
      profileLogs.push(text)
      console.log(`📋 ${text}`)
    }
  })

  try {
    console.log(`\n${'='.repeat(70)}`)
    console.log('ИНСТРУКЦИЯ ПО ТЕСТИРОВАНИЮ')
    console.log('='.repeat(70))
    console.log('\n1. Откроется браузер с приложением')
    console.log('2. Войдите через Google (кнопка "Войти" → "Войти через Google")')
    console.log('3. После успешного входа следите за логами в этом терминале')
    console.log('4. Браузер останется открытым 60 секунд для проверки')
    console.log('5. Тест автоматически проверит переход в /profile')
    console.log(`\n${'='.repeat(70)}\n`)

    // ШАГ 1: Открываем главную
    console.log('1️⃣ Открываем главную страницу...')
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
    })
    await page.screenshot({ path: '.playwright-debug/01-initial.png', fullPage: true })
    console.log('✅ Главная страница загружена')
    console.log('\n⏳ Войдите через Google в открывшемся браузере...')
    console.log('   (ожидаем 20 секунд для авторизации)\n')

    // Ждем авторизации
    await page.waitForTimeout(20000)

    console.log('\n2️⃣ Проверяем результат авторизации...')
    await page.screenshot({ path: '.playwright-debug/02-after-auth.png', fullPage: true })

    // Проверяем, что произошло
    const loginButton = await page.locator('text=Войти').first()
    const isLoginVisible = await loginButton.isVisible().catch(() => false)

    if (!isLoginVisible) {
      console.log('✅ Пользователь авторизован (кнопка "Войти" исчезла)')
    }
    else {
      console.log('⚠️  Кнопка "Войти" все еще видна - возможно, авторизация не завершена')
    }

    // Проверяем логи
    console.log(`\n📊 Статистика логов:`)
    console.log(`   Auth Plugin: ${authLogs.length} логов`)
    console.log(`   ProfileStore: ${profileLogs.length} логов`)

    if (authLogs.some(log => log.includes('SIGNED_IN'))) {
      console.log('✅ Событие SIGNED_IN обнаружено')
    }

    if (profileLogs.some(log => log.includes('Profile loaded successfully'))) {
      console.log('✅ Профиль загружен успешно')
    }

    // ШАГ 3: Переход на /profile
    console.log('\n3️⃣ Переходим на /profile...')
    await page.goto('http://localhost:3000/profile', {
      waitUntil: 'networkidle',
      timeout: 15000,
    })

    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    const skeletons = await page.$$('.animate-pulse')

    console.log(`   URL: ${currentUrl}`)
    console.log(`   Скелетонов: ${skeletons.length}`)

    await page.screenshot({ path: '.playwright-debug/03-profile-page.png', fullPage: true })

    if (currentUrl.includes('/profile')) {
      if (skeletons.length === 0 || skeletons.length < 3) {
        console.log('✅ Страница профиля загружена БЕЗ зависаний!')
      }
      else if (skeletons.length >= 3) {
        console.log('❌ ПРОБЛЕМА: Страница профиля зависла на скелетоне!')
        console.log('   Профиль не загружается корректно.')
      }

      // Проверяем элементы профиля
      const hasTitle = await page.locator('text=Настройки профиля').isVisible().catch(() => false)
      const hasBonuses = await page.locator('text=Мои бонусы').isVisible().catch(() => false)

      if (hasTitle)
        console.log('✅ Заголовок профиля отображается')
      if (hasBonuses)
        console.log('✅ Секция бонусов отображается')
    }
    else {
      console.log('❌ Редирект на главную - авторизация не работает')
    }

    // ШАГ 4: Проверяем главную страницу
    console.log('\n4️⃣ Возврат на главную...')
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
    })

    await page.waitForTimeout(3000)
    const homeSkeletons = await page.$$('.animate-pulse')

    console.log(`   Скелетонов на главной: ${homeSkeletons.length}`)
    await page.screenshot({ path: '.playwright-debug/04-home-after-auth.png', fullPage: true })

    if (homeSkeletons.length < 5) {
      console.log('✅ Главная страница без зависаний')
    }
    else {
      console.log('⚠️  Много скелетонов (возможно, нет данных в БД)')
    }

    // Сохраняем логи
    fs.writeFileSync(
      '.playwright-debug/final-logs.json',
      JSON.stringify({ authLogs, profileLogs, consoleLogs }, null, 2),
    )

    // ИТОГОВЫЙ ОТЧЕТ
    console.log(`\n${'='.repeat(70)}`)
    console.log('📊 ИТОГОВЫЙ ОТЧЕТ')
    console.log('='.repeat(70))

    console.log('\n✅ РЕЗУЛЬТАТЫ:')
    console.log(`   Auth Plugin логов: ${authLogs.length}`)
    console.log(`   ProfileStore логов: ${profileLogs.length}`)
    console.log(`   Скелетонов на /profile: ${skeletons.length}`)
    console.log(`   Скелетонов на главной: ${homeSkeletons.length}`)

    console.log('\n📋 КЛЮЧЕВЫЕ СОБЫТИЯ:')
    if (authLogs.some(log => log.includes('SIGNED_IN'))) {
      console.log('   ✓ SIGNED_IN событие')
    }
    if (authLogs.some(log => log.includes('INITIAL_SESSION'))) {
      console.log('   ✓ INITIAL_SESSION событие')
    }
    if (profileLogs.some(log => log.includes('Starting profile load'))) {
      console.log('   ✓ Начало загрузки профиля')
    }
    if (profileLogs.some(log => log.includes('Profile loaded successfully'))) {
      console.log('   ✓ Профиль загружен успешно')
    }
    if (profileLogs.some(log => log.includes('Profile found on attempt'))) {
      console.log('   ✓ Профиль найден после retry')
    }

    console.log('\n📁 Скриншоты сохранены:')
    console.log('   - 01-initial.png (до авторизации)')
    console.log('   - 02-after-auth.png (после авторизации)')
    console.log('   - 03-profile-page.png (страница профиля)')
    console.log('   - 04-home-after-auth.png (главная после авторизации)')

    console.log('\n📄 Логи: final-logs.json')
    console.log(`${'='.repeat(70)}\n`)

    // Держим браузер открытым
    console.log('⏳ Браузер останется открытым 30 секунд для проверки...\n')
    await page.waitForTimeout(30000)
  }
  catch (error) {
    console.error('\n❌ Ошибка:', error.message)
    await page.screenshot({ path: '.playwright-debug/error.png', fullPage: true })
  }
  finally {
    await context.close()
    await browser.close()
    console.log('✅ Тест завершен\n')
  }
})()

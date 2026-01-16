const fs = require('node:fs')
const { chromium } = require('playwright');

(async () => {
  console.log('🚀 OAuth авторизация - расширенный тест\n')

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
    console.log('='.repeat(70))
    console.log('ИНСТРУКЦИЯ ПО ТЕСТИРОВАНИЮ')
    console.log('='.repeat(70))
    console.log('\n1. Сейчас откроется браузер с приложением')
    console.log('2. У вас будет 60 секунд чтобы:')
    console.log('   - Нажать кнопку "Войти"')
    console.log('   - Выбрать "Войти через Google"')
    console.log('   - Войти в свой Google аккаунт')
    console.log('3. После авторизации ОСТАВАЙТЕСЬ на странице')
    console.log('4. Тест автоматически проверит доступ к /profile')
    console.log('5. Следите за логами в консоли браузера (F12)\n')
    console.log(`${'='.repeat(70)}\n`)

    // ШАГ 1: Открываем главную
    console.log('1️⃣ Открываем главную страницу...')
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
    })
    await page.screenshot({ path: '.playwright-debug/ext-01-initial.png', fullPage: true })
    console.log('✅ Главная страница загружена')

    // Проверяем начальный статус
    const loginButtonBefore = await page.locator('text=Войти').first()
    const isLoginVisibleBefore = await loginButtonBefore.isVisible().catch(() => false)

    if (isLoginVisibleBefore) {
      console.log('ℹ️  Пользователь НЕ авторизован - требуется вход')
      console.log('\n⏳ ОЖИДАНИЕ АВТОРИЗАЦИИ (60 секунд)...')
      console.log('   Войдите через Google в открывшемся браузере...\n')
    }
    else {
      console.log('✅ Пользователь УЖЕ авторизован')
    }

    // Ждем авторизации - 60 секунд
    await page.waitForTimeout(60000)

    console.log('\n2️⃣ Проверяем результат авторизации...')
    await page.screenshot({ path: '.playwright-debug/ext-02-after-wait.png', fullPage: true })

    // Проверяем, что произошло
    const loginButtonAfter = await page.locator('text=Войти').first()
    const isLoginVisibleAfter = await loginButtonAfter.isVisible().catch(() => false)

    if (!isLoginVisibleAfter) {
      console.log('✅ Авторизация УСПЕШНА (кнопка "Войти" исчезла)')
    }
    else {
      console.log('⚠️  Кнопка "Войти" все еще видна')
      console.log('   Возможно, авторизация не завершена или произошла ошибка')
    }

    // Проверяем логи
    console.log(`\n📊 Статистика логов после ожидания:`)
    console.log(`   Auth Plugin: ${authLogs.length} логов`)
    console.log(`   ProfileStore: ${profileLogs.length} логов`)

    const hasSignedIn = authLogs.some(log => log.includes('SIGNED_IN'))
    const hasProfileLoaded = profileLogs.some(log => log.includes('Profile loaded successfully'))

    if (hasSignedIn) {
      console.log('✅ Событие SIGNED_IN зафиксировано')
    }
    if (hasProfileLoaded) {
      console.log('✅ Профиль загружен успешно')
    }

    // ШАГ 3: Переход на /profile
    console.log('\n3️⃣ Тестируем доступ к странице /profile...')
    await page.goto('http://localhost:3000/profile', {
      waitUntil: 'networkidle',
      timeout: 15000,
    })

    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    const skeletons = await page.$$('.animate-pulse')

    console.log(`   Текущий URL: ${currentUrl}`)
    console.log(`   Скелетонов: ${skeletons.length}`)

    await page.screenshot({ path: '.playwright-debug/ext-03-profile-page.png', fullPage: true })

    if (currentUrl.includes('/profile')) {
      if (skeletons.length === 0 || skeletons.length < 3) {
        console.log('✅ Страница профиля загружена БЕЗ зависаний!')
      }
      else {
        console.log('❌ ПРОБЛЕМА: Страница профиля зависла на скелетоне!')
        console.log(`   Найдено ${skeletons.length} скелетонов - профиль не загружается.`)
      }

      // Проверяем элементы профиля
      const hasTitle = await page.locator('text=Настройки профиля').isVisible().catch(() => false)
      const hasBonuses = await page.locator('text=Мои бонусы').isVisible().catch(() => false)
      const hasProfile = await page.locator('text=Мой профиль').isVisible().catch(() => false)

      if (hasTitle)
        console.log('✅ Заголовок "Настройки профиля" отображается')
      if (hasBonuses)
        console.log('✅ Секция "Мои бонусы" отображается')
      if (hasProfile)
        console.log('✅ Секция "Мой профиль" отображается')
    }
    else if (currentUrl === 'http://localhost:3000/') {
      console.log('❌ РЕДИРЕКТ НА ГЛАВНУЮ')
      console.log('   Middleware перенаправил на главную страницу.')
      console.log('   Это означает, что авторизация не сохранилась.')
    }
    else {
      console.log(`⚠️  Неожиданный URL: ${currentUrl}`)
    }

    // ШАГ 4: Тестируем навигацию внутри профиля
    if (currentUrl.includes('/profile')) {
      console.log('\n4️⃣ Тестируем навигацию по страницам профиля...')

      const pages = [
        { url: '/profile/bonus', name: 'Бонусы' },
        { url: '/profile/wishlist', name: 'Избранное' },
        { url: '/profile/settings', name: 'Настройки' },
        { url: '/profile', name: 'Главная профиля' },
      ]

      for (const profilePage of pages) {
        console.log(`   Переход на ${profilePage.name}...`)
        await page.goto(`http://localhost:3000${profilePage.url}`, {
          waitUntil: 'networkidle',
          timeout: 10000,
        })

        await page.waitForTimeout(1500)

        const skeletons = await page.$$('.animate-pulse')
        if (skeletons.length === 0 || skeletons.length < 3) {
          console.log(`   ✅ ${profilePage.name} - загружена успешно`)
        }
        else {
          console.log(`   ⚠️  ${profilePage.name} - ${skeletons.length} скелетонов (возможно зависание)`)
        }
      }

      await page.screenshot({
        path: '.playwright-debug/ext-04-navigation-test.png',
        fullPage: true,
      })
    }

    // ШАГ 5: Возвращаемся на главную
    console.log('\n5️⃣ Проверяем возврат на главную страницу...')

    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 15000,
    })

    await page.waitForTimeout(3000)

    const homeSkeletons = await page.$$('.animate-pulse')
    console.log(`   Скелетонов на главной: ${homeSkeletons.length}`)

    if (homeSkeletons.length === 0 || homeSkeletons.length < 5) {
      console.log('✅ Главная страница загружена без зависаний')
    }
    else {
      console.log('⚠️  На главной странице много скелетонов')
      console.log('   (это может быть нормально, если в БД мало данных)')
    }

    await page.screenshot({ path: '.playwright-debug/ext-05-home-after-auth.png', fullPage: true })

    // Сохраняем все логи
    fs.writeFileSync(
      '.playwright-debug/extended-test-logs.json',
      JSON.stringify({ authLogs, profileLogs, consoleLogs }, null, 2),
    )

    // ИТОГОВЫЙ ОТЧЕТ
    console.log(`\n${'='.repeat(70)}`)
    console.log('📊 ИТОГОВЫЙ ОТЧЕТ')
    console.log('='.repeat(70))

    console.log('\n✅ СТАТИСТИКА:')
    console.log(`   Auth Plugin логов: ${authLogs.length}`)
    console.log(`   ProfileStore логов: ${profileLogs.length}`)
    console.log(`   Скелетонов на /profile: ${skeletons.length}`)
    console.log(`   Скелетонов на главной: ${homeSkeletons.length}`)

    console.log('\n📋 КЛЮЧЕВЫЕ СОБЫТИЯ:')
    if (authLogs.some(log => log.includes('SIGNED_IN'))) {
      console.log('   ✓ SIGNED_IN событие обнаружено')
    }
    else {
      console.log('   ✗ SIGNED_IN событие НЕ обнаружено')
    }
    if (authLogs.some(log => log.includes('INITIAL_SESSION'))) {
      console.log('   ✓ INITIAL_SESSION событие обнаружено')
    }
    if (profileLogs.some(log => log.includes('Profile loaded successfully'))) {
      console.log('   ✓ Профиль загружен успешно')
    }
    else {
      console.log('   ✗ Профиль НЕ загружен')
    }

    console.log('\n📁 АРТЕФАКТЫ:')
    console.log('   Скриншоты:')
    console.log('   - ext-01-initial.png (до авторизации)')
    console.log('   - ext-02-after-wait.png (после ожидания 60с)')
    console.log('   - ext-03-profile-page.png (страница профиля)')
    console.log('   - ext-04-navigation-test.png (навигация)')
    console.log('   - ext-05-home-after-auth.png (главная после авторизации)')
    console.log('\n   Логи: extended-test-logs.json')

    console.log('\n🎯 ВЫВОДЫ:')
    if (currentUrl.includes('/profile') && (skeletons.length === 0 || skeletons.length < 3)) {
      console.log('   ✅ OAuth авторизация работает КОРРЕКТНО')
      console.log('   ✅ Доступ к /profile БЕЗ проблем')
      console.log('   ✅ Страница профиля загружается без зависаний')
    }
    else if (currentUrl === 'http://localhost:3000/') {
      console.log('   ❌ ПРОБЛЕМА: Редирект на главную после попытки входа в /profile')
      console.log('   Возможные причины:')
      console.log('   - Профиль не создался в БД')
      console.log('   - Сессия не сохранилась после OAuth')
      console.log('   - Middleware блокирует доступ')
    }
    else if (skeletons.length >= 3) {
      console.log('   ❌ ПРОБЛЕМА: Страница /profile зависла на скелетоне')
      console.log('   Возможные причины:')
      console.log('   - ProfileStore не загружает данные')
      console.log('   - Race condition между auth и profile loading')
    }

    console.log(`\n${'='.repeat(70)}\n`)

    // Держим браузер открытым
    console.log('⏳ Браузер останется открытым 30 секунд для проверки...\n')
    await page.waitForTimeout(30000)
  }
  catch (error) {
    console.error('\n❌ Ошибка:', error.message)
    console.error(error.stack)
    await page.screenshot({ path: '.playwright-debug/ext-error.png', fullPage: true })
  }
  finally {
    await context.close()
    await browser.close()
    console.log('✅ Тест завершен\n')
  }
})()

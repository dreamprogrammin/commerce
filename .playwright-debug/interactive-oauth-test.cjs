const readline = require('node:readline')
const { chromium } = require('playwright')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve))
}

(async () => {
  console.log('🚀 Интерактивный тест OAuth авторизации\n')
  console.log('Этот тест откроет браузер и попросит вас вручную войти через Google.')
  console.log('После входа тест автоматически проверит функциональность.\n')

  const browser = await chromium.launch({
    headless: false,
    slowMo: 300,
    args: ['--start-maximized'],
  })

  const context = await browser.newContext({
    viewport: null,
    recordVideo: {
      dir: '.playwright-debug/videos/',
      size: { width: 1920, height: 1080 },
    },
  })

  const page = await context.newPage()

  // Собираем логи
  const consoleLogs = []
  const authLogs = []
  const profileLogs = []
  const homeLogs = []

  page.on('console', (msg) => {
    const text = msg.text()
    const type = msg.type()
    consoleLogs.push({ type, text, timestamp: new Date().toISOString() })

    if (text.includes('[Auth Plugin]')) {
      authLogs.push(text)
      console.log(`📋 ${text}`)
    }
    if (text.includes('[ProfileStore]')) {
      profileLogs.push(text)
      console.log(`📋 ${text}`)
    }
    if (text.includes('[Home]')) {
      homeLogs.push(text)
      console.log(`📋 ${text}`)
    }
  })

  page.on('pageerror', (error) => {
    console.error('❌ Page Error:', error.message)
  })

  try {
    // ===== ШАГ 1: Открываем главную страницу =====
    console.log('1️⃣ Открываем главную страницу...')
    await page.goto('http://localhost:3000', {
      waitUntil: 'networkidle',
      timeout: 30000,
    })

    await page.screenshot({
      path: '.playwright-debug/step-01-homepage.png',
      fullPage: true,
    })
    console.log('✅ Главная страница загружена\n')

    // ===== ШАГ 2: Проверяем статус авторизации =====
    console.log('2️⃣ Проверяем статус авторизации...')

    // Проверяем, есть ли кнопка "Войти"
    const loginButton = await page.locator('text=Войти').first()
    const isLoginVisible = await loginButton.isVisible().catch(() => false)

    if (isLoginVisible) {
      console.log('ℹ️  Пользователь НЕ авторизован')
      console.log(`\n${'='.repeat(60)}`)
      console.log('ТРЕБУЕТСЯ РУЧНАЯ АВТОРИЗАЦИЯ')
      console.log('='.repeat(60))
      console.log('\n📋 ИНСТРУКЦИЯ:')
      console.log('1. В открывшемся браузере нажмите кнопку "Войти"')
      console.log('2. Выберите "Войти через Google"')
      console.log('3. Войдите в свой Google аккаунт')
      console.log('4. После успешного входа вернитесь в терминал')
      console.log('5. Следите за логами в консоли браузера (F12)\n')

      // Ждем, пока пользователь авторизуется
      await askQuestion('Нажмите Enter ПОСЛЕ того, как вы войдете через Google... ')
      console.log('\n✅ Продолжаем тест...\n')

      // Ждем немного для обработки авторизации
      console.log('⏳ Ждем обработки авторизации (5 секунд)...')
      await page.waitForTimeout(5000)
    }
    else {
      console.log('✅ Пользователь уже авторизован\n')
    }

    // ===== ШАГ 3: Проверяем загрузку профиля =====
    console.log('3️⃣ Проверяем загрузку профиля...')

    // Делаем скриншот после авторизации
    await page.screenshot({
      path: '.playwright-debug/step-02-after-auth.png',
      fullPage: true,
    })

    // Проверяем логи профиля
    if (profileLogs.length > 0) {
      console.log('✅ ProfileStore активен:')
      profileLogs.forEach(log => console.log(`   - ${log}`))
    }
    else {
      console.log('⚠️  ProfileStore логи не найдены')
    }
    console.log('')

    // ===== ШАГ 4: Переходим на /profile =====
    console.log('4️⃣ Переходим на страницу профиля...')

    await page.goto('http://localhost:3000/profile', {
      waitUntil: 'networkidle',
      timeout: 15000,
    })

    // Ждем загрузки контента
    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    console.log(`   Текущий URL: ${currentUrl}`)

    // Проверяем скелетоны
    const skeletons = await page.$$('.animate-pulse')
    console.log(`   Скелетонов на странице: ${skeletons.length}`)

    if (currentUrl.includes('/profile')) {
      // Проверяем контент профиля
      const profileTitle = await page.locator('text=Настройки профиля').first()
      const profileContent = await page.locator('text=Мой профиль').first()

      const hasTitleVisible = await profileTitle.isVisible().catch(() => false)
      const hasContentVisible = await profileContent.isVisible().catch(() => false)

      if (hasTitleVisible || hasContentVisible) {
        console.log('✅ Страница профиля загружена успешно')

        // Проверяем наличие данных профиля
        const bonusSection = await page.locator('text=Мои бонусы').first()
        if (await bonusSection.isVisible().catch(() => false)) {
          console.log('✅ Секция бонусов отображается')
        }
      }
      else if (skeletons.length > 0) {
        console.log('❌ ПРОБЛЕМА: Страница профиля зависла на скелетоне!')
        console.log('   Это означает, что профиль не загружается.')
      }
      else {
        console.log('⚠️  Страница профиля в неизвестном состоянии')
      }

      await page.screenshot({
        path: '.playwright-debug/step-03-profile-page.png',
        fullPage: true,
      })
    }
    else if (currentUrl === 'http://localhost:3000/') {
      console.log('❌ Middleware перенаправил на главную')
      console.log('   Это означает, что авторизация не сохранилась или профиль не создался.')

      // Проверяем модальное окно
      await page.waitForTimeout(1000)
      const modal = await page.locator('[role="dialog"]').first()
      if (await modal.isVisible().catch(() => false)) {
        console.log('   Модальное окно входа открылось (требуется повторный вход)')
      }

      await page.screenshot({
        path: '.playwright-debug/step-03-redirected.png',
        fullPage: true,
      })
    }
    console.log('')

    // ===== ШАГ 5: Тестируем навигацию =====
    console.log('5️⃣ Тестируем навигацию по страницам профиля...')

    if (currentUrl.includes('/profile')) {
      // Пробуем перейти на разные страницы профиля
      const pages = [
        { url: '/profile/bonus', name: 'Бонусы' },
        { url: '/profile/wishlist', name: 'Избранное' },
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
          console.log(`   ✅ ${profilePage.name} - загружена`)
        }
        else {
          console.log(`   ⚠️  ${profilePage.name} - ${skeletons.length} скелетонов`)
        }
      }

      await page.screenshot({
        path: '.playwright-debug/step-04-navigation-test.png',
        fullPage: true,
      })
    }
    console.log('')

    // ===== ШАГ 6: Возвращаемся на главную =====
    console.log('6️⃣ Проверяем возврат на главную страницу...')

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
      console.log('⚠️  На главной странице много скелетонов (возможно, нет данных в БД)')
    }

    await page.screenshot({
      path: '.playwright-debug/step-05-homepage-after-auth.png',
      fullPage: true,
    })
    console.log('')

    // ===== АНАЛИЗ ЛОГОВ =====
    console.log('7️⃣ Анализ консольных логов...')
    console.log(`   Auth Plugin логов: ${authLogs.length}`)
    console.log(`   ProfileStore логов: ${profileLogs.length}`)
    console.log(`   Home логов: ${homeLogs.length}`)

    if (authLogs.length > 0) {
      console.log('\n📋 Auth Plugin логи:')
      authLogs.forEach(log => console.log(`   ${log}`))
    }

    if (profileLogs.length > 0) {
      console.log('\n📋 ProfileStore логи:')
      profileLogs.forEach(log => console.log(`   ${log}`))
    }

    // Сохраняем все логи
    const fs = require('node:fs')
    fs.writeFileSync(
      '.playwright-debug/oauth-test-logs.json',
      JSON.stringify({
        authLogs,
        profileLogs,
        homeLogs,
        allLogs: consoleLogs,
      }, null, 2),
    )
    console.log('\n📄 Полные логи сохранены в oauth-test-logs.json\n')

    // ===== ИТОГОВЫЙ ОТЧЕТ =====
    console.log(`\n${'='.repeat(70)}`)
    console.log('📊 ИТОГОВЫЙ ОТЧЕТ')
    console.log(`${'='.repeat(70)}\n`)

    const hasAuthLogs = authLogs.length > 0
    const hasProfileLogs = profileLogs.length > 0
    const profileLoaded = profileLogs.some(log => log.includes('Profile loaded successfully'))
    const signedInEvent = authLogs.some(log => log.includes('SIGNED_IN'))

    console.log('✅ ЧТО РАБОТАЕТ:')
    if (hasAuthLogs) {
      console.log('   ✓ Auth Plugin активен и логирует события')
    }
    if (hasProfileLogs) {
      console.log('   ✓ ProfileStore активен')
    }
    if (profileLoaded) {
      console.log('   ✓ Профиль загрузился успешно')
    }
    if (signedInEvent) {
      console.log('   ✓ OAuth авторизация обработана')
    }

    console.log('\n⚠️  ЧТО НУЖНО ПРОВЕРИТЬ:')
    if (!hasProfileLogs) {
      console.log('   ! ProfileStore не активен - возможно, профиль не создался')
    }
    if (!profileLoaded && hasProfileLogs) {
      console.log('   ! Профиль запущен, но не загрузился полностью')
    }
    if (homeSkeletons.length > 10) {
      console.log('   ! Много скелетонов на главной (возможно, нет данных в БД)')
    }

    console.log('\n📁 АРТЕФАКТЫ:')
    console.log('   - Скриншоты: .playwright-debug/step-*.png')
    console.log('   - Логи: .playwright-debug/oauth-test-logs.json')
    console.log('   - Видео: .playwright-debug/videos/\n')

    console.log(`${'='.repeat(70)}\n`)

    // Держим браузер открытым для проверки
    console.log('⏳ Браузер останется открытым еще 10 секунд для проверки...\n')
    await page.waitForTimeout(10000)
  }
  catch (error) {
    console.error('\n❌ Ошибка при выполнении теста:', error.message)
    console.error(error.stack)

    await page.screenshot({
      path: '.playwright-debug/error-screenshot.png',
      fullPage: true,
    })
  }
  finally {
    await context.close()
    await browser.close()
    rl.close()
    console.log('✅ Тест завершен. Браузер закрыт.\n')
  }
})()

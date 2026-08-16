import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'

/**
 * Превью (`dev.uhti.kz`) — не боевой сайт, и в индексе ему не место.
 *
 * `VERCEL_ENV` платформа выставляет сама: `production` на боевом деплое,
 * `preview` на всех остальных. Локально переменной нет вовсе, поэтому
 * `isPreview` там ложно и сборка ведёт себя как боевая.
 *
 * Работает здесь robots.txt, и он же — настоящий запрет: закрытые в нём
 * адреса робот просто не запрашивает.
 *
 * Мета-тег и заголовок — вторая линия, и закрыты они НЕ ВЕЗДЕ. Замер на
 * сборке превью (`VERCEL_ENV=preview`, девять адресов):
 *
 *   /about /terms /catalog /catalog/new /catalog/promotions   и мета, и заголовок закрыты
 *   /catalog/boys, карточка товара                            мета закрыта, заголовок нет
 *   /, /brand/**                                              оба остались index, follow
 *
 * Ради этого перепробовано и оставлено в коде три рычага: композабл
 * `useRobotsContent` на страницах (он и закрыл мета-теги), запрещающая
 * группа в `robots.groups` и ключ `robots` в правиле маршрута. Отдельно
 * испробованы и отброшены серверный плагин на хуке `request` и на
 * `render:response` — заголовок перезаписывался в обоих случаях.
 *
 * Почему так: в собранном сервере видно, что `@nuxtjs/robots` сам вычисляет
 * строку и сам ставит и заголовок, и мета-тег, добавляя его ПОСЛЕ страницы.
 * На части адресов его значение выигрывает у страничного, и ни один из
 * перечисленных входов на него не повлиял. Докопаться до конца не удалось.
 *
 * На запрет обхода это не влияет: robots.txt отдаёт `Disallow: /`, и
 * закрытые в нём адреса робот не запрашивает вовсе — а значит ни заголовка,
 * ни мета-тега не видит.
 *
 * Следствие, о котором важно помнить: сборка превью несёт запрет внутри
 * себя. Если такую сборку продвинуть в продакшн через `vercel promote`,
 * боевой сайт уедет с `Disallow: /`. Продвигать нужно сборку с `master`.
 */
const isPreview = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',

  devServer: {
    host: 'localhost',
    port: 3000,
  },

  runtimeConfig: {
    indexnowKey: process.env.INDEXNOW_KEY || '07d3f5086f59e65326ce9d66b1d1f57c',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    public: {
      siteUrl: 'https://uhti.kz',
    },
  },

  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    'shadcn-nuxt',
    'pinia-plugin-persistedstate/nuxt',
    '@nuxt/image',
    '@nuxt/icon',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-og-image',
    'nuxt-schema-org',
    '@nuxt/fonts',
    'nuxt-gtag',
    // 🔥 Отключаем Storybook в dev режиме
    ...(process.env.NODE_ENV === 'production' ? ['@nuxtjs/storybook'] : []),
  ],

  gtag: {
    id: process.env.NUXT_PUBLIC_GTAG_ID,
    loadingStrategy: 'defer',
    enabled: true,
    config: {
      id: process.env.NUXT_PUBLIC_GTAG_ID,
    },
  },

  // @nuxt/fonts — font-display: swap убирает блокировку рендера шрифтами
  fonts: {
    defaults: {
      // 800/900 нужны заголовкам и ценам в дизайне главной — без них
      // браузер синтезирует псевдожирное начертание
      weights: [400, 500, 600, 700, 800, 900],
      styles: ['normal'],
      subsets: ['cyrillic', 'latin'],
    },
    families: [
      // Montserrat Alternates используется только для логотипа-словомарки
      // («Ухтышка» в шапке, подвале и на бонусной карте) — тянем один вес
      { name: 'Montserrat Alternates', weights: [800] },
    ],
    display: 'swap',
    // Предзагружаем шрифты для быстрого первого рендера
    preload: true,
  },

  // @nuxt/icon — оптимизируем иконки
  icon: {
    // CSS иконок — в отдельный слой, иначе он бьёт утилиты Tailwind.
    //
    // По умолчанию @nuxt/icon отдаёт `:where(.i-lucide\:x){width:1em;height:1em}`
    // ВНЕ слоёв. Беслойное правило бьёт любой слой независимо от специфичности,
    // поэтому утилиты Tailwind на иконках не работали вовсе: `size-[26px]`
    // рисовался как 16px, `size-5` — как 14px. Нулевая специфичность у :where()
    // сделана как раз чтобы правило легко перебивали, но слои этот замысел
    // ломают.
    //
    // Имя слоя СВОЁ, а не 'components'. Стили иконок Nuxt подмешивает
    // отдельными <style> раньше entry.css, и слой регистрируется первым.
    // С именем 'components' это переставляло весь порядок в
    // `components → properties → theme → base → utilities`: preflight из base
    // оказывался ПОСЛЕ компонентов и сносил им рамки и фон — проверено, вёрстка
    // оформления разваливалась.
    //
    // Со своим именем всё встаёт правильно:
    // `icons → properties → theme → base → components → utilities`.
    // Иконки слабее всех: размер задаёт разметка (utilities), а компонент,
    // задающий размер своим классом, тоже сильнее. Порядок слоёв Tailwind
    // при этом не меняется.
    cssLayer: 'icons',
    serverBundle: {
      collections: ['lucide', 'streamline-plump', 'streamline-emojis', 'fluent-emoji-flat', 'line-md', 'simple-icons', 'gravity-ui', 'mdi', 'logos', 'ic', 'solar'],
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },

  site: {
    // Отсюда `@nuxtjs/robots` берёт решение по robots.txt: на превью он
    // отдаёт `Disallow: /`. Это и есть настоящий запрет — закрытые здесь
    // адреса робот просто не запрашивает. Заголовок выше — вторая линия,
    // на случай если robots.txt проигнорируют.
    indexable: !isPreview,
    url: 'https://uhti.kz',
    name: 'Ухтышка',
    description: 'Интернет-магазин с широким ассортиментом игрушек.',
    defaultLocale: 'ru',
  },

  ogImage: {
    runtimeCacheStorage: true,
    defaults: {
      width: 1200,
      height: 630,
    },
    fonts: ['Inter:400', 'Inter:700', 'Inter:900'],
  },

  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'Ухтышка',
      url: 'https://uhti.kz',
      logo: 'https://uhti.kz/logo.png',
      description:
        'Интернет-магазин с широким ассортиментом качественных игрушек.',
      address: {
        addressCountry: 'KZ',
        addressLocality: 'Алматы',
        streetAddress: 'мкр. Шапагат, ул. Амангельды',
        postalCode: '050058',
      },
      contactPoint: {
        telephone: '+7-702-537-94-73',
        contactType: 'customer service',
        availableLanguage: ['ru', 'kk'],
      },
      sameAs: [],
    },
  },

  sitemap: {
    sources: ['/api/sitemap-routes'],
    exclude: [
      '/admin/**',
      '/confirm/**',
      '/forgot-password/**',
      '/order/**',
      '/profile/**',
      '/register/**',
      '/reset-password/**',
      '/cart',
      '/checkout',
      '/search',
      '/notifications',
      '/brands',
      '/contacts',
      '/auth/**',
    ],
  },

  robots: {
    /*
     * На превью — одна запрещающая группа вместо всего набора ниже.
     *
     * Дело не только в robots.txt: движок правил модуля решает и то, какой
     * `X-Robots-Tag` уйдёт в ответ, и на части страниц он перебивает и
     * правило маршрута, и мета-тег самой страницы. Пока здесь стояли
     * `allow: ['/', '/catalog/**', …]`, модуль считал адреса разрешёнными
     * и ставил `index, follow` — проверено запуском: главная отдавала
     * ровно его, причём без суффиксов `max-image-preview`, то есть значение
     * приходило от модуля, а не со страницы.
     */
    groups: isPreview
      ? [{ userAgent: ['*'], disallow: ['/'] }]
      : [
          {
            userAgent: ['*'],
            allow: ['/', '/catalog/**', '/brand/**'],
            disallow: [
              '/admin',
              '/confirm',
              '/forgot-password',
              '/login',
              '/order',
              '/profile',
              '/register',
              '/reset-password',
              '/cart',
              '/checkout',
              '/search',
              '/notifications',
              '/auth',
              '/api/**',
              '/**/',
              '/__nuxt',
              '/_nuxt',
            ],
          },
          // Yandex-специфичная конфигурация для очистки параметров фильтров
          {
            userAgent: ['Yandex'],
            cleanParam: [
              // Сортировка и пагинация
              'sort_by',
              'page',

              // Фильтры каталога
              'brands',
              'subcategories',
              'materials',
              'countries',
              'price_min',
              'price_max',

              // Динамические атрибуты (возраст, размер и т.д.)
              'attr_age',
              'attr_size',
              'attr_color',
              'attr_material',
              'attr_gender',

              // UTM метки и tracking
              'utm_source',
              'utm_medium',
              'utm_campaign',
              'utm_content',
              'utm_term',
              'fbclid',
              'gclid',
              'yclid',
            ],
          },
        ],
    sitemap: ['https://uhti.kz/sitemap.xml'],
  },

  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    componentIslands: true,
    treeshakeClientOnly: true,
    watcher: 'parcel',
  },

  features: {
    // Отключаем inlineStyles, так как при использовании Tailwind 4 и большого количества компонентов
    // это раздувает HTML и замедляет парсинг и Layout.
    inlineStyles: false,
  },

  nitro: {
    routeRules: {
      // 🔒 Базовые security-заголовки для всех страниц.
      // CSP пока в Report-Only режиме — собираем нарушения перед принудительным включением,
      // т.к. на сайте используются сторонние origin'ы (Supabase Storage, Google Fonts, GTM/GA).
      '/**': {
        /*
         * Ключ `robots` в правиле маршрута — то самое место, откуда
         * `@nuxtjs/robots` берёт значение. Видно в собранном сервере:
         * модуль вычисляет строку из правила (иначе берёт свой
         * `robotsEnabledValue`, то есть `index, follow`) и дальше сам ставит
         * и заголовок `X-Robots-Tag`, и мета-тег `robots`.
         *
         * Поэтому ни запрещающая группа в `robots.groups`, ни
         * `site.indexable`, ни заголовок, выставленный руками, заголовок на
         * страницах не меняли: модуль перезаписывал его своим значением.
         * Всё это было испробовано и проверено запуском.
         */
        ...(isPreview ? { robots: 'noindex, nofollow' } : {}),
        headers: {
          // Только на превью; на боевой сборке ключа здесь нет вовсе.
          // Доезжает не до всех страниц — почему, см. комментарий к isPreview.
          ...(isPreview ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'SAMEORIGIN',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Content-Security-Policy-Report-Only': [
            `default-src 'self'`,
            `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com`,
            `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
            `font-src 'self' https://fonts.gstatic.com`,
            `img-src 'self' data: blob: https://gvsdevsvzgcivpphcuai.supabase.co https://www.google-analytics.com https://www.googletagmanager.com`,
            `connect-src 'self' https://gvsdevsvzgcivpphcuai.supabase.co https://www.google-analytics.com https://www.googletagmanager.com`,
            `frame-ancestors 'self'`,
          ].join('; '),
        },
      },
      // ... (keep existing rules)
      '/': { swr: 600 },
      /*
       * `/catalog` — точное совпадение, оно накрывает только сам корень
       * каталога. Страницы категорий (`/catalog/boys`, `/catalog/girls/kukly`)
       * под него не попадали и рендерились заново на каждый запрос.
       *
       * Замерено на превью: `x-vercel-cache: MISS` на всех подряд запросах,
       * первый байт 2.7–3.8 с. Это и есть главный вклад в LCP категории:
       * сам сервер отдаёт тело через три секунды, а всё остальное — картинки,
       * CSS, JS — уже вторично. В сборке с vercel-пресетом видно то же самое:
       * ISR-функции создаются для `/`, `/catalog` и `/catalog/products/**`,
       * а маршрута для категорий среди них нет.
       *
       * Страница категории тяжёлая по своей природе: 64 категории одним
       * запросом (174 КБ, ~1 с), товары, фильтры, бренды, атрибуты — и всё
       * это волнами, а один круг до Supabase стоит 400–650 мс.
       *
       * `isr`, а не `swr`, намеренно. В сборке видно разницу: `swr: N` даёт
       * vercel-пресету `{"expiration": false}` — кеш живёт до следующей
       * выкатки и сам не обновляется. Так сейчас устроены `/` и карточки
       * товара: их содержимое заморожено между деплоями. `isr: N` даёт
       * `{"expiration": 1800}`, то есть страница сама переспрашивает данные
       * раз в полчаса. Для списка товаров это важнее: в него приходят
       * новинки и уходит распроданное.
       *
       * Параметры запроса кеш различает: `allowQuery` не задан, а без него
       * Vercel кеширует каждый набор параметров отдельно — фильтры и
       * `?brand=` не начнут отдавать общую страницу.
       */
      '/catalog/**': { isr: 1800 },
      '/catalog': { swr: 1800 },
      '/catalog/products/**': {
        swr: 3600,
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      },
      // Корзина и оформление рисуются только на клиенте.
      //
      // Их состояние живёт в localStorage (cartStore персистится под ключом
      // uhti-cart-v1), а на сервере localStorage нет. Из-за этого SSR отдавал
      // ветку «Корзина пуста», клиент гидратировал ветку с товарами, и патч
      // оставлял DOM в перепутанном виде: колонка с товарами оказывалась
      // вложенной внутрь блока пустой корзины. Наружу это вылезало
      // горизонтальной прокруткой на 920px при ширине 390px и ошибкой
      // «Hydration completed but contains mismatches» в консоли.
      //
      // Кешировать эти страницы всё равно нельзя — они у каждого свои.
      '/cart': { ssr: false },
      '/checkout': { ssr: false },
      //
      // Личный кабинет — та же болезнь, что у корзины, и тем же лекарством.
      //
      // `layouts/Profile.vue` выбирает ветку по `isLoggedIn`, а на сервере
      // сессии нет: SSR отдавал «Проверка авторизации…», клиент гидратировал
      // ветку с контентом, и патч оставлял разметку вложенной внутрь
      // центрирующего `flex items-center justify-center` из ветки-загрузчика.
      // Наружу это вылезало так: при заходе по прямой ссылке (закладка,
      // перезагрузка, ссылка из письма) вся секция профиля уезжала вправо за
      // край экрана — `main` оказывался на x=1238 при ширине окна 1280, а
      // scrollWidth раздувался до 1705. При переходе роутером внутри сайта
      // страница рисовалась нормально, поэтому баг долго не попадался.
      //
      // Индексации не теряем: профиль и так закрыт `noindex` в layouts/Profile.vue
      // и исключён из карты сайта.
      '/profile/**': { ssr: false },
    },
    // В dev файловый драйвер кэша хранит SWR-payload по пути маршрута,
    // из-за чего «/catalog» (файл) конфликтует с «/catalog/products/**» (нужна директория)
    // и вложенные страницы падают с ENOTDIR. На проде драйвер другой, поэтому только для dev.
    devStorage: {
      cache: { driver: 'memory' },
    },
    // Локально `pnpm build` падал с ELOOP: трассируя внешние зависимости, Nitro
    // раскладывает их в .output/server/node_modules/.nitro/ по образцу pnpm,
    // а пары вроде vue ↔ @vue/server-renderer дают взаимные симлинки —
    // рекурсивный обход упирается в лимит вложенности ядра.
    // На Vercel сборка проходит штатно, поэтому там оставляем поведение
    // по умолчанию и трогаем только локальные сборки.
    ...(process.env.VERCEL
      ? {}
      : { externals: { trace: false } }),
    compressPublicAssets: {
      gzip: true,
      brotli: true,
    },
    minify: true,
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
  },

  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    format: ['webp', 'jpg', 'png'],
    quality: 80,
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
  },

  app: {
    head: {
      htmlAttrs: {
        lang: 'ru-KZ',
      },
      link: [
        {
          rel: 'preconnect',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
          crossorigin: 'anonymous',
        },
        {
          rel: 'dns-prefetch',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: 'anonymous',
        },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        // ...
      ],
      // ...
    },
  },

  supabase: {
    redirect: false,
    types: 'types/supabase.ts',
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    cookieOptions: {
      // ✅ Для Safari/iOS: используем lax вместо strict
      sameSite: 'lax',
      // ✅ Увеличиваем время жизни сессии
      maxAge: 60 * 60 * 24 * 365, // 1 год
    },
    clientOptions: {
      auth: {
        // ✅ Используем localStorage вместо cookie storage для лучшей совместимости
        storageKey: 'supabase-auth-token',
        // ✅ Включаем автоматическое обновление токена
        autoRefreshToken: true,
        // ✅ Определяем сессию при загрузке
        detectSessionInUrl: true,
        // ✅ Использовать PKCE flow (более безопасен и работает лучше в Safari)
        flowType: 'pkce',
      },
    },
  },

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    server: {
      hmr: {
        protocol: 'ws',
        host: 'localhost',
      },
    },
    css: {
      lightningcss: {
        /*
         * Без targets Lightning CSS не знает, каким браузерам нужны префиксы,
         * и оставляет ровно одно объявление из пары. Со стеклянными панелями
         * это било насмерть: `backdrop-filter` + `-webkit-backdrop-filter`
         * схлопывались в одно, и результат зависел от порядка в исходнике.
         *
         * Формат targets — упакованная версия: (major << 16) | (minor << 8).
         * Safari 15.4 — там `backdrop-filter` только под префиксом, и это
         * заметная доля iPhone; Chrome/Firefox/Edge — стандартное свойство.
         * Проверено на реальном выводе: с этими targets Lightning CSS
         * печатает ОБА объявления, без них — только стандартное.
         */
        targets: {
          safari: (15 << 16) | (4 << 8),
          ios_saf: (15 << 16) | (4 << 8),
          chrome: 100 << 16,
          firefox: 100 << 16,
          edge: 100 << 16,
        },
      },
    },
    build: {
      cssMinify: 'lightningcss',
      // Оптимизируем загрузку JS через агрессивное разбиение и preload
      modulePreload: {
        polyfill: false,
      },
      rollupOptions: {
        output: {
          // Упрощенное разбиение для предотвращения ReferenceError при инициализации
          manualChunks(id) {
            if (id.includes('node_modules')) {
              // Группируем только реально тяжелые и независимые библиотеки
              if (id.includes('gsap'))
                return 'vendor-gsap'
              if (id.includes('lottie') || id.includes('dotlottie'))
                return 'vendor-lottie'
              if (id.includes('embla-carousel'))
                return 'vendor-carousel'
              // vue-draggable-next используется только в админке
              // (components/admin/products/ProductForm.vue) — на публичных
              // страницах (в т.ч. на LCP-критичной главной) не нужен.
              if (id.includes('vue-draggable-next') || id.includes('sortablejs'))
                return 'vendor-admin-dnd'

              // Ниже — только ЛИСТОВЫЕ библиотеки: их никто не импортирует на
              // старте приложения, и от порядка инициализации ядра они не
              // зависят. Именно поэтому их можно безопасно вынести, в отличие
              // от vue / vue-router / pinia / supabase / reka-ui, попытка
              // раздробить которые и приводила к ReferenceError (см. ниже).
              // Каждая нужна одному-двум маршрутам, а лежала в общем чанке и
              // ехала на все страницы, включая главную.

              // Сжатие картинок при загрузке — только админка (utils/imageOptimizer.ts)
              if (id.includes('browser-image-compression'))
                return 'vendor-admin-image'
              // Работа с таблицами — только админка (components/ui/table)
              if (id.includes('@tanstack/vue-table'))
                return 'vendor-admin-table'
              // lodash-es — только admin/products/ProductForm.vue
              if (id.includes('lodash'))
                return 'vendor-admin-lodash'
              // Транслитерация slug — только админка (utils/slugify.ts)
              if (id.includes('transliteration') || id.includes('slugify'))
                return 'vendor-admin-slug'
              // Конфетти — одна страница: pages/order/success/[id].vue
              if (id.includes('canvas-confetti'))
                return 'vendor-confetti'
              // Маски телефонов — формы чекаута и профиля, не каталог
              if (id.includes('maska'))
                return 'vendor-forms'
              // Санитайзер HTML — composables/useSafeHtml.ts
              if (id.includes('dompurify'))
                return 'vendor-sanitize'

              // Остальное оставляем в общем вендоре или основном чанке
              // чтобы избежать проблем с порядком инициализации core-библиотек
              return 'vendor'
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    // Оптимизируем зависимости
    optimizeDeps: {
      include: [
        'gsap',
        // Именно прямые зависимости: сам `embla-carousel` лежит в дереве pnpm
        // транзитивно и из корня проекта не резолвится, из-за чего Vite ругался
        // на нерезолвимую запись. Ядро всё равно попадёт в пребандл через них.
        'embla-carousel-vue',
        'embla-carousel-autoplay',
        '@tanstack/vue-query',
        'lucide-vue-next',
      ],
    },
  },

  debug: false,

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  build: {
    // vue-sonner v2+ поддерживает ESM нативно, transpile не нужен
    transpile: [],
  },

  devtools: { enabled: process.env.NODE_ENV === 'development' },
})

import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'

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
    serverBundle: {
      collections: ['lucide', 'streamline-plump', 'streamline-emojis', 'fluent-emoji-flat', 'line-md', 'simple-icons', 'gravity-ui', 'mdi', 'logos', 'ic', 'solar'],
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 256,
    },
  },

  site: {
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
    groups: [
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
        headers: {
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

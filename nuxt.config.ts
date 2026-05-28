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
    // 🔥 Отключаем Storybook в dev режиме
    ...(process.env.NODE_ENV === 'production' ? ['@nuxtjs/storybook'] : []),
  ],

  // @nuxt/fonts — font-display: swap убирает блокировку рендера шрифтами
  fonts: {
    defaults: {
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['cyrillic', 'latin'],
    },
    display: 'swap',
    // Предзагружаем шрифты для быстрого первого рендера
    preload: true,
  },

  // @nuxt/icon — оптимизируем иконки
  icon: {
    serverBundle: {
      collections: ['lucide', 'streamline-plump', 'streamline-emojis', 'fluent-emoji-flat'],
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
    payloadExtraction: false,
    renderJsonPayloads: false,
    componentIslands: true,
    treeshakeClientOnly: true,
    watcher: 'parcel',
  },

  features: {
    inlineStyles: false,
  },

  nitro: {
    routeRules: {
      // ─── Статические JS/CSS бандлы Nuxt (хешированные имена → immutable) ───
      '/_nuxt/**': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },

      // ─── Иконки и favicon (меняются редко → 1 год) ───────────────────────
      '/favicon.ico': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      '/favicon-16x16.png': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      '/favicon-32x32.png': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      '/apple-touch-icon.png': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      '/android-chrome-192x192.png': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },
      '/android-chrome-512x512.png': {
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      },

      // ─── OG-изображения (могут меняться → 1 неделя + SWR 30 дней) ────────
      '/og-*.jpeg': {
        headers: {
          'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
        },
      },
      '/og-*.png': {
        headers: {
          'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
        },
      },

      // ─── Web App Manifest и верификационные файлы ─────────────────────────
      '/site.webmanifest': {
        headers: { 'Cache-Control': 'public, max-age=604800' },
      },
      '/*.txt': {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      },
      '/*.html': {
        headers: { 'Cache-Control': 'public, max-age=86400' },
      },

      // ─── Прокси изображений из Supabase Storage ───────────────────────────
      '/api/image-proxy/**': {
        proxy: {
          to: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/**',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://gvsdevsvzgcivpphcuai.supabase.co',
            'Origin': 'https://gvsdevsvzgcivpphcuai.supabase.co',
          },
        },
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      '/__og-image__/**': {
        headers: {
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      },
      // 301 редиректы со старых URL на новые (дубли с одинаковыми заголовками)
      '/catalog/constructors/**': {
        redirect: {
          to: '/catalog/constructors-root/**',
          statusCode: 301,
        },
      },
      '/catalog/konstruktory-devochkam': {
        redirect: {
          to: '/catalog/constructors-root/konstruktory-devochkam',
          statusCode: 301,
        },
      },
      '/catalog/konstruktory-malchikam': {
        redirect: {
          to: '/catalog/constructors-root/konstruktory-malchikam',
          statusCode: 301,
        },
      },
      '/catalog/kovriki-pazly': {
        redirect: {
          to: '/catalog/kiddy/kovriki/kovriki-pazly',
          statusCode: 301,
        },
      },
      '/catalog/metallicheskie-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/metallicheskie-mashinki',
          statusCode: 301,
        },
      },
      '/catalog/katalki': {
        redirect: {
          to: '/catalog/kiddy/katalki',
          statusCode: 301,
        },
      },
      '/catalog/bizibordy': {
        redirect: { to: '/catalog/kiddy/bizibordy', statusCode: 301 },
      },
      '/catalog/mashinki': {
        redirect: { to: '/catalog/boys/mashinki', statusCode: 301 },
      },
      '/catalog/tolokar': {
        redirect: { to: '/catalog/kiddy/tolokar', statusCode: 301 },
      },
      '/catalog/batteries': {
        redirect: { to: '/catalog/accessories/batteries', statusCode: 301 },
      },
      '/catalog/kukly-aksessuary': {
        redirect: {
          to: '/catalog/girls/kukly/kukly-aksessuary',
          statusCode: 301,
        },
      },
      '/catalog/kukly': {
        redirect: {
          to: '/catalog/girls/kukly',
          statusCode: 301,
        },
      },
      '/catalog/kovriki': {
        redirect: {
          to: '/catalog/kiddy/kovriki',
          statusCode: 301,
        },
      },
      '/catalog/radioupravlyaemye-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
          statusCode: 301,
        },
      },
      '/catalog/rolevye-i-syuzhetnye-nabory': {
        redirect: {
          to: '/catalog/boys/rolevye-i-syuzhetnye-nabory',
          statusCode: 301,
        },
      },
      '/catalog/babies/katalki': {
        redirect: {
          to: '/catalog/kiddy/katalki',
          statusCode: 301,
        },
      },
      '/catalog/boys/cars/metallicheskie-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/metallicheskie-mashinki',
          statusCode: 301,
        },
      },
      '/catalog/boys/cars/radioupravlyaemye-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
          statusCode: 301,
        },
      },
      '/brand/polesie': { redirect: { to: '/brand/polese', statusCode: 301 } },
      '/brand/MG%20Toys': {
        redirect: { to: '/brand/mg-toys', statusCode: 301 },
      },
      '/': { swr: 600 },
      '/catalog': { swr: 1800 },
      '/catalog/products/**': {
        swr: 3600,
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        },
      },
      '/profile/**': {
        ssr: false,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      },
      '/notifications': {
        ssr: false,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      },
      '/checkout': {
        ssr: false,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      },
      '/cart': { ssr: false, headers: { 'X-Robots-Tag': 'noindex, nofollow' } },
      '/order/**': {
        ssr: false,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      },
      '/auth/magic': {
        ssr: false,
        headers: { 'X-Robots-Tag': 'noindex, nofollow' },
      },
    },
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
        lang: 'ru',
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
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '192x192',
          href: '/android-chrome-192x192.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '512x512',
          href: '/android-chrome-512x512.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=yes' },
        { name: 'theme-color', content: '#ffffff' },
        { name: 'msapplication-TileColor', content: '#ffffff' },
        {
          name: 'robots',
          content:
            'max-image-preview:large, max-snippet:-1, max-video-preview:-1',
        },
      ],
    },
  },

  supabase: {
    redirect: false,
    types: 'types/supabase.ts',
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
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
      // ─── Разбиваем большой бандл на мелкие чанки → параллельная загрузка ───
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Supabase в отдельный чанк (тяжёлая библиотека)
            if (id.includes('@supabase')) {
              return 'vendor-supabase'
            }
            // TanStack Query
            if (id.includes('@tanstack')) {
              return 'vendor-query'
            }
            // UI компоненты (radix, reka, shadcn)
            if (id.includes('radix-vue') || id.includes('reka-ui') || id.includes('shadcn')) {
              return 'vendor-ui'
            }
            // Embla carousel
            if (id.includes('embla-carousel')) {
              return 'vendor-carousel'
            }
            // VueUse
            if (id.includes('@vueuse')) {
              return 'vendor-vueuse'
            }
            // Pinia
            if (id.includes('pinia')) {
              return 'vendor-pinia'
            }
            // GSAP и анимации (грузим отложенно)
            if (id.includes('gsap') || id.includes('canvas-confetti')) {
              return 'vendor-animations'
            }
            // Lottie
            if (id.includes('lottie') || id.includes('dotlottie')) {
              return 'vendor-lottie'
            }
            // vue-sonner, maska и прочие утилиты
            if (id.includes('vue-sonner') || id.includes('maska') || id.includes('dompurify')) {
              return 'vendor-utils'
            }
          },
        },
      },
      // Поднимаем порог предупреждения о размере чанков
      chunkSizeWarningLimit: 600,
      // Минимизируем количество запросов через inlining мелких модулей
      modulePreload: { polyfill: false },
    },
    // Оптимизация зависимостей — предварительно собираем тяжёлые пакеты
    optimizeDeps: {
      include: [
        '@tanstack/vue-query',
        '@vueuse/core',
        'pinia',
      ],
      exclude: [
        'gsap',
        'vue3-lottie',
        '@lottiefiles/dotlottie-vue',
        'canvas-confetti',
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

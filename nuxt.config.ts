import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
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
  ],

  site: {
    url: 'https://uhti.kz',
    name: 'Ухтышка',
    // 🔥 Улучшенное описание для детских игрушек
    description: 'Интернет-магазин детских игрушек с быстрой доставкой по Казахстану. Развивающие игры, конструкторы, куклы, машинки, настольные игры.',
    defaultLocale: 'ru',
  },

  ogImage: {
    runtimeCacheStorage: true,
    defaults: {
      width: 1200,
      height: 630,
    },
    fonts: [
      'Inter:400',
      'Inter:700',
      'Inter:900',
    ],
  },

  schemaOrg: {
    identity: {
      type: 'Organization',
      name: 'Ухтышка',
      url: 'https://uhti.kz',
      logo: 'https://uhti.kz/logo.png',
      // 🔥 Улучшенное описание
      description: 'Интернет-магазин детских игрушек с широким ассортиментом качественных товаров и быстрой доставкой по Казахстану.',
      address: {
        addressCountry: 'KZ',
        addressLocality: 'Алматы',
      },
      contactPoint: {
        telephone: '+7-702-537-94-73',
        contactType: 'customer service',
        availableLanguage: ['ru', 'kk'],
      },
      sameAs: [
        // 🔥 Добавьте ссылки на соцсети когда создадите
        // 'https://www.instagram.com/uhtikz',
        // 'https://www.facebook.com/uhtikz',
        // 'https://t.me/uhtikz',
      ],
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
    ],
    // 🔥 Настройки по умолчанию для sitemap
    defaults: {
      changefreq: 'daily',
      priority: 0.7,
    },
  },

  robots: {
    groups: [
      {
        userAgent: ['*'],
        allow: [
          '/',
          '/catalog/**',
          '/brand/**',
        ],
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
          '/api/**',
          '/_nuxt/**', // 🔥 Добавил _nuxt
          // 🔥 ИСПРАВЛЕНО: убрал '/*?*' - это блокирует фильтры в каталоге!
        ],
      },
      // 🔥 Специальные правила для Яндекса
      {
        userAgent: ['Yandex'],
        allow: [
          '/',
          '/catalog/**',
          '/brand/**',
        ],
        disallow: [
          '/admin',
          '/api/**',
          '/profile',
        ],
        crawlDelay: 1,
      },
    ],
    sitemap: [
      'https://uhti.kz/sitemap.xml',
    ],
  },

  nitro: {
    routeRules: {
      // 🔥 Главная страница - короткий кеш (часто меняется)
      '/': {
        swr: 600, // 10 минут
        headers: {
          'Cache-Control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=1200',
        },
      },

      // 🔥 Каталог - средний кеш
      '/catalog': {
        swr: 1800, // 30 минут
        headers: {
          'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600',
        },
      },

      // 🔥 Страницы товаров - длинный кеш (редко меняются)
      '/catalog/products/**': {
        swr: 3600, // 1 час
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=7200',
        },
      },

      // 🔥 Категории - средний кеш
      '/catalog/**': {
        swr: 1800, // 30 минут
        headers: {
          'Cache-Control': 'public, max-age=1800, s-maxage=1800, stale-while-revalidate=3600',
        },
      },

      // Image proxy
      '/api/image-proxy/**': {
        proxy: {
          to: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/**', // 🔥 Добавил /v1/object/public
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

      // OG Image эндпоинт
      '/__og-image__/**': {
        headers: {
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      },

      // 🔥 Статические страницы (создайте их позже)
      '/about': {
        prerender: false,
        swr: 86400, // 24 часа - редко меняется
      },
      '/contacts': {
        prerender: false,
        swr: 86400, // 24 часа
      },

      // Защищенные страницы без SSR
      '/profile/**': { ssr: false },
      '/checkout': { ssr: false },
      '/cart': { ssr: false },
      '/order/**': { ssr: false },
      '/admin/**': { ssr: false }, // 🔥 Добавил админку
    },

    compressPublicAssets: true,
    minify: true,

    // 🔥 Prerender важных страниц при билде
    prerender: {
      crawlLinks: true,
      routes: [
        '/',
        '/catalog',
      ],
    },
  },

  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    // 🔥 Оптимизация изображений
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
        // Preconnect
        {
          rel: 'preconnect',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
          crossorigin: 'anonymous',
        },
        {
          rel: 'dns-prefetch',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
        },

        // Favicon для разных устройств и браузеров
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },

        // Apple Touch Icon
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },

        // Android Chrome
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/android-chrome-192x192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/android-chrome-512x512.png' },

        // Web App Manifest
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=5' }, // 🔥 Добавил maximum-scale
        { name: 'format-detection', content: 'telephone=yes' }, // 🔥 Изменил на yes для e-commerce

        // Тема для мобильных браузеров
        { name: 'theme-color', content: '#ffffff' },
        { name: 'msapplication-TileColor', content: '#ffffff' },

        // 🔥 Мобильная оптимизация
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Ухтышка' },
      ],
    },
  },

  supabase: {
    redirect: false,
    types: 'types/supabase.ts',
  },

  css: ['~/assets/css/tailwind.css'],

  vite: {
    plugins: [tailwindcss()],
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true, // 🔥 Добавил удаление debugger
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router'],
            'supabase-vendor': ['@supabase/supabase-js'],
          },
        },
      },
    },
  },

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  build: {
    transpile: ['vue-sonner'],
  },

  // 🔥 Экспериментальные функции для производительности
  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    viewTransition: true,
  },

  devtools: { enabled: true },
})

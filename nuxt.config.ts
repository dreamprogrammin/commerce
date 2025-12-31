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
    '@nuxtjs/storybook',
  ],

  site: {
    url: 'https://uhti.kz',
    name: 'Ухтышка',
    description: 'Интернет-магазин с широким ассортиментом игрушек.',
    defaultLocale: 'ru',
  },
  ogImage: {
    // Включаем кеширование
    runtimeCacheStorage: true,
    defaults: {
      width: 1200,
      height: 630,
    },
    // 🔥 ВАЖНО: Явно указываем шрифты для Satori
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
      description: 'Интернет-магазин с широким ассортиментом качественных игрушек.',
      address: {
        addressCountry: 'KZ',
        addressLocality: 'Алматы',
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
    ],
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
          '/*?*',
        ],
      },
    ],
    sitemap: [
      'https://uhti.kz/sitemap.xml',
    ],
  },

  nitro: {
    routeRules: {
      '/api/image-proxy/**': {
        proxy: {
          to: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/**',
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
      // 🔥 Правило для OG Image эндпоинта
      '/__og-image__/**': {
        headers: {
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      },
      '/': { swr: 600 }, // 10 мин - часто меняется
      '/catalog': { swr: 1800 }, // 30 мин - средне
      '/catalog/products/**': { swr: 3600 }, // 1 час - редко
      // 🔥 Отключаем prerender для несуществующих страниц
      '/about': { prerender: false },
      '/contacts': { prerender: false },
      '/profile/**': {
        ssr: false, // Отключаем серверный рендеринг
      },

      // Отключаем для других защищенных страниц
      '/checkout': {
        ssr: false,
      },
      '/cart': {
        ssr: false,
      },
      '/order/**': {
        ssr: false,
      },
    },
    compressPublicAssets: true,
    minify: true,
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
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=yes' },

        // Тема для мобильных браузеров (можете изменить цвет)
        { name: 'theme-color', content: '#ffffff' },
        { name: 'msapplication-TileColor', content: '#ffffff' },
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
          drop_console: false, // ⚠️ ВРЕМЕННО отключено для отладки realtime
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

  devtools: { enabled: true },
})
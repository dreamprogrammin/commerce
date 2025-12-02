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
  ],

  site: {
    url: 'https://commerce-eta-wheat.vercel.app',
    name: 'Ваш магазин',
    description: 'Интернет-магазин с широким ассортиментом товаров.',
    defaultLocale: 'ru',
  },

  sitemap: {
    sources: ['/api/sitemap-routes'], // Твой динамический генератор товаров (который мы обсуждали ранее)
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
      '/search', // Поиск обязательно исключаем из карты
    ],
  },

  // 2. НАСТРОЙКА ROBOTS.TXT
  // Говорим ботам: "Сюда даже не заходите, не тратьте время"
  robots: {
    groups: [
      {
        userAgent: ['*'],
        // Разрешаем только полезный контент
        allow: [
          '/',
          '/catalog/**',
          '/brand/**', // У тебя есть папка brand, её нужно разрешить
        ],
        // Блокируем технические разделы
        disallow: [
          '/admin',
          '/confirm',
          '/forgot-password',
          '/order', // Историю заказов индексировать нельзя
          '/profile',
          '/register',
          '/reset-password',
          '/cart',
          '/checkout',
          '/search',
          '/api/**', // API энпоинты тоже не нужны в поиске
          '/*?*',
        ],
      },
    ],
    sitemap: [
      'https://commerce-eta-wheat.vercel.app/sitemap.xml',
    ],
  },

  // 🛡️ Настройки для обхода Cloudflare и оптимизации изображений
  nitro: {
    routeRules: {
      // Проксируем запросы к Supabase через наш сервер
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
    },
    // Сжатие ответов
    compressPublicAssets: true,
    // Минификация
    minify: true,
  },

  // 🖼️ Базовая настройка изображений
  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
  },

  // 🚀 App настройки
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
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=no' },
      ],
    },
  },

  // 📦 Supabase
  supabase: {
    redirect: false,
    types: 'types/supabase.ts',
  },

  // 🎨 Стили
  css: ['~/assets/css/tailwind.css'],

  // ⚡ Vite оптимизации
  vite: {
    plugins: [tailwindcss()],
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
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

  // 🎯 Shadcn UI
  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  // 🏗️ Build оптимизации
  build: {
    transpile: ['vue-sonner'],
  },

  devtools: { enabled: true },
})

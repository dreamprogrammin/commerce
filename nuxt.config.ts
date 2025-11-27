import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/supabase',
    'shadcn-nuxt',
    'pinia-plugin-persistedstate/nuxt',
    '@nuxt/icon',
  ],

  // 🎯 КРИТИЧНАЯ ОПТИМИЗАЦИЯ: Route Rules для разных страниц
  routeRules: {
    // Каталог - SSR с кешированием (для SEO)
    // В DEV кеш отключен для Tailwind CSS 4
    '/catalog': import.meta.env.NODE_ENV === 'production'
      ? {
          ssr: true,
          swr: 60 * 5, // Кеш на 5 минут (только в production)
          prerender: false,
        }
      : {
          ssr: true, // В dev без кеша
        },

    // API роуты - кешируем агрессивно
    '/api/**': {
      cors: true,
      cache: {
        maxAge: 60 * 60, // 1 час
        swr: true,
      },
    },

    // Статичные страницы - можно пререндерить
    '/': { prerender: true },
    '/about': { prerender: true },
    '/contacts': { prerender: true },

    // Детальные страницы товаров - ISR
    '/catalog/**': import.meta.env.NODE_ENV === 'production'
      ? { ssr: true, swr: 60 * 5 }
      : { ssr: true },

    // Товары - ISR + длинный кеш
    '/catalog/products/**': import.meta.env.NODE_ENV === 'production'
      ? { ssr: true, swr: 60 * 10 }
      : { ssr: true },
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
  // НЕ используем провайдеры - у нас своя система через useSupabaseStorage
  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    // Остальное не нужно - твой composable всё делает
  },

  // 🚀 App настройки
  app: {
    head: {
      link: [
        // Preconnect к Supabase для быстрых запросов
        {
          rel: 'preconnect',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
          crossorigin: 'anonymous',
        },
        {
          rel: 'dns-prefetch',
          href: 'https://gvsdevsvzgcivpphcuai.supabase.co',
        },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },

  // 📦 Supabase
  supabase: {
    redirect: false,
    baseURL: `${import.meta.env.NUXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`,
    types: 'types/supabase.ts',
  },

  // 🎨 Стили
  css: ['~/assets/css/tailwind.css'],

  // ⚡ Vite оптимизации
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Минификация
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // Убираем console.log в продакшене
        },
      },
      // Разделение чанков
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

  // 🔧 Experimental features для производительности
  experimental: {
    payloadExtraction: true, // Извлекает данные в отдельные файлы
    renderJsonPayloads: true, // JSON вместо JS для пейлоадов
    viewTransition: true, // View Transitions API
  },

  // 🏗️ Build оптимизации
  build: {
    transpile: ['vue-sonner'], // Транспилируем для совместимости
  },

  devtools: { enabled: true },
})

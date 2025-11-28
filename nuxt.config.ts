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
  ],

  // 🎯 ОПТИМИЗИРОВАННЫЕ Route Rules
  routeRules: {
    // 1️⃣ Главная страница - статика
    '/': { prerender: true },

    // 2️⃣ Каталог - SSR с агрессивным кешем в production
    '/catalog/**': import.meta.env.NODE_ENV === 'production'
      ? {
          ssr: true,
          swr: 60 * 10, // 🆕 Увеличен кеш до 10 минут
          isr: true, // 🆕 Incremental Static Regeneration
        }
      : {
          ssr: true,
          // В dev режиме НЕ кешируем
        },

    // 3️⃣ SPA страницы (интерактивные)
    '/cart/**': { ssr: false },
    '/checkout/**': { ssr: false },
    '/profile/**': { ssr: false },
    '/admin/**': { ssr: false },

    // 4️⃣ API роуты с оптимизацией
    '/api/**': {
      cors: true,
      headers: {
        'Cache-Control': import.meta.env.NODE_ENV === 'production'
          ? 'public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400' // 🆕 Добавлен stale-while-revalidate
          : 'no-cache',
      },
    },
  },

  // 🛡️ Nitro настройки
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
    },
    compressPublicAssets: true,
    minify: true,
    // 🆕 Оптимизация памяти
    prerender: {
      concurrency: 10, // Ограничение одновременных запросов при prerender
      interval: 50, // Интервал между запросами
    },
  },

  // 🖼️ Изображения
  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    // 🆕 Оптимизация изображений
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
    quality: 80, // Баланс между качеством и размером
    format: ['webp'], // Приоритет современным форматам
  },

  // 🚀 App настройки
  app: {
    head: {
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
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
    // ⚡ Улучшенные переходы
    pageTransition: {
      name: 'page',
      mode: 'out-in',
      // 🆕 Быстрые переходы
      duration: 150,
    },
    keepalive: false,
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
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug'], // 🆕 Удаляем логи
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router'],
            'supabase-vendor': ['@supabase/supabase-js'],
            'ui-vendor': ['lucide-vue-next', 'reka-ui'], // 🆕 Разделение UI библиотек
          },
        },
      },
    },
    // 🆕 Оптимизация dev сервера
    server: {
      hmr: {
        overlay: false, // Отключаем оверлей ошибок для лучшей производительности
      },
    },
  },

  // 🎯 Shadcn UI
  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  // 🔧 Experimental features
  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    viewTransition: true,
    // 🆕 Экспериментальные оптимизации
    componentIslands: true, // Изолированные компоненты
    sharedPrerenderData: true, // Переиспользование данных при prerender
  },

  // 🏗️ Build оптимизации
  build: {
    transpile: ['vue-sonner'],
  },

  // 🆕 Настройка router для лучшей производительности
  router: {
    options: {
      scrollBehaviorType: 'smooth', // Плавный скролл
    },
  },

  devtools: { enabled: true },
})

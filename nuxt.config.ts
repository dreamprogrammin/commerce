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

  // 🎯 КРИТИЧНАЯ ОПТИМИЗАЦИЯ: Route Rules для разных страниц
  routeRules: {
    // 1️⃣ Главная страница - статика
    '/': { prerender: true },

    // 2️⃣ Товары - СНАЧАЛА более специфичные правила
    '/catalog/products/**': import.meta.env.NODE_ENV === 'production'
      ? { ssr: true, swr: 60 * 10 } // 10 минут для карточек товаров
      : { ssr: true },

    // 3️⃣ Потом общее правило для каталога (НЕ перекроет /products/**)
    '/catalog/**': import.meta.env.NODE_ENV === 'production'
      ? { ssr: true, swr: 60 * 5 } // 5 минут для категорий/фильтров
      : { ssr: true },

    // 4️⃣ SPA страницы (интерактивные)
    '/cart/**': { ssr: false },
    '/checkout/**': { ssr: false },
    '/profile/**': { ssr: false },
    '/admin/**': { ssr: false },

    // 5️⃣ API роуты
    '/api/**': {
      cors: true,
      cache: {
        maxAge: 60 * 60, // 1 час
        swr: true,
      },
    },
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

  // 🔧 Experimental features для производительности
  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    viewTransition: true,
  },

  // 🏗️ Build оптимизации
  build: {
    transpile: ['vue-sonner'],
  },

  devtools: { enabled: true },
})
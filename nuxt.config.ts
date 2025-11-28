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

  // 🎯 ИСПРАВЛЕННЫЕ Route Rules
  routeRules: {
    // 1️⃣ Главная страница - статика
    '/': { prerender: true },

    // 2️⃣ Каталог - УБИРАЕМ SWR для dev, оставляем SSR
    '/catalog/**': import.meta.env.NODE_ENV === 'production'
      ? {
          ssr: true,
          swr: 60 * 5, // 5 минут кеш только в production
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

    // 4️⃣ API роуты
    '/api/**': {
      cors: true,
      headers: {
        'Cache-Control': import.meta.env.NODE_ENV === 'production'
          ? 'public, max-age=3600, s-maxage=3600'
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
  },

  // 🖼️ Изображения
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
    // ⚡ ДОБАВЛЯЕМ: Настройки для корректных переходов
    pageTransition: { name: 'page', mode: 'out-in' },
    keepalive: false, // Отключаем keepalive для catalog страниц
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

  // 🔧 Experimental features
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

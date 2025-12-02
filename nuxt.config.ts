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
    '@nuxtjs/seo',
  ],

  // 🔍 SEO Configuration
  site: {
    url: 'https://commerce-eta-wheat.vercel.app',
    name: 'Ваш магазин',
    description: 'Описание вашего интернет-магазина с широким ассортиментом товаров',
    defaultLocale: 'ru',
  },

  // 🤖 Robots.txt конфигурация
  robots: {
    // Правила для всех ботов
    groups: [
      {
        userAgent: ['*'],
        disallow: ['/admin', '/api', '/profile', '/checkout'],
        allow: ['/'],
      },
    ],
    // Ссылка на sitemap
    sitemap: 'https://commerce-eta-wheat.vercel.app/sitemap.xml',
  },

  // 🗺️ Sitemap конфигурация
  sitemap: {
    // Автоматическое определение страниц
    autoLastmod: true,
    // Приоритеты страниц
    defaults: {
      changefreq: 'daily',
      priority: 0.8,
    },
    // Исключения
    exclude: [
      '/admin/**',
      '/profile/**',
      '/checkout/**',
    ],
    // Добавь статические URL если нужно
    urls: [
      {
        loc: '/',
        lastmod: new Date(),
        changefreq: 'daily',
        priority: 1.0,
      },
      {
        loc: '/about',
        changefreq: 'monthly',
        priority: 0.8,
      },
    ],
  },

  // 🔗 Open Graph
  ogImage: {
    enabled: true,
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
      // SEO оптимизация для статических страниц
      '/': { prerender: true },
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
        // Favicon
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

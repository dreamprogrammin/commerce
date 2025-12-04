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
    'nuxt-schema-org', // ✅ Уже добавлен
    '@nuxt/fonts',
  ],

  site: {
    url: 'https://commerce-eta-wheat.vercel.app',
    name: 'Ваш магазин',
    description: 'Интернет-магазин с широким ассортиментом товаров.',
    defaultLocale: 'ru',
  },

  // 🆕 НАСТРОЙКА SCHEMA.ORG
  schemaOrg: {
    identity: {
      type: 'Organization', // или 'LocalBusiness' если физический магазин
      name: 'Ваш магазин',
      url: 'https://commerce-eta-wheat.vercel.app',
      logo: 'https://commerce-eta-wheat.vercel.app/logo.png', // Добавь свой логотип
      description: 'Интернет-магазин с широким ассортиментом качественных товаров.',
      address: {
        addressCountry: 'KZ',
        addressLocality: 'Алматы',
        // addressRegion: 'Алматинская область', // Опционально
        // postalCode: '050000', // Опционально
        // streetAddress: 'ул. Примерная, 123', // Опционально
      },
      contactPoint: {
        telephone: '+7-702-537-94-73', // Замени на свой
        contactType: 'customer service',
        availableLanguage: ['ru', 'kk'],
      },
      sameAs: [
        // Твои соцсети (если есть)
        // 'https://www.facebook.com/yourshop',
        // 'https://www.instagram.com/yourshop',
        // 'https://vk.com/yourshop',
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
      'https://commerce-eta-wheat.vercel.app/sitemap.xml',
    ],
  },

  fonts: {
    families: [
      // Google Fonts
      { name: 'Onest', provider: 'google' },
      // Или если хотите использовать системные шрифты
      // { name: 'Inter', provider: 'google' },
    ],
    defaults: {
      weights: [400, 500, 600, 700],
      styles: ['normal'],
    },
  },

  // ... остальная конфигурация без изменений

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

  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
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
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=no' },
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

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
    mode: 'svg', // Принудительно используем SVG для уменьшения нагрузки на JS
    serverBundle: {
      collections: ['lucide', 'streamline-plump', 'streamline-emojis', 'fluent-emoji-flat'],
    },
    clientBundle: {
      scan: true,
      sizeLimitKb: 128, // Уменьшаем лимит для бандла
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
      {
        userAgent: ['Yandex'],
        cleanParam: [
          'sort_by',
          'page',
        ],
      },
    ],
    sitemap: ['https://uhti.kz/sitemap.xml'],
  },

  experimental: {
    payloadExtraction: true,
    renderJsonPayloads: true,
    componentIslands: true,
    treeshakeClientOnly: true,
    watcher: 'parcel',
  },

  features: {
    // Отключаем inlineStyles для корректной работы Tailwind 4 и уменьшения HTML
    inlineStyles: false,
  },

  nitro: {
    routeRules: {
      '/_nuxt/**': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      },
      '/sw.js': {
        headers: { 'Content-Type': 'application/javascript' },
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
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#ffffff' },
        {
          name: 'robots',
          content: 'max-image-preview:large, max-snippet:-1, max-video-preview:-1',
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
    build: {
      cssMinify: 'lightningcss',
      rollupOptions: {
        output: {
          // Упрощенное разбиение для предотвращения ReferenceError
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('gsap'))
                return 'vendor-gsap'
              if (id.includes('lottie') || id.includes('dotlottie'))
                return 'vendor-lottie'
              if (id.includes('embla-carousel'))
                return 'vendor-carousel'
              return 'vendor'
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    // Оптимизируем зависимости
    optimizeDeps: {
      include: [
        'gsap',
        'embla-carousel',
        '@tanstack/vue-query',
        'lucide-vue-next',
      ],
    },
  },

  debug: false,

  devtools: { enabled: process.env.NODE_ENV === 'development' },
})

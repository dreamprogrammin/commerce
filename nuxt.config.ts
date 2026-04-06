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
      '/about',
      '/brands',
      '/contacts',
      '/privacy-policy',
      '/auth/**',
    ],
  },

  robots: {
    groups: [
      {
        userAgent: ['*'],
        allow: ['/', '/catalog/**', '/brand/**', '/*?brand=*'],
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
          '/*?*',
        ],
      },
      // Yandex-специфичная конфигурация для очистки параметров фильтров
      {
        userAgent: ['Yandex'],
        cleanParam: [
          // Сортировка и пагинация
          'sort_by',
          'page',

          // Фильтры каталога
          'brands',
          'subcategories',
          'materials',
          'countries',
          'price_min',
          'price_max',

          // Динамические атрибуты (возраст, размер и т.д.)
          'attr_age',
          'attr_size',
          'attr_color',
          'attr_material',
          'attr_gender',

          // UTM метки и tracking
          'utm_source',
          'utm_medium',
          'utm_campaign',
          'utm_content',
          'utm_term',
          'fbclid',
          'gclid',
          'yclid',
        ],
      },
    ],
    sitemap: ['https://uhti.kz/sitemap.xml'],
  },

  nitro: {
    routeRules: {
      '/api/image-proxy/**': {
        proxy: {
          to: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/**',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
      '/__og-image__/**': {
        headers: {
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      },
      // 301 редиректы со старых URL на новые (дубли с одинаковыми заголовками)
      '/catalog/konstruktory-devochkam': {
        redirect: {
          to: '/catalog/constructors-root/konstruktory-devochkam',
          statusCode: 301,
        },
      },
      '/catalog/bizibordy': {
        redirect: { to: '/catalog/kiddy/bizibordy', statusCode: 301 },
      },
      '/catalog/mashinki': {
        redirect: { to: '/catalog/boys/mashinki', statusCode: 301 },
      },
      '/catalog/tolokar': {
        redirect: { to: '/catalog/kiddy/tolokar', statusCode: 301 },
      },
      '/catalog/batteries': {
        redirect: { to: '/catalog/accessories/batteries', statusCode: 301 },
      },
      '/catalog/kukly-aksessuary': {
        redirect: {
          to: '/catalog/girls/kukly/kukly-aksessuary',
          statusCode: 301,
        },
      },
      '/catalog/boys/cars/metallicheskie-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/metallicheskie-mashinki',
          statusCode: 301,
        },
      },
      '/catalog/boys/cars/radioupravlyaemye-mashinki': {
        redirect: {
          to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
          statusCode: 301,
        },
      },
      '/brand/polesie': { redirect: { to: '/brand/polese', statusCode: 301 } },
      '/brand/MG%20Toys': {
        redirect: { to: '/brand/mg-toys', statusCode: 301 },
      },
      '/': { swr: 600 },
      '/catalog': { swr: 1800 },
      '/catalog/products/**': { swr: 300 },
      '/profile/**': {
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
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '16x16',
          href: '/favicon-16x16.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '32x32',
          href: '/favicon-32x32.png',
        },
        {
          rel: 'apple-touch-icon',
          sizes: '180x180',
          href: '/apple-touch-icon.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '192x192',
          href: '/android-chrome-192x192.png',
        },
        {
          rel: 'icon',
          type: 'image/png',
          sizes: '512x512',
          href: '/android-chrome-512x512.png',
        },
        { rel: 'manifest', href: '/site.webmanifest' },
      ],
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'format-detection', content: 'telephone=yes' },
        { name: 'theme-color', content: '#ffffff' },
        { name: 'msapplication-TileColor', content: '#ffffff' },
        {
          name: 'robots',
          content:
            'max-image-preview:large, max-snippet:-1, max-video-preview:-1',
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
    server: {
      hmr: {
        protocol: 'ws',
        host: 'localhost',
      },
    },
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false,
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

  debug: process.env.NODE_ENV === 'development',

  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },

  build: {
    transpile: ['vue-sonner'],
  },

  devtools: { enabled: true },
})

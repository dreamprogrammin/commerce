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
  ],
  // 🛡️ Настройки для обхода Cloudflare и оптимизации изображений
  nitro: {
    routeRules: {
    // Проксируем запросы к Supabase через наш сервер
      '/api/image-proxy/**': {
        proxy: {
          to: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/**',
          // Добавляем правильные заголовки
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
  },
  image: {
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
    alias: {
      supabase: 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public',
    },
    format: ['webp', 'avif', 'jpeg'],
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
    // Preload критичные изображения
    preload: {
      fetchpriority: 'high',
    },
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
    },
  },

  // image: {
  //   domains: ['https://gvsdevsvzgcivpphcuai.supabase.co'],
  // },
  supabase: {
    redirect: false,
    baseURL: `${import.meta.env.NUXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`,
    types: 'types/supabase.ts',
  },
  css: ['~/assets/css/tailwind.css'],
  vite: {
    plugins: [tailwindcss()],
  },
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: './components/ui',
  },
  devtools: { enabled: true },
})

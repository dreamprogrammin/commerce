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
  image: {
    // Определяем кастомный провайдер для Supabase
    providers: {
      supabase: {
        provider: './providers/supabase',
        options: {
          baseURL: `${import.meta.env.NUXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public`,
        },
      },
    },

    // Разрешённые домены для загрузки изображений
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],

    // Настройки качества по умолчанию
    quality: 80,

    // Форматы изображений (современные форматы для лучшего сжатия)
    format: ['webp', 'avif', 'jpeg'],

    // Настройки для разных breakpoints
    screens: {
      xs: 320,
      sm: 640,
      md: 768,
      lg: 1024,
      xl: 1280,
      xxl: 1536,
    },
  },

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

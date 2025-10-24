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
    // Настройка кастомного провайдера для Supabase
    providers: {
      supabase: {
        provider: '~/providers/supabase.ts',
        options: {
          baseURL: `${import.meta.env.NUXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public`,
        },
      },
    },
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'],
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

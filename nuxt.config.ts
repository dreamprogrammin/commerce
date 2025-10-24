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
    provider: 'ipx', // 👈 Добавьте эту строку - бесплатный провайдер
    domains: ['gvsdevsvzgcivpphcuai.supabase.co'], // 👈 Уберите https://
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

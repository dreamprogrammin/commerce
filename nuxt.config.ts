// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  modules: [
    "@pinia/nuxt",
    "pinia-plugin-persistedstate/nuxt",
    "@nuxtjs/supabase",
  ],
  runtimeConfig: {
    
  },
  plugins: ["~/plugins/pinia-persistedstate.client.ts"],
  devtools: { enabled: true },
});

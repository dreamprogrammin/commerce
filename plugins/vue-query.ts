import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  // 🔥 Конфигурация QueryClient
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 минут - данные свежие
        gcTime: 10 * 60 * 1000, // 10 минут - время жизни в кэше
        refetchOnWindowFocus: false, // Не перезагружать при фокусе окна
        refetchOnReconnect: false, // ✅ ИСПРАВЛЕНО: Не перезагружать при возврате из фона
        retry: 1, // Одна попытка повтора
      },
    },
  })

  const options: VueQueryPluginOptions = { queryClient }

  nuxt.vueApp.use(VueQueryPlugin, options)

  // 🔥 Гидратация на клиенте (для SSR)
  if (import.meta.client) {
    if (vueQueryState.value) {
      hydrate(queryClient, vueQueryState.value)
    }
  }

  // 🔥 Дегидратация на сервере (для SSR)
  if (import.meta.server) {
    nuxt.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }
})

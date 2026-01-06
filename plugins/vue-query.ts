import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  // 🔥 Конфигурация QueryClient
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 минут - данные свежие
        gcTime: 10 * 60 * 1000, // 10 минут - время жизни в кэше
        refetchOnWindowFocus: false, // Не перезагружать при фокусе окна
        refetchOnReconnect: false, // Не перезагружать при переподключении
        refetchOnMount: false, // ✅ Не перезагружать при монтировании компонента
        retry: false, // ✅ ИСПРАВЛЕНО: Отключаем retry - причина зависания
        retryOnMount: false, // ✅ Не повторять неудачные запросы при монтировании
        networkMode: 'online', // ✅ Запросы только в онлайн режиме
      },
    },
  })

  const options: VueQueryPluginOptions = { queryClient }

  nuxt.vueApp.use(VueQueryPlugin, options)

  // 🔥 Гидратация на клиенте (для SSR)
  if (import.meta.client) {
    // ✅ Настройка persistence в localStorage
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: 'tanstack-query-cache',
      throttleTime: 1000, // Сохранять не чаще раза в секунду
    })

    persistQueryClient({
      queryClient,
      persister,
      maxAge: 1000 * 60 * 60 * 24, // 24 часа - максимальный возраст кеша в localStorage
      dehydrateOptions: {
        // Сохраняем только успешные запросы
        shouldDehydrateQuery: (query) => {
          return query.state.status === 'success'
        },
      },
    })

    // Гидратация из SSR state (приоритет над localStorage)
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

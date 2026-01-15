import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'


export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  // 🔥 ИСПРАВЛЕННАЯ конфигурация QueryClient
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 минут - данные свежие
        gcTime: 10 * 60 * 1000, // 10 минут - время жизни в кэше
        refetchOnWindowFocus: true, // ✅ ИСПРАВЛЕНО: Проверять при возврате на вкладку
        refetchOnReconnect: true, // ✅ ИСПРАВЛЕНО: Проверять при переподключении
        refetchOnMount: true, // ✅ ИСПРАВЛЕНО: Разрешить refetch при монтировании (можно переопределить локально)
        retry: 1, // ✅ ИСПРАВЛЕНО: Одна попытка повтора вместо полного отключения
        retryDelay: 1000, // 1 секунда между попытками
        networkMode: 'online', // Запросы только в онлайн режиме
      },
    },
  })

  const options: VueQueryPluginOptions = { queryClient }

  nuxt.vueApp.use(VueQueryPlugin, options)

  // 🔥 Гидратация на клиенте (для SSR)
  if (import.meta.client) {
    // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сначала гидратируем SSR state, ПОТОМ persistence
    if (vueQueryState.value) {
      hydrate(queryClient, vueQueryState.value)
    }

    // ✅ Настройка persistence в localStorage (ПОСЛЕ гидратации SSR)
    const persister = createAsyncStoragePersister({
      storage: window.localStorage,
      key: 'tanstack-query-cache',
      throttleTime: 1000,
      serialize: JSON.stringify,    // Явная сериализация
      deserialize: JSON.parse,       // Явная десериализация
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
  }

  // 🔥 Дегидратация на сервере (для SSR)
  if (import.meta.server) {
    nuxt.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }

  // ✅ Экспортируем queryClient для доступа из других мест
  return {
    provide: {
      queryClient,
    },
  }
})
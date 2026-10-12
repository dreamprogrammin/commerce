import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { withoutUpdateTimes } from '@/utils/stableQueryState'

export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>('vue-query')

  // Optimized QueryClient configuration
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
        retry: 1,
        retryDelay: 1000,
        networkMode: 'online',
      },
    },
  })

  const options: VueQueryPluginOptions = { 
    queryClient,
    enableDevtoolsV6Plugin: false,
  }

  nuxt.vueApp.use(VueQueryPlugin, options)

  // Hydration on client (for SSR)
  if (import.meta.client && vueQueryState.value) {
    hydrate(queryClient, vueQueryState.value)
  }

  // Dehydration on server (for SSR). Без времени запроса: иначе две пересборки
  // страницы никогда не совпадают и каждая — платная запись ISR
  // (utils/stableQueryState.ts).
  if (import.meta.server) {
    nuxt.hooks.hook('app:rendered', () => {
      vueQueryState.value = withoutUpdateTimes(dehydrate(queryClient))
    })
  }

  return {
    provide: {
      queryClient,
    },
  }
})

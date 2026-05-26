import type { DehydratedState, VueQueryPluginOptions } from '@tanstack/vue-query'
import { dehydrate, hydrate, QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

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

  // Dehydration on server (for SSR)
  if (import.meta.server) {
    nuxt.hooks.hook('app:rendered', () => {
      vueQueryState.value = dehydrate(queryClient)
    })
  }

  return {
    provide: {
      queryClient,
    },
  }
})

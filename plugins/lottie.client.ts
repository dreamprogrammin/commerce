export default defineNuxtPlugin(() => {
  // Defer Lottie loading until needed
  if (import.meta.client) {
    const requestIdleCallback = globalThis.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 1))
    
    requestIdleCallback(async () => {
      const Vue3Lottie = await import('vue3-lottie').then(m => m.default)
      const nuxtApp = useNuxtApp()
      nuxtApp.vueApp.use(Vue3Lottie)
    })
  }
})

// Middleware для редиректа с trailing slash на версию без него
export default defineNuxtRouteMiddleware((to) => {
  // Проверяем на сервере и клиенте
  if (to.path.endsWith('/') && to.path.length > 1) {
    const pathWithoutSlash = to.path.slice(0, -1)
    return navigateTo({
      path: pathWithoutSlash,
      query: to.query,
      hash: to.hash,
    }, { redirectCode: 301 })
  }
})

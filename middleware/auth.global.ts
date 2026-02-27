import { useProfileStore } from '@/stores/core/profileStore'
// middleware/auth.global.ts
import { useModalStore } from '@/stores/modal/useModalStore'

export default defineNuxtRouteMiddleware(async (to, from) => {
  // ✅ Пропускаем на сервере - проверка только на клиенте
  if (import.meta.server) {
    return
  }

  // Пути, требующие авторизации
  const protectedPaths = [
    '/profile/**',
    '/notifications',
  ]

  const isProtectedPath = protectedPaths.some(path => to.path.startsWith(path))

  // Если это НЕ защищенный путь - пропускаем
  if (!isProtectedPath) {
    // Проверка для страниц входа/регистрации
    const user = useSupabaseUser()
    if (user.value && ['/login', '/register'].includes(to.path)) {
      return navigateTo('/')
    }
    return
  }

  // ✅ Для защищенных путей проверяем авторизацию
  console.log('[Auth Middleware] Checking auth for protected route:', to.path)

  const user = useSupabaseUser()

  // ✅ ВАЖНО: Даем время на инициализацию после OAuth редиректа
  if (!user.value) {
    // Определяем, пришли ли мы из OAuth: в URL есть code (PKCE) или access_token (implicit)
    const isOAuthCallback = !!(
      to.query.code
      || to.query.access_token
      || (to.hash && to.hash.includes('access_token'))
    )

    // При OAuth-редиректе ждём дольше — Supabase обменивает code на токен асинхронно
    const maxWaitMs = isOAuthCallback ? 3000 : 300
    const pollIntervalMs = 100

    console.log('[Auth Middleware] No user detected, waiting for auth...', {
      isOAuthCallback,
      maxWaitMs,
    })

    let waited = 0
    while (!user.value && waited < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
      waited += pollIntervalMs
    }

    if (!user.value) {
      console.log('[Auth Middleware] Still no user after', waited, 'ms, redirecting to home')

      const modalStore = useModalStore()
      modalStore.openLoginModal()

      return navigateTo('/')
    }

    console.log('[Auth Middleware] User appeared after', waited, 'ms')
  }

  console.log('[Auth Middleware] User authenticated:', user.value.id)

  // ✅ ИСПРАВЛЕНО: НЕ ждем загрузку профиля - просто запускаем если нужно
  const profileStore = useProfileStore()

  console.log('[Auth Middleware] Profile state:', {
    exists: !!profileStore.profile,
    loading: profileStore.isLoading,
  })

  // Если профиля нет И он НЕ загружается - запускаем загрузку (не ждем)
  if (!profileStore.profile && !profileStore.isLoading) {
    console.log('[Auth Middleware] Starting profile load (not awaiting)...')

    // ✅ Не ждем результат - пусть загружается в фоне
    profileStore.loadProfile(false, true).catch((error) => {
      console.error('[Auth Middleware] Profile load error:', error)
    })
  }

  // ✅ Разрешаем переход сразу
  console.log('[Auth Middleware] Allowing navigation immediately')
})

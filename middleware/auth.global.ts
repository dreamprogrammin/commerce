// middleware/auth.global.ts
import { useModalStore } from '@/stores/modal/useModalStore'
import { useProfileStore } from '@/stores/core/profileStore'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // ✅ Пропускаем на сервере - проверка только на клиенте
  if (import.meta.server) {
    return
  }

  // Пути, требующие авторизации
  const protectedPaths = [
    '/profile',
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
  console.log('[Auth Middleware] Checking auth for:', to.path)

  const user = useSupabaseUser()

  // Если пользователя нет - редирект
  if (!user.value) {
    console.log('[Auth Middleware] No user, opening login modal')
    
    // Открываем модалку входа
    const modalStore = useModalStore()
    modalStore.openLoginModal()
    
    return navigateTo('/')
  }

  // ✅ Пользователь есть - проверяем профиль
  const profileStore = useProfileStore()

  console.log('[Auth Middleware] User exists:', user.value.id)
  console.log('[Auth Middleware] Profile state:', {
    exists: !!profileStore.profile,
    loading: profileStore.isLoading
  })

  // Если профиль загружается - ждем немного
  if (profileStore.isLoading) {
    console.log('[Auth Middleware] Profile is loading, waiting...')
    
    const startTime = Date.now()
    const maxWaitTime = 3000 // 3 секунды максимум

    while (profileStore.isLoading && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    console.log('[Auth Middleware] Wait finished. Profile:', !!profileStore.profile)
  }

  // Если профиля все еще нет - пытаемся загрузить
  if (!profileStore.profile && !profileStore.isLoading) {
    console.log('[Auth Middleware] No profile found, attempting to load...')
    
    try {
      await profileStore.loadProfile(false, true)
      console.log('[Auth Middleware] Profile loaded:', !!profileStore.profile)
    } catch (error) {
      console.error('[Auth Middleware] Failed to load profile:', error)
    }
  }

  // ✅ Если после всех попыток профиля нет - это OK для новых пользователей
  // Страница сама обработает отсутствие профиля
  if (!profileStore.profile) {
    console.log('[Auth Middleware] No profile after load attempts (might be new user)')
  }
})
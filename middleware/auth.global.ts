// middleware/auth.ts
import { useModalStore } from '@/stores/modal/useModalStore'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // Все пути профиля, требующие авторизации
  const protectedProfilePaths = [
    '/profile',
    '/profile/bonus',
    '/profile/children',
    '/profile/order',
    '/profile/wishlist',
    '/profile/favorites',
    '/profile/settings',
  ]

  // ✅ НА СЕРВЕРЕ: Пропускаем защищенные страницы (проверим на клиенте)
  if (import.meta.server && protectedProfilePaths.includes(to.path)) {
    return
  }

  // ✅ НА КЛИЕНТЕ: Даем время на инициализацию сессии
  if (import.meta.client && protectedProfilePaths.includes(to.path)) {
    const supabase = useSupabaseClient()

    // Ждем получения сессии (максимум 100мс)
    const { data: { session } } = await supabase.auth.getSession()

    // Если нет сессии - блокируем
    if (!session) {
      const modalStore = useModalStore()
      modalStore.openLoginModal()
      return navigateTo('/')
    }
  }

  const user = useSupabaseUser()

  // Dashboard (если используется)
  if (!user.value && to.path === '/dashboard') {
    return navigateTo('/login')
  }

  // Если пользователь уже залогинен, не показываем страницы входа
  if (user.value && ['/login', '/register'].includes(to.path)) {
    return navigateTo('/')
  }
})

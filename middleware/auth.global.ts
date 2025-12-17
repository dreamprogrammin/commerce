// middleware/auth.ts
import { useModalStore } from '@/stores/modal/useModalStore'

export default defineNuxtRouteMiddleware(async (to, _from) => {
  // Пути, требующие авторизации
  const protectedPaths = [
    '/profile',
    '/profile/bonus',
    '/profile/children',
    '/profile/order',
    '/profile/wishlist',
    '/profile/favorites',
    '/profile/settings',
  ]

  const isProtectedPath = protectedPaths.some(path => to.path.startsWith(path))

  // Если это защищенный путь
  if (isProtectedPath) {
    // На сервере пропускаем (проверим на клиенте)
    if (import.meta.server) {
      return
    }

    // На клиенте проверяем сессию
    if (import.meta.client) {
      const supabase = useSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        const modalStore = useModalStore()
        modalStore.openLoginModal()
        return navigateTo('/')
      }
    }
  }

  // Если залогинен, не показываем страницы входа
  const user = useSupabaseUser()
  if (user.value && ['/login', '/register'].includes(to.path)) {
    return navigateTo('/')
  }
})

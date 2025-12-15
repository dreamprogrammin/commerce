// middleware/auth.ts
import { useModalStore } from '@/stores/modal/useModalStore'

export default defineNuxtRouteMiddleware((to, _from) => {
  const user = useSupabaseUser()
  const modalStore = useModalStore()

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

  // Dashboard (если используется)
  if (!user.value && to.path === '/dashboard') {
    return navigateTo('/login')
  }

  // Если пользователь уже залогинен, не показываем страницы входа
  if (user.value && ['/login', '/register'].includes(to.path)) {
    return navigateTo('/')
  }

  // ✅ ГЛАВНАЯ ПРОВЕРКА: Если гость пытается зайти в профиль
  if (protectedProfilePaths.includes(to.path) && !user.value) {
    // Открываем модальное окно логина
    modalStore.openLoginModal()

    // Прерываем навигацию и остаемся на текущей странице
    return abortNavigation()
  }
})

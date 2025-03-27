export default defineNuxtRouteMiddleware(async(to, _from) => {
  const user = useSupabaseUser();
  const publicRoutes = ['/', '/login', '/register', '/confirm', '/forgot-password', '/reset-password'];

  if (user.value && !user.value?.email_confirmed_at) {
    return navigateTo('/confirm');
  }

  if (to.path === '/callback') {
    // Ожидаем завершения аутентификации
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (user.value) {
      return navigateTo('/dashboard');
    } else {
      return navigateTo('/login');
    }
  }

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo('/login');
  }

  if (user.value && ['/login', '/register'].includes(to.path)) {
    return navigateTo('/dashboard');
  }
  if (to.path === '/profile' && !user.value) {
    return navigateTo('/login');
  }
});

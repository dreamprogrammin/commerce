// Middleware для блокировки индексации служебных страниц
export default defineNuxtRouteMiddleware((to) => {
  // Список путей которые не должны индексироваться
  const noindexPaths = [
    '/api',
    '/_nuxt',
    '/__nuxt',
    '/admin',
    '/auth',
    '/register',
    '/login',
    '/forgot-password',
    '/reset-password',
    '/profile',
    '/cart',
    '/checkout',
    '/order',
    '/notifications',
  ]

  // Проверяем wildcard паттерны
  const noindexPatterns = [
    /^\/\*\*\//, // /**/
    /\/\*\*$/, // /brand/**
    /\/api\//, // /api/*
    /\/admin\//, // /admin/*
    /\/auth\//, // /auth/*
    /\/profile\//, // /profile/*
  ]

  const path = to.path

  // Проверяем точные совпадения
  const shouldNoindex = noindexPaths.some(p => path.startsWith(p))

  // Проверяем паттерны
  const matchesPattern = noindexPatterns.some(pattern => pattern.test(path))

  if (shouldNoindex || matchesPattern) {
    useHead({
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
      ],
    })
  }
})

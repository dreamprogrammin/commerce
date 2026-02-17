// Service Worker для Web Push уведомлений

self.addEventListener('push', (event) => {
  if (!event.data) return

  const data = event.data.json()

  // Проверяем, есть ли активная вкладка — если да, пропускаем (toast покажется in-app)
  const showNotification = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((clients) => {
      const hasVisibleClient = clients.some((client) => client.visibilityState === 'visible')
      if (hasVisibleClient) return

      return self.registration.showNotification(data.title || 'Ухтышка', {
        body: data.body || '',
        icon: '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        data: { link: data.link || '/notifications' },
        tag: data.tag || 'default',
      })
    })

  event.waitUntil(showNotification)
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const link = event.notification.data?.link || '/notifications'
  const fullUrl = new URL(link, self.location.origin).href

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Ищем уже открытую вкладку сайта
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
            client.navigate(fullUrl)
            return client.focus()
          }
        }
        // Открываем новую вкладку
        return self.clients.openWindow(fullUrl)
      }),
  )
})

<script setup lang="ts">
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useNotificationsStore } from '@/stores/publicStore/notificationsStore'

definePageMeta({
  layout: 'default',
})

const store = useNotificationsStore()
const authStore = useAuthStore()
const router = useRouter()

onMounted(() => {
  store.fetchNotifications()
})

async function handleClick(notification: { id: string, link: string | null, is_read: boolean }) {
  if (!notification.is_read) {
    await store.markAsRead(notification.id)
  }
  if (notification.link) {
    router.push(notification.link)
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1)
    return 'Только что'
  if (diffMins < 60)
    return `${diffMins} мин назад`
  if (diffHours < 24)
    return `${diffHours} ч назад`
  if (diffDays < 7)
    return `${diffDays} д назад`

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

async function handleMarkAllAsRead() {
  await store.markAllAsRead()
}
</script>

<template>
  <div class="container mx-auto px-4 py-6 max-w-2xl">
    <!-- Заголовок -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors active:scale-95"
          @click="router.back()"
        >
          <Icon name="lucide:arrow-left" class="size-5" />
          <span class="font-medium">Назад</span>
        </button>
        <h1 class="text-2xl font-bold">
          Уведомления
        </h1>
      </div>
      <button
        v-if="store.unreadCount > 0"
        class="text-sm text-primary hover:underline"
        @click="handleMarkAllAsRead"
      >
        Прочитать все
      </button>
    </div>

    <!-- Список уведомлений -->
    <div v-if="store.isLoading" class="space-y-3">
      <div v-for="i in 5" :key="i" class="bg-white dark:bg-gray-900 rounded-xl p-4 border animate-pulse">
        <div class="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-2" />
        <div class="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
      </div>
    </div>

    <div v-else-if="store.notifications.length === 0" class="text-center py-16">
      <div class="w-16 h-16 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
        <Icon name="lucide:bell-off" class="size-8 text-gray-400" />
      </div>
      <p class="text-gray-500 dark:text-gray-400">
        У вас пока нет уведомлений
      </p>
    </div>

    <div v-else class="space-y-3">
      <button
        v-for="n in store.notifications"
        :key="n.id"
        class="w-full text-left bg-white dark:bg-gray-900 rounded-xl p-4 border hover:border-primary/50 transition-all"
        :class="{ 'bg-blue-50/50 dark:bg-blue-950/20 border-primary/30': !n.is_read }"
        @click="handleClick(n)"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
            :class="n.is_read ? 'bg-gray-100 dark:bg-gray-800' : 'bg-primary/10'"
          >
            <Icon
              name="lucide:message-circle-reply"
              class="size-5"
              :class="n.is_read ? 'text-gray-500' : 'text-primary'"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2 mb-1">
              <p class="font-semibold text-sm" :class="{ 'text-primary': !n.is_read }">
                {{ n.title }}
              </p>
              <div
                v-if="!n.is_read"
                class="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-1"
              />
            </div>
            <p v-if="n.body" class="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
              {{ n.body }}
            </p>
            <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
              <Icon name="lucide:clock" class="size-3" />
              {{ formatDate(n.created_at) }}
            </div>
          </div>
          <Icon name="lucide:chevron-right" class="size-5 text-gray-400 flex-shrink-0 mt-1" />
        </div>
      </button>
    </div>
  </div>
</template>

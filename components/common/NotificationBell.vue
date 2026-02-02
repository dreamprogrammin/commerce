<script setup lang="ts">
import { useNotificationsStore } from '@/stores/publicStore/notificationsStore'

const store = useNotificationsStore()
const router = useRouter()
const user = useSupabaseUser()

watchEffect(() => {
  if (user.value) {
    store.subscribeToNotifications()
  }
})

onMounted(() => {
  if (user.value) {
    store.fetchUnreadCount()
  }
})

onUnmounted(() => {
  store.unsubscribeFromNotifications()
})

const isOpen = ref(false)

function onOpen(open: boolean) {
  isOpen.value = open
  if (open) {
    store.fetchNotifications()
  }
}

async function handleClick(notification: { id: string, link: string | null, is_read: boolean }) {
  if (!notification.is_read) {
    await store.markAsRead(notification.id)
  }
  isOpen.value = false
  if (notification.link) {
    router.push(notification.link)
  }
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <!-- Мобильная версия -->
    <NuxtLink to="/notifications" class="lg:hidden block">
      <div class="relative p-1 hover:opacity-70 transition-opacity active:scale-95">
        <CommonIconWithSkeleton
          name="line-md:bell-twotone-loop"
          class="size-6 text-primary"
        />

        <ClientOnly>
          <Transition
            enter-active-class="transition-all duration-200"
            enter-from-class="scale-0 opacity-0"
            enter-to-class="scale-100 opacity-100"
          >
            <div
              v-if="store.unreadCount > 0"
              class="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-white dark:border-gray-900 shadow-lg"
            >
              {{ store.unreadCount > 9 ? '9+' : store.unreadCount }}
            </div>
          </Transition>
        </ClientOnly>
      </div>
    </NuxtLink>

    <!-- Десктопная версия -->
    <Popover :open="isOpen" @update:open="onOpen">
      <PopoverTrigger as-child>
        <button class="relative group hidden lg:block">
          <div class="p-2 md:p-2.5 md:bg-white/10 hover:bg-gray-200 dark:hover:bg-gray-700 md:hover:bg-white/20 rounded-xl transition-all group-hover:scale-105 active:scale-95 backdrop-blur-sm md:border md:border-white/10 md:hover:border-white/20 md:shadow-lg">
            <CommonIconWithSkeleton
              name="line-md:bell-loop"
              class="size-5 md:size-7 md:text-white"
            />
          </div>

          <ClientOnly>
            <Transition
              enter-active-class="transition-all duration-200"
              enter-from-class="scale-0 opacity-0"
              enter-to-class="scale-100 opacity-100"
            >
              <div
                v-if="store.unreadCount > 0"
                class="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 border-2 md:border-blue-500 shadow-lg"
              >
                {{ store.unreadCount > 9 ? '9+' : store.unreadCount }}
              </div>
            </Transition>
          </ClientOnly>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" :side-offset="8" class="w-80 p-0">
        <div class="flex items-center justify-between px-4 py-3 border-b">
          <span class="font-semibold text-sm">Уведомления</span>
          <button
            v-if="store.unreadCount > 0"
            class="text-xs text-blue-600 hover:text-blue-700"
            @click="store.markAllAsRead()"
          >
            Прочитать все
          </button>
        </div>

        <div class="max-h-72 overflow-y-auto">
          <div v-if="store.isLoading" class="p-4 space-y-3">
            <div v-for="i in 3" :key="i" class="flex items-start gap-2">
              <Skeleton class="mt-1.5 w-2 h-2 rounded-full" />
              <div class="flex-1 space-y-2">
                <Skeleton class="h-4 w-3/4" />
                <Skeleton class="h-3 w-full" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          </div>

          <div v-else-if="store.notifications.length === 0" class="p-4 text-center text-sm text-gray-500">
            Нет уведомлений
          </div>

          <button
            v-for="n in store.notifications"
            :key="n.id"
            class="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0"
            :class="{ 'bg-blue-50/50 dark:bg-blue-950/20': !n.is_read }"
            @click="handleClick(n)"
          >
            <div class="flex items-start gap-2">
              <div
                v-if="!n.is_read"
                class="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0"
              />
              <div class="min-w-0">
                <p class="text-sm font-medium truncate">
                  {{ n.title }}
                </p>
                <p v-if="n.body" class="text-xs text-gray-500 mt-0.5 line-clamp-2">
                  {{ n.body }}
                </p>
                <p class="text-[11px] text-gray-400 mt-1">
                  {{ formatDate(n.created_at) }}
                </p>
              </div>
            </div>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>

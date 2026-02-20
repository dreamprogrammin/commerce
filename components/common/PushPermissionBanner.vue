<script setup lang="ts">
import { usePushSubscription } from '@/composables/usePushSubscription'

const { isSupported, permission, subscribe } = usePushSubscription()
const user = useSupabaseUser()

const dismissed = ref(false)
const loading = ref(false)

const DISMISS_KEY = 'push-banner-dismissed'

onMounted(() => {
  dismissed.value = localStorage.getItem(DISMISS_KEY) === 'true'
})

const visible = computed(() => {
  // Проверяем и ref, и Notification.permission напрямую (страховка)
  const browserPermission = ('Notification' in window) ? Notification.permission : 'default'
  return (
    user.value
    && isSupported.value
    && permission.value === 'default'
    && browserPermission === 'default'
    && !dismissed.value
  )
})

async function handleEnable() {
  loading.value = true
  const ok = await subscribe()
  loading.value = false
  if (ok) {
    dismissed.value = true
    localStorage.setItem(DISMISS_KEY, 'true')
  }
}

function handleDismiss() {
  dismissed.value = true
  localStorage.setItem(DISMISS_KEY, 'true')
}
</script>

<template>
  <div
    v-if="visible"
    class="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
  >
    <Icon name="lucide:bell-ring" class="size-6 text-primary shrink-0" />
    <div class="flex-1 min-w-0">
      <p class="text-sm font-medium">
        Включите уведомления
      </p>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Узнавайте о начислении бонусов и ответах на вопросы
      </p>
    </div>
    <div class="flex gap-2 shrink-0">
      <button
        class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1"
        @click="handleDismiss"
      >
        Позже
      </button>
      <button
        class="text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        :disabled="loading"
        @click="handleEnable"
      >
        {{ loading ? 'Включаем...' : 'Включить' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { usePushSubscription } from '@/composables/usePushSubscription'

const { isSupported, permission, subscribe } = usePushSubscription()
const user = useSupabaseUser()

const isOpen = ref(false)
const loading = ref(false)

const DISMISS_KEY = 'push-drawer-dismissed'
const DELAY_MS = 5000

onMounted(() => {
  const wasDismissed = localStorage.getItem(DISMISS_KEY) === 'true'
  if (wasDismissed || !user.value)
    return

  // На iOS Safari (не PWA) push не поддерживается —
  // не показываем промпт, пользователь получит in-app уведомления через колокольчик
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || ('standalone' in navigator && (navigator as any).standalone === true)

  // iOS в обычном Safari → не показываем ничего
  if (isIos && !isStandalone)
    return

  // Проверяем поддержку и разрешение
  if (!isSupported.value)
    return

  const browserPermission = ('Notification' in window) ? Notification.permission : 'default'
  if (permission.value !== 'default' || browserPermission !== 'default')
    return

  setTimeout(() => {
    const currentPermission = ('Notification' in window) ? Notification.permission : 'default'
    if (user.value && currentPermission === 'default') {
      isOpen.value = true
    }
  }, DELAY_MS)
})

async function handleEnable() {
  loading.value = true
  const ok = await subscribe()
  loading.value = false
  if (ok) {
    dismiss()
  }
}

function dismiss() {
  isOpen.value = false
  localStorage.setItem(DISMISS_KEY, 'true')
}
</script>

<template>
  <Drawer v-model:open="isOpen" @close="dismiss">
    <DrawerContent>
      <div class="mx-auto w-full max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <DrawerHeader class="px-0">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Icon name="lucide:bell-ring" class="h-8 w-8 text-primary" />
          </div>
          <DrawerTitle class="text-center text-2xl">
            Не пропустите важное!
          </DrawerTitle>
          <DrawerDescription class="text-center">
            Включите уведомления, чтобы узнавать о скидках, акциях и бонусах
          </DrawerDescription>
        </DrawerHeader>

        <div class="space-y-2 py-2">
          <div class="flex items-center gap-3 text-sm">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
              <Icon name="lucide:percent" class="w-4 h-4 text-orange-600" />
            </div>
            <span class="text-muted-foreground">Скидки и акции — узнавайте первыми</span>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <Icon name="lucide:gift" class="w-4 h-4 text-blue-600" />
            </div>
            <span class="text-muted-foreground">Бонусы и ответы на ваши вопросы</span>
          </div>
          <div class="flex items-center gap-3 text-sm">
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
              <Icon name="lucide:smartphone" class="w-4 h-4 text-green-600" />
            </div>
            <span class="text-muted-foreground">Уведомления даже при закрытой вкладке</span>
          </div>
        </div>

        <div class="space-y-3 pt-4">
          <Button
            class="w-full gap-2 text-base"
            size="lg"
            :disabled="loading"
            @click="handleEnable"
          >
            <Icon
              v-if="!loading"
              name="lucide:bell"
              class="h-5 w-5"
            />
            <Icon
              v-else
              name="line-md:loading-twotone-loop"
              class="h-5 w-5"
            />
            {{ loading ? 'Подключаем...' : 'Включить уведомления' }}
          </Button>
        </div>

        <div class="pt-3">
          <Button
            variant="ghost"
            class="w-full text-muted-foreground"
            size="lg"
            @click="dismiss"
          >
            Позже
          </Button>
        </div>
      </div>
    </DrawerContent>
  </Drawer>
</template>

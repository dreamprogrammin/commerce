<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { Loader2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { useTelegramLink } from '@/composables/profile/useTelegramLink'
import { useProfileStore } from '@/stores/core/profileStore'

const user = useSupabaseUser()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

// isPreparing не разбираем: в этом компоненте флаг никто не читает
const { telegramUrl, prepareLink } = useTelegramLink()

// Pre-generate link on mount so the button renders as a native <a href>
// This avoids popup-blocker issues caused by calling window.open() after await
onMounted(() => {
  if (user.value && !isLinked.value) {
    prepareLink()
  }
})

// When user returns from Telegram app back to the browser, silently refetch the profile
// so the banner disappears immediately once Telegram is linked
if (import.meta.client) {
  useEventListener(document, 'visibilitychange', () => {
    if (!document.hidden && user.value && !isLinked.value) {
      profileStore.loadProfile(true, false, true)
    }
  })
}

function handleLinkClick() {
  toast.info('Перейдите в Telegram и нажмите "Начать"', {
    description: 'После привязки обновите страницу',
    duration: 10000,
  })
}
</script>

<template>
  <Card v-if="!isLinked" class="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/50">
    <CardContent class="flex items-start gap-4 pt-6">
      <div class="p-2.5 bg-blue-100 rounded-full flex-shrink-0">
        <Icon name="simple-icons:telegram" class="w-6 h-6 text-blue-500" />
      </div>
      <div class="flex-1 min-w-0">
        <h3 class="font-semibold text-base mb-1">
          Подпишитесь на Telegram
        </h3>
        <p class="text-sm text-muted-foreground mb-3">
          Получайте уведомления о статусе заказов, начислении бонусов и эксклюзивных акциях прямо в Telegram
        </p>

        <!-- Render as native <a> once the link is ready — avoids popup-blocker on mobile/in-app browsers -->
        <Button
          v-if="telegramUrl"
          as="a"
          :href="telegramUrl"
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          @click="handleLinkClick"
        >
          <Icon name="simple-icons:telegram" class="mr-2 h-4 w-4" />
          Подключить Telegram
        </Button>

        <Button
          v-else
          size="sm"
          disabled
        >
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Загрузка...
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

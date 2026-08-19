<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTelegramLink } from '@/composables/profile/useTelegramLink'
import { useModalStore } from '@/stores/modal/useModalStore'

const user = useSupabaseUser()
const modalStore = useModalStore()
const { showTelegramModal } = storeToRefs(modalStore)

// isPreparing не разбираем: в этом компоненте флаг никто не читает
const { telegramUrl, prepareLink } = useTelegramLink()

const isOpen = computed({
  get: () => showTelegramModal.value,
  set: (value) => {
    if (value) {
      modalStore.openTelegramModal()
    }
    else {
      modalStore.closeTelegramModal()
    }
  },
})

// Pre-generate link when modal opens so the button renders as a native <a href>
// This avoids popup-blocker issues caused by calling window.open() after await
watch(isOpen, (opened) => {
  if (opened && user.value) {
    prepareLink()
  }
  else if (!opened) {
    telegramUrl.value = null
  }
})

function dismiss() {
  localStorage.setItem('tg_modal_dismissed_at', Date.now().toString())
  modalStore.closeTelegramModal()
}

function handleSubscribeClick() {
  toast.info('Перейдите в Telegram и нажмите "Начать"', {
    description: 'После привязки обновите страницу',
    duration: 10000,
  })
  localStorage.setItem('tg_modal_dismissed_at', Date.now().toString())
  modalStore.closeTelegramModal()
}
</script>

<template>
  <Dialog v-model:open="isOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500">
          <Icon name="simple-icons:telegram" class="h-8 w-8 text-white" />
        </div>
        <DialogTitle class="text-center text-2xl">
          Будьте в курсе!
        </DialogTitle>
        <DialogDescription class="text-center">
          Подпишитесь на наш Telegram-бот и получайте уведомления первыми
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-2 py-2">
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Icon name="lucide:package" class="w-4 h-4 text-blue-600" />
          </div>
          <span class="text-muted-foreground">Статусы заказов в реальном времени</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
            <Icon name="lucide:gift" class="w-4 h-4 text-orange-600" />
          </div>
          <span class="text-muted-foreground">Бонусы и персональные скидки</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-pink-100 flex items-center justify-center">
            <Icon name="lucide:megaphone" class="w-4 h-4 text-pink-600" />
          </div>
          <span class="text-muted-foreground">Эксклюзивные акции и промокоды</span>
        </div>
        <div class="flex items-center gap-3 text-sm">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <Icon name="lucide:sparkles" class="w-4 h-4 text-green-600" />
          </div>
          <span class="text-muted-foreground">Новинки каталога раньше всех</span>
        </div>
      </div>

      <div class="space-y-3 pt-2">
        <!-- Render as native <a> once the link is ready — avoids popup-blocker on mobile/in-app browsers -->
        <Button
          v-if="telegramUrl"
          as="a"
          :href="telegramUrl"
          target="_blank"
          rel="noopener noreferrer"
          size="lg"
          class="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white"
          @click="handleSubscribeClick"
        >
          <Icon name="simple-icons:telegram" class="h-5 w-5" />
          Подписаться в Telegram
        </Button>

        <Button
          v-else
          size="lg"
          class="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white"
          disabled
        >
          <Icon name="line-md:loading-twotone-loop" class="h-5 w-5" />
          Загрузка...
        </Button>

        <Button
          variant="ghost"
          size="lg"
          class="w-full text-muted-foreground"
          @click="dismiss"
        >
          Не сейчас
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>

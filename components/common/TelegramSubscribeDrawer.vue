<script setup lang="ts">
import type { Database } from '@/types'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useModalStore } from '@/stores/modal/useModalStore'

const BOT_USERNAME = 'babyShopOfficialStoreKz_bot'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const modalStore = useModalStore()
const { showTelegramModal } = storeToRefs(modalStore)

const telegramUrl = ref<string | null>(null)
const isPreparing = ref(false)

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

async function prepareLink() {
  if (!user.value) return

  isPreparing.value = true
  telegramUrl.value = null
  try {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    await supabase
      .from('telegram_link_codes')
      .delete()
      .eq('user_id', user.value.id)

    const { error } = await supabase
      .from('telegram_link_codes')
      .insert({ user_id: user.value.id, code })

    if (error)
      throw error

    telegramUrl.value = `https://t.me/${BOT_USERNAME}?start=${code}`
  }
  catch (error: any) {
    console.error('Error preparing Telegram link:', error)
    toast.error('Ошибка при создании ссылки', { description: error.message })
  }
  finally {
    isPreparing.value = false
  }
}

// Pre-generate link when drawer opens so the button renders as a native <a href>
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
  <Drawer v-model:open="isOpen">
    <DrawerContent>
      <div class="mx-auto w-full max-w-md px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <DrawerHeader class="px-0">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-500">
            <Icon name="simple-icons:telegram" class="h-8 w-8 text-white" />
          </div>
          <DrawerTitle class="text-center text-2xl">
            Будьте в курсе!
          </DrawerTitle>
          <DrawerDescription class="text-center">
            Подпишитесь на наш Telegram-бот и получайте уведомления первыми
          </DrawerDescription>
        </DrawerHeader>

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
      </div>
    </DrawerContent>
  </Drawer>
</template>

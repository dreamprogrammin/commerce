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

const isLoading = ref(false)

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

function dismiss() {
  localStorage.setItem('tg_modal_dismissed_at', Date.now().toString())
  modalStore.closeTelegramModal()
}

async function subscribe() {
  if (!user.value) {
    window.open(`https://t.me/${BOT_USERNAME}`, '_blank')
    localStorage.setItem('tg_modal_dismissed_at', Date.now().toString())
    modalStore.closeTelegramModal()
    return
  }

  isLoading.value = true
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

    window.open(`https://t.me/${BOT_USERNAME}?start=${code}`, '_blank')

    toast.info('Перейдите в Telegram и нажмите "Начать"', {
      description: 'После привязки обновите страницу',
      duration: 10000,
    })
  }
  catch (error: any) {
    console.error('Error creating link code:', error)
    toast.error('Ошибка при создании ссылки', { description: error.message })
  }
  finally {
    isLoading.value = false
  }

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
          <Button
            size="lg"
            class="w-full gap-2 bg-sky-500 hover:bg-sky-600 text-white"
            :disabled="isLoading"
            @click="subscribe"
          >
            <Icon
              v-if="!isLoading"
              name="simple-icons:telegram"
              class="h-5 w-5"
            />
            <Icon
              v-else
              name="line-md:loading-twotone-loop"
              class="h-5 w-5"
            />
            {{ isLoading ? 'Загрузка...' : 'Подписаться в Telegram' }}
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

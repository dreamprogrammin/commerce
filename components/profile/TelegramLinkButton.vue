<script setup lang="ts">
import type { Database } from '@/types'
import { Loader2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { useProfileStore } from '@/stores/core/profileStore'

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

const telegramUrl = ref<string | null>(null)
const isPreparing = ref(false)
const isUnlinking = ref(false)

const BOT_USERNAME = 'babyShopOfficialStoreKz_bot'

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

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

// Pre-generate link on mount so the button renders as a native <a href>
// This avoids popup-blocker issues caused by calling window.open() after await
onMounted(() => {
  if (user.value && !isLinked.value) {
    prepareLink()
  }
})

function handleLinkClick() {
  toast.info('Перейдите в Telegram и нажмите "Начать"', {
    description: 'После привязки обновите страницу',
    duration: 10000,
  })
}

async function unlinkTelegram() {
  if (!user.value)
    return

  isUnlinking.value = true
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ telegram_chat_id: null })
      .eq('id', user.value.id)

    if (error)
      throw error

    // Обновляем профиль в сторе
    if (profile.value) {
      profile.value = { ...profile.value, telegram_chat_id: null }
    }

    toast.success('Telegram отключён')
  }
  catch (error: any) {
    console.error('Error unlinking telegram:', error)
    toast.error('Ошибка при отключении', {
      description: error.message,
    })
  }
  finally {
    isUnlinking.value = false
  }
}
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <div>
      <p class="text-sm font-medium">
        Telegram-уведомления
      </p>
      <p class="text-sm text-muted-foreground">
        {{ isLinked ? 'Telegram подключён' : 'Получайте уведомления о заказах в Telegram' }}
      </p>
    </div>

    <Button
      v-if="isLinked"
      variant="outline"
      size="sm"
      :disabled="isUnlinking"
      @click="unlinkTelegram"
    >
      <Loader2 v-if="isUnlinking" class="mr-2 h-4 w-4 animate-spin" />
      {{ isUnlinking ? 'Отключение...' : 'Отключить' }}
    </Button>

    <!-- Render as native <a> once the link is ready — avoids popup-blocker on mobile/in-app browsers -->
    <Button
      v-else-if="telegramUrl"
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
</template>

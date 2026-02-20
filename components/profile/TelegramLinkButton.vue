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

const isLinking = ref(false)
const isUnlinking = ref(false)

const BOT_USERNAME = 'uhti_kz_bot'

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

async function linkTelegram() {
  if (!user.value)
    return

  isLinking.value = true
  try {
    // Генерируем случайный код
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    // Удаляем старые коды этого пользователя
    await supabase
      .from('telegram_link_codes')
      .delete()
      .eq('user_id', user.value.id)

    // Создаём новый код
    const { error } = await supabase
      .from('telegram_link_codes')
      .insert({
        user_id: user.value.id,
        code,
      })

    if (error)
      throw error

    // Открываем deep link в Telegram
    const deepLink = `https://t.me/${BOT_USERNAME}?start=${code}`
    window.open(deepLink, '_blank')

    toast.info('Перейдите в Telegram и нажмите "Начать"', {
      description: 'После привязки обновите страницу',
      duration: 10000,
    })
  }
  catch (error: any) {
    console.error('Error creating link code:', error)
    toast.error('Ошибка при создании ссылки', {
      description: error.message,
    })
  }
  finally {
    isLinking.value = false
  }
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

    <Button
      v-else
      size="sm"
      :disabled="isLinking"
      @click="linkTelegram"
    >
      <Loader2 v-if="isLinking" class="mr-2 h-4 w-4 animate-spin" />
      {{ isLinking ? 'Создание ссылки...' : 'Подключить Telegram' }}
    </Button>
  </div>
</template>

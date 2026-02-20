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

const BOT_USERNAME = 'uhti_kz_bot'

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

async function linkTelegram() {
  if (!user.value)
    return

  isLinking.value = true
  try {
    const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

    await supabase
      .from('telegram_link_codes')
      .delete()
      .eq('user_id', user.value.id)

    const { error } = await supabase
      .from('telegram_link_codes')
      .insert({
        user_id: user.value.id,
        code,
      })

    if (error)
      throw error

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
        <Button
          size="sm"
          :disabled="isLinking"
          @click="linkTelegram"
        >
          <Loader2 v-if="isLinking" class="mr-2 h-4 w-4 animate-spin" />
          <Icon v-else name="simple-icons:telegram" class="mr-2 h-4 w-4" />
          {{ isLinking ? 'Подключение...' : 'Подключить Telegram' }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>

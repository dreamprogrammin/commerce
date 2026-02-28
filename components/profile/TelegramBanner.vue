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

const BOT_USERNAME = 'babyShopOfficialStoreKz_bot'

const isLinked = computed(() => !!profile.value?.telegram_chat_id)

const telegramUrl = ref<string | null>(null)
const isPreparing = ref(false)

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

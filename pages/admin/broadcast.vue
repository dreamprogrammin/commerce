<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useAdminBroadcastStore } from '@/stores/adminStore/adminBroadcastStore'

definePageMeta({
  layout: 'admin',
})
useHead({ title: 'Telegram-рассылка' })

const broadcastStore = useAdminBroadcastStore()
const { subscriberCount, isLoadingCount, isSending, history, isLoadingHistory } = storeToRefs(broadcastStore)

const message = ref('')

onMounted(() => {
  broadcastStore.fetchSubscriberCount()
  broadcastStore.loadHistory()
})

async function handleSend() {
  const success = await broadcastStore.sendBroadcast(message.value)
  if (success) {
    message.value = ''
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-3xl">
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle class="text-2xl">
              Telegram-рассылка
            </CardTitle>
            <CardDescription>Отправка сообщений всем подписчикам Telegram-бота</CardDescription>
          </div>
          <Badge variant="secondary" class="text-sm">
            {{ isLoadingCount ? '...' : subscriberCount }} подписчиков
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <Textarea
          v-model="message"
          placeholder="Текст рассылки..."
          :rows="6"
          :disabled="isSending"
        />

        <div v-if="message.trim()" class="rounded-lg border p-4 bg-muted/50">
          <p class="text-xs text-muted-foreground mb-2">
            Превью сообщения:
          </p>
          <p class="text-sm whitespace-pre-wrap">
            {{ message }}
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button
              :disabled="!message.trim() || isSending || subscriberCount === 0"
              class="w-full sm:w-auto"
            >
              <Loader2 v-if="isSending" class="mr-2 h-4 w-4 animate-spin" />
              {{ isSending ? 'Отправка...' : 'Отправить рассылку' }}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Подтвердите отправку</AlertDialogTitle>
              <AlertDialogDescription>
                Сообщение будет отправлено {{ subscriberCount }} подписчикам в Telegram.
                Это действие нельзя отменить.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction @click="handleSend">
                Отправить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>

    <Separator />

    <Card>
      <CardHeader>
        <CardTitle>История рассылок</CardTitle>
      </CardHeader>
      <CardContent>
        <div v-if="isLoadingHistory" class="text-center py-8 text-muted-foreground">
          Загрузка...
        </div>

        <div v-else-if="history.length === 0" class="text-center py-8 text-muted-foreground">
          Рассылок пока не было
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="item in history"
            :key="item.id"
            class="rounded-lg border p-4 space-y-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm text-muted-foreground">
                {{ formatDate(item.created_at) }}
              </span>
              <div class="flex gap-2">
                <Badge variant="default">
                  {{ item.sent_count }} отправлено
                </Badge>
                <Badge v-if="item.failed_count > 0" variant="destructive">
                  {{ item.failed_count }} ошибок
                </Badge>
              </div>
            </div>
            <p class="text-sm whitespace-pre-wrap">
              {{ item.message }}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

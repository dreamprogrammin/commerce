<script setup lang="ts">
import type { Database } from '@/types'
import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'

definePageMeta({
  layout: 'blank',
})

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const profileStore = useProfileStore()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error' | 'login' | 'telegram-browser'>('loading')
const errorMessage = ref('')
const copied = ref(false)

const code = computed(() => (route.query.code as string) || '')
const linkUrl = computed(() => `https://uhti.kz/telegram-link?code=${code.value}`)

const isTelegramBrowser = computed(() => {
  if (!import.meta.client)
    return false
  return /Telegram/i.test(navigator.userAgent)
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(linkUrl.value)
    copied.value = true
    toast.success('Ссылка скопирована!')
    setTimeout(() => {
      copied.value = false
    }, 3000)
  }
  catch {
    // Fallback для старых браузеров
    const input = document.createElement('input')
    input.value = linkUrl.value
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
    copied.value = true
    toast.success('Ссылка скопирована!')
    setTimeout(() => {
      copied.value = false
    }, 3000)
  }
}

async function linkAccount() {
  if (!code.value) {
    status.value = 'error'
    errorMessage.value = 'Код привязки не найден. Нажмите START в боте заново.'
    return
  }

  // Если открыли в Telegram-браузере и не залогинены — показать экран копирования
  if (isTelegramBrowser.value && !user.value) {
    status.value = 'telegram-browser'
    return
  }

  if (!user.value) {
    status.value = 'login'
    return
  }

  status.value = 'loading'

  try {
    // eslint-disable-next-line ts/no-unsafe-function-type
    const { data, error } = await (supabase.rpc as Function)('link_telegram_by_code', {
      p_code: code.value,
    })

    if (error)
      throw error

    const result = data as { success: boolean, error?: string }

    if (result.success) {
      status.value = 'success'
      await profileStore.fetchProfile()
    }
    else {
      status.value = 'error'
      errorMessage.value = result.error || 'Неизвестная ошибка'
    }
  }
  catch (err: unknown) {
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Ошибка при привязке'
  }
}

// Запускаем привязку при загрузке или после авторизации
watch(user, (newUser) => {
  if (newUser && (status.value === 'login' || status.value === 'telegram-browser'))
    linkAccount()
}, { immediate: false })

onMounted(() => {
  linkAccount()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="max-w-sm w-full text-center space-y-6">
      <!-- Загрузка -->
      <div v-if="status === 'loading'" class="space-y-4">
        <div class="text-4xl">
          🔗
        </div>
        <p class="text-lg font-medium">
          Привязка Telegram...
        </p>
        <div class="h-2 w-32 mx-auto rounded-full bg-muted overflow-hidden">
          <div class="h-full bg-primary animate-pulse rounded-full" />
        </div>
      </div>

      <!-- Успех -->
      <div v-else-if="status === 'success'" class="space-y-4">
        <div class="text-5xl">
          ✅
        </div>
        <h1 class="text-xl font-bold">
          Telegram привязан!
        </h1>
        <p class="text-muted-foreground text-sm">
          Теперь вы будете получать уведомления о заказах и бонусах в Telegram.
        </p>
        <p class="text-muted-foreground text-xs">
          Можете закрыть эту страницу и вернуться в Telegram.
        </p>
        <div class="pt-2">
          <NuxtLink to="/" class="text-primary text-sm underline underline-offset-4">
            Перейти на сайт
          </NuxtLink>
        </div>
      </div>

      <!-- Telegram-браузер: скопировать ссылку -->
      <div v-else-if="status === 'telegram-browser'" class="space-y-4">
        <div class="text-4xl">
          📋
        </div>
        <h1 class="text-xl font-bold">
          Откройте в браузере
        </h1>
        <p class="text-muted-foreground text-sm">
          Telegram не позволяет войти в аккаунт напрямую. Скопируйте ссылку и откройте в браузере телефона (Chrome, Safari).
        </p>

        <div class="bg-muted rounded-lg p-3 text-xs text-muted-foreground break-all select-all">
          {{ linkUrl }}
        </div>

        <button
          class="w-full inline-flex items-center justify-center gap-2 rounded-md px-6 py-3 text-sm font-medium transition-colors"
          :class="copied
            ? 'bg-green-500 text-white'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'"
          @click="copyLink"
        >
          {{ copied ? '✓ Скопировано!' : '📋 Скопировать ссылку' }}
        </button>

        <p class="text-muted-foreground text-xs">
          После входа в аккаунт Telegram привяжется автоматически
        </p>
      </div>

      <!-- Нужна авторизация (обычный браузер) -->
      <div v-else-if="status === 'login'" class="space-y-4">
        <div class="text-4xl">
          👤
        </div>
        <h1 class="text-xl font-bold">
          Войдите в аккаунт
        </h1>
        <p class="text-muted-foreground text-sm">
          Чтобы привязать Telegram, нужно войти в аккаунт на uhti.kz
        </p>
        <div class="pt-2">
          <NuxtLink
            :to="`/login?redirect=/telegram-link?code=${code}`"
            class="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Войти
          </NuxtLink>
        </div>
      </div>

      <!-- Ошибка -->
      <div v-else-if="status === 'error'" class="space-y-4">
        <div class="text-5xl">
          😔
        </div>
        <h1 class="text-xl font-bold">
          Не удалось привязать
        </h1>
        <p class="text-muted-foreground text-sm">
          {{ errorMessage }}
        </p>
        <div class="pt-2 space-y-2">
          <button
            class="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            @click="linkAccount"
          >
            Попробовать снова
          </button>
          <div>
            <NuxtLink to="/" class="text-primary text-sm underline underline-offset-4">
              На главную
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

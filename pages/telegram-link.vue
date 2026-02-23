<script setup lang="ts">
import type { Database } from '@/types'
import { useProfileStore } from '@/stores/core/profileStore'

definePageMeta({
  layout: 'blank',
})

const supabase = useSupabaseClient<Database>()
const user = useSupabaseUser()
const profileStore = useProfileStore()
const route = useRoute()

const status = ref<'loading' | 'success' | 'error' | 'login'>('loading')
const errorMessage = ref('')

const code = computed(() => (route.query.code as string) || '')

async function linkAccount() {
  if (!code.value) {
    status.value = 'error'
    errorMessage.value = 'Код привязки не найден. Нажмите START в боте заново.'
    return
  }

  if (!user.value) {
    status.value = 'login'
    return
  }

  status.value = 'loading'

  try {
    const { data, error } = await (supabase.rpc as Function)('link_telegram_by_code', {
      p_code: code.value,
    })

    if (error) throw error

    const result = data as { success: boolean, error?: string }

    if (result.success) {
      status.value = 'success'
      // Обновляем профиль в сторе
      await profileStore.fetchProfile()
    } else {
      status.value = 'error'
      errorMessage.value = result.error || 'Неизвестная ошибка'
    }
  } catch (err: unknown) {
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : 'Ошибка при привязке'
  }
}

// Запускаем привязку при загрузке или после авторизации
watch(user, (newUser) => {
  if (newUser && status.value === 'login') {
    linkAccount()
  }
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

      <!-- Нужна авторизация -->
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

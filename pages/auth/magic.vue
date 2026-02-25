<script setup lang="ts">
definePageMeta({
  layout: 'blank',
})

const route = useRoute()
const token = computed(() => route.query.token as string)

const status = ref<'loading' | 'error' | 'redirecting'>('loading')
const errorMessage = ref('')

async function processToken() {
  if (!token.value || token.value.length !== 64) {
    status.value = 'error'
    errorMessage.value = 'Недействительная ссылка'
    return
  }

  try {
    const { action_link } = await $fetch<{ action_link: string }>('/api/auth/magic', {
      method: 'POST',
      body: { token: token.value },
    })

    status.value = 'redirecting'
    window.location.href = action_link
  }
  catch (err: unknown) {
    status.value = 'error'
    const error = err as { statusCode?: number }
    if (error.statusCode === 410) {
      errorMessage.value = 'Ссылка уже использована или истекла'
    }
    else {
      errorMessage.value = 'Не удалось выполнить вход. Попробуйте войти через Google.'
    }
  }
}

onMounted(() => {
  processToken()
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background">
    <div class="text-center p-8 max-w-md">
      <!-- Loading -->
      <div v-if="status === 'loading' || status === 'redirecting'" class="space-y-4">
        <div class="w-12 h-12 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p class="text-lg font-medium text-foreground">
          {{ status === 'loading' ? 'Выполняется вход...' : 'Перенаправление...' }}
        </p>
        <p class="text-sm text-muted-foreground">
          Пожалуйста, подождите
        </p>
      </div>

      <!-- Error -->
      <div v-else-if="status === 'error'" class="space-y-4">
        <div class="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
          <Icon name="lucide:x-circle" class="w-8 h-8 text-destructive" />
        </div>
        <h1 class="text-xl font-bold text-foreground">
          Ошибка входа
        </h1>
        <p class="text-muted-foreground">
          {{ errorMessage }}
        </p>
        <NuxtLink
          to="/"
          class="inline-block mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          На главную
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

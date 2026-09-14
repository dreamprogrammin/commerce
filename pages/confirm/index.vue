<script setup lang="ts">
import { pageShell } from '@/lib/shell'

definePageMeta({ layout: 'shell', shell: pageShell })

const user = useSupabaseUser()
const isLoading = ref(false)

watch(
  user,
  () => {
    if (user.value) {
      isLoading.value = false
      // `/dashboard` на сайте нет — личный кабинет живёт на `/profile`.
      return navigateTo('/profile')
    }
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <div>
    <h1>Страница для подтверждение почты</h1>
    <div v-show="isLoading">
      Загрузка
    </div>
    <div v-if="user">
      <h2>Email подтвержден</h2>
      <nuxt-link to="/profile">
        Перейти в личный кабинет
      </nuxt-link>
    </div>

    <div v-else>
      <h2>Email не подтвержден</h2>

      <button>Отправить письмо повторно</button>
    </div>
  </div>
</template>

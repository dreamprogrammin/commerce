<script setup lang="ts">
import type { IParamsForgotPassword } from '~/types/type'

import { pageShell } from '@/lib/shell'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useAuthStore } from '~/stores/auth'

definePageMeta({ layout: 'shell', shell: pageShell })

const isLoading = ref(false)
const email = ref('')
const authStore = useAuthStore()
const modalStore = useModalStore()
const message = ref('')

async function handleResetPassword() {
  const params: IParamsForgotPassword = {
    email: email.value,
    option: {
      redirectTo: `${window.location.origin}/reset-password`,
    },
  }
  try {
    isLoading.value = true
    await authStore.handleForgotPassword(params)
  }
  catch (error) {
    message.value = authStore.errors.forgotPassword || 'Ошибка'
    throw error
  }
  finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div>
    <h1>Забыли пароль</h1>

    <form @submit.prevent="handleResetPassword">
      <label for="email">Ваш email адрес</label>
      <input
        id="email"
        v-model="email"
        type="email"
        required
        placeholder="Введите ваш email"
      >
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? "Отправка..." : "Отправить" }}
      </button>
    </form>
    <!--
      Страницы `/login` на сайте нет: вход открывается окном, оно смонтировано
      глобально в `app.vue`. Ссылка вела в 404.
    -->
    <button type="button" class="text-primary hover:underline" @click="modalStore.openLoginModal()">
      Вернуться ко входу
    </button>
    <p v-if="authStore.errors.forgotPassword">
      {{ message }}
    </p>
  </div>
</template>

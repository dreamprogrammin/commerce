<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
import type { IParamsForgotPassword } from '~/type';

const isLoading = ref(false);
const email = ref('');
const authStore = useAuthStore();
const message = ref('');

async function handleResetPassword() {
  const params: IParamsForgotPassword = {
    email: email.value,
    option: {
      redirectTo: `${window.location.origin}/reset-password`
    }
  };
  try {
    isLoading.value = true;
    await authStore.handleForgotPassword(params);
  } catch (error) {
    message.value = authStore.errors.forgotPassword || 'Ошибка';
    throw error;
  } finally {
    isLoading.value = false;
  }
}
</script>
<template>
  <div>
    <h1>Забыли пароль</h1>

    <form @submit.prevent="handleResetPassword">
      <label for="email">Ваш email адрес</label>
      <input v-model="email" type="email" id="email" required placeholder="Введите ваш email" />
      <button type="submit" :disabled="isLoading">
        {{ isLoading ? 'Отправка...' : 'Отправить' }}
      </button>
    </form>
    <nuxt-link to="/login">Вернутся в авторизации</nuxt-link>
    <p v-if="authStore.errors.forgotPassword">{{ message }}</p>
  </div>
</template>

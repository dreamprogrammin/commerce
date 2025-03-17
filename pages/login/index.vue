<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const email = ref('');
const password = ref('');

const authStore = useAuthStore();

async function handleLogin() {
  try {
    await authStore.handleLogin(email.value, password.value);
    await navigateTo('/dashboard');
  } catch (error) {
    console.log('ошибка', error);
  }
}
</script>
<template>
  <div>
    <h1>Страница авторизации</h1>
    <form @submit.prevent="handleLogin">
      <input type="email" v-model="email" placeholder="email" />
      <input type="password" v-model="password" placeholder="password" />
      <button type="submit">Войти</button>
    </form>
    <div>
      <p v-if="authStore.errors.login">{{ authStore.errors.login }}</p>
    </div>
    <nuxt-link to="/register">У вас нет аккаунта?</nuxt-link>
    <br />
    <nuxt-link to="/forgot-password">Забыли пароль?</nuxt-link>
  </div>
</template>

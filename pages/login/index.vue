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

async function handleAuthGoogle() {
  try {
    await authStore.handleAuthGoogle('google')
    await navigateTo('/dashboard')
  } catch (error) {
    console.log(error)
  }
}

async function handleAuthApple() {
  try {
    await authStore.handleAuthApple('apple')
  } catch (error) {
    console.log(error)
  }
}
</script>
<template>
  <div>
    <h1>Страница авторизации</h1>
    <form @submit.prevent="handleLogin">
      <input type="email" v-model="email" placeholder="введите email или номер телефона" />
      <input type="password" v-model="password" placeholder="password" />
      <button type="submit">Войти</button>
    </form>
    <div>
      <h2>войти как пользователь социальной сети</h2>
      <div class="socials">
        <button @click="handleAuthGoogle">google</button>
        <br />
        <span>apple</span>
      </div>
    </div>
    <div>
      <p v-if="authStore.errors.login">{{ authStore.errors.login }}</p>
    </div>
    <nuxt-link to="/register">У вас нет аккаунта?</nuxt-link>
    <br />
    <nuxt-link to="/forgot-password">Забыли пароль?</nuxt-link>
  </div>
</template>

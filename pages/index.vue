<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const email = ref("");
const password = ref("");

const authStore = useAuthStore();

async function handleRegister() {
  try {
    await authStore.handleRegister(email.value, password.value);
    navigateTo("/");
  } catch (error) {
    console.log("ошибка", error);
  }
}
</script>
<template>
  <div>
    <h1>Страница Регистрации</h1>
    <form @submit.prevent="handleRegister">
      <input type="email" v-model="email" placeholder="email" />
      <input type="password" v-model="password" placeholder="password" />
      <button type="submit">Войти</button>
    </form>
    <nuxt-link to="/register">У вас есть аккаунт?</nuxt-link>
  </div>
</template>

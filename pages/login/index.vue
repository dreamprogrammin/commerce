<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
const email = ref("");
const password = ref("");

const authStore = useAuthStore();
</script>
<template>
  <div>
    <h1>Страница авторизации</h1>
    <form @submit.prevent="">
      <input
        type="email"
        v-model="email"
        placeholder="введите email или номер телефона"
      />
      <input type="password" v-model="password" placeholder="password" />
      <button type="submit">Войти</button>
    </form>
    <div>
      <h2>войти как пользователь социальной сети</h2>
      <div class="socials">
        <button @click="">google</button>
        <br />
        <button>apple</button>
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

<script setup lang="ts">
import type { ParamsSignUp } from "~/types/type";
import { useAuthStore } from "~/stores/auth";
const formData = ref<ParamsSignUp>({
  email: "",
  password: "",
  confirmPassword: "",
});
const authStore = useAuthStore();

async function handleRegister() {}
</script>
<template>
  <div>
    <h1>Страница Регистрации</h1>
    <form @submit.prevent="handleRegister">
      <label for="email">Почта</label>
      <input
        type="email"
        v-model="formData.email"
        placeholder="Введите email"
        required
        id="email"
      />
      <br />
      <label for="password">Пароль</label>
      <input
        type="password"
        v-model="formData.password"
        placeholder="Введите пароль"
        required
        id="password"
      />
      <br />
      <label for="confirmPassword">Повторить пароль</label>
      <input
        type="password"
        v-model="formData.confirmPassword"
        placeholder="Повторите пароль"
        id="confirmPassword"
      />
      <br />
      <button type="submit">Зарегистрироваться</button>
    </form>
    <div>
      <p v-if="authStore.errors.register">{{ authStore.errors.register }}</p>
    </div>
    <nuxt-link to="/login">У вас есть аккаунт?</nuxt-link>
  </div>
</template>

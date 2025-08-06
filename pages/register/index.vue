<script setup lang="ts">
import type { ParamsSignUp } from '~/types/type'
import { useAuthStore } from '~/stores/auth'

const formData = ref<ParamsSignUp>({
  email: '',
  password: '',
  confirmPassword: '',
})
const authStore = useAuthStore()

async function handleRegister() {}
</script>

<template>
  <div>
    <h1>Страница Регистрации</h1>
    <form @submit.prevent="handleRegister">
      <label for="email">Почта</label>
      <input
        id="email"
        v-model="formData.email"
        type="email"
        placeholder="Введите email"
        required
      >
      <br>
      <label for="password">Пароль</label>
      <input
        id="password"
        v-model="formData.password"
        type="password"
        placeholder="Введите пароль"
        required
      >
      <br>
      <label for="confirmPassword">Повторить пароль</label>
      <input
        id="confirmPassword"
        v-model="formData.confirmPassword"
        type="password"
        placeholder="Повторите пароль"
      >
      <br>
      <button type="submit">
        Зарегистрироваться
      </button>
    </form>
    <div>
      <p v-if="authStore.errors.register">
        {{ authStore.errors.register }}
      </p>
    </div>
    <nuxt-link to="/login">
      У вас есть аккаунт?
    </nuxt-link>
  </div>
</template>

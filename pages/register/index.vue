<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
import type { ParamsSignUp } from "~/type";
const formData = ref<ParamsSignUp>({
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  lastName: "",
});
const authStore = useAuthStore();

async function handleRegister() {
  try {
    await authStore.handleRegister(formData.value);
    await navigateTo("/confirm");
  } catch (error) {
    console.log("ошибка", error);
  }
}
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
      <label for="password">Пароль</label>
      <input
        type="password"
        v-model="formData.password"
        placeholder="Введите пароль"
        required
        id="password"
      />
      <label for="confirmPassword">Повторить пароль</label>
      <input
        type="password"
        v-model="formData.confirmPassword"
        placeholder="Повторите пароль"
        id="confirmPassword"
      />
      <label for="firstName">Ваше имя</label>
      <input
        type="name"
        v-model="formData.firstName"
        placeholder="Ваше имя"
        required
        id="firstName"
      />
      <label for="lastName">Ваше фамилия (Не обязательно)</label>
      <input
        type="name"
        v-model="formData.lastName"
        placeholder="Ваше фамилия"
        id="lastName"
      />
      <button type="submit">Зарегистрироваться</button>
    </form>
    <nuxt-link to="/login">У вас есть аккаунт?</nuxt-link>
  </div>
</template>

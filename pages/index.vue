<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";

const authStore = useAuthStore();
onMounted(() => {
  authStore.initializeAuthState();
});
</script>

<template>
  <div>
    <h1>Домашняя Страница</h1>
    <div v-if="authStore.user">
      <nuxt-link to="/dashboard">Пройти в рабочую страницу</nuxt-link>
    </div>
    <div v-else>
      <nuxt-link to="/login">Войдите в профиль</nuxt-link>
    </div>
  </div>
</template>

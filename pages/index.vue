<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
const user = useSupabaseUser();
const isClient = ref(false);

onMounted(() => {
  isClient.value = true;
});
</script>

<template>
  <div>
    <h1>Домашняя Страница</h1>
    <div v-if="isClient">
      <div v-if="user">
        <nuxt-link to="/dashboard">Пройти в рабочую страницу</nuxt-link>
      </div>
      <div v-else>
        <nuxt-link to="/login">Войдите в профиль</nuxt-link>
      </div>
    </div>
    <div v-else>
      <!-- Заглушка для серверного рендеринга -->
      <p>Загрузка...</p>
    </div>
  </div>
</template>

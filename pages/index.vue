<script setup lang="ts">
import { useAuthStore } from "~/stores/auth";
import { useProfileStore } from "~/stores/profile";

const authStore = useAuthStore();
const profileStore = useProfileStore();

onMounted(async () => {
  await profileStore.loadProfile();
});
</script>
<template>
  <div>
    <h1>Домашняя Страница</h1>

    <div v-if="authStore.user">
      <h2>
        Привет {{ profileStore.displayProfile.first_name }}
        {{ profileStore.displayProfile.last_name }}
      </h2>
      <nuxt-link to="/dashboard">Пройти в рабочую страницу</nuxt-link>
    </div>

    <div v-else>
      Пожалуйста пройдите<nuxt-link to="/login">войдите в систему.</nuxt-link>
    </div>
  </div>
</template>

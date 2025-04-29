<script setup lang="ts">
import { ClientOnly } from "#components";
import { useProfileStore } from "~/stores/profile";
const user = useSupabaseUser();
const profileStore = useProfileStore();
</script>

<template>
  <h1>Добро пожаловать</h1>
  <ClientOnly>
    <div v-if="user">
      <nuxt-link to="/dashboard">Пройти на рабочею страницу</nuxt-link>

    </div>

    <div v-else>
      <nuxt-link to="/login">Пожалуйста авторизуйтесь</nuxt-link>
    </div>
    <template #fallback>
      <div>Загрузка...</div>
    </template>
  </ClientOnly>
</template>

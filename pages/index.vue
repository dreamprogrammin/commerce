<script setup lang="ts">
import { ClientOnly } from "#components";
import { Suspense } from "vue";
import { useAuthStore } from "~/stores/auth";
const user = useSupabaseUser();
</script>

<template>
  <ClientOnly>
    <h1>Добро пожаловать</h1>
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

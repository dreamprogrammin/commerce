<script setup lang="ts">
import { useAuth } from "~/composables/auth/useAuth";
const { handleOut } = useAuth();
</script>
<template>
  <div>
    <h1>Страница для авторизованных и подтвержденных пользователей</h1>
    <div><nuxt-link to="/">На главную</nuxt-link></div>
    <div>
      <button @click="handleOut">Выйти с аккаунта:</button>
    </div>
  </div>
</template>

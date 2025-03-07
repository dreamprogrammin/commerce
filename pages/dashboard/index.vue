<script setup lang="ts">
const authStore = useAuthStore();

async function handleOut() {
  await authStore.handleOut();
  await navigateTo("/");
}
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

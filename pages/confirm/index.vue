<script setup lang="ts">
const user = useSupabaseUser();

watch(
  user,
  () => {
    if (user.value) {
      return navigateTo("/dashboard");
    }
  },
  {
    immediate: true,
  }
);
</script>
<template>
  <div>
    <h1>Страница для подтверждение почты</h1>

    <div v-if="user">
      <h2>Email подтвержден</h2>
      <nuxt-link to="/dashboard">Перейти на рабочую страницу</nuxt-link>
    </div>

    <div v-else>
      <h2>Email не подтвержден</h2>

      <button>Отправить письмо повторно</button>
    </div>
  </div>
</template>

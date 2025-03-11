<script setup lang="ts">
const user = useSupabaseUser();
const isLoading = ref(false);
watch(
  user,
  () => {
    if (user.value) {
      isLoading.value = false;
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
    <div v-show="isLoading">Загрузка</div>
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

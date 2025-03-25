<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';
const authStore = useAuthStore();
let email: any;
const supabase = useSupabaseClient();
async function emailView() {
  const { data } = await supabase.from('profiles').select('*');
  console.log(data);
}
async function handleOut() {
  await authStore.handleOut();
  await navigateTo('/');
}
</script>
<template>
  <div>
    <h1>Страница для авторизованных и подтвержденных пользователей</h1>
    <div><nuxt-link to="/">На главную</nuxt-link></div>
    <div>
      <button @click="handleOut">Выйти с аккаунта:</button>
    </div>
    <button @click="emailView">Расскрыть</button>
  </div>
</template>

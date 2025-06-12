<script setup lang="ts">
import { useProfileStore } from "~/stores/profile";
import { useAuth } from "~/composables/auth/useAuth";
import { useModalStore } from "~/stores/modal/useModalStore";
const { handleAuthGoogle, handleOut } = useAuth();
const profileStore = useProfileStore();
const user = useSupabaseUser();
definePageMeta({
  layout: "profile",
});
const modalStore = useModalStore();
onMounted(async () => {
  if (user.value) {
    await profileStore.loadProfile();
  }
});
</script>
<template>
  <h1>Добро пожаловать на страницу профайла и настройки</h1>
  <ClientOnly>
    <div v-if="user">
      Привет {{ profileStore.displayProfile.first_name }}
      {{ profileStore.displayProfile.last_name }}
      <button @click="handleOut">Выйти с аккаунта:</button>
    </div>

    <div v-else>
      Привет гость
      <button @click="handleAuthGoogle">Войти в профиль</button>
    </div>
    <template #fallback>
      <div>Загрузка...</div>
    </template>
    <div v-if="modalStore.showLoginModal">hi</div>
  </ClientOnly>
</template>

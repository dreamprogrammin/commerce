<script setup lang="ts">
import { useProfileStore } from "~/stores/profile";
import { useAuth } from "~/composables/auth/useAuth";

const { handleAuthGoogle } = useAuth();
const profileStore = useProfileStore();
const user = useSupabaseUser();

// onMounted(async () => {
//     await profileStore.loadProfile();
// });
definePageMeta({
  layout: "profile",
});
async function handleUpdate() {
  await profileStore.updateProfile(profileStore.editProfile);
}
</script>
<template>
  <h1>Добро пожаловать</h1>
  <ClientOnly>
    <div v-if="user">
      <nuxt-link to="/dashboard">Пройти на рабочею страницу</nuxt-link>
      Привет {{ profileStore.displayProfile.first_name }}
      {{ profileStore.displayProfile.last_name }}
    </div>

    <div v-else>
      Привет гость
      <button @click="handleAuthGoogle">Войти в профиль</button>
    </div>
    <template #fallback>
      <div>Загрузка...</div>
    </template>
  </ClientOnly>
</template>

<!-- <template>
  <div>
    <h1>Настройка профайла</h1>

    <div v-if="profileStore.isLoading">Загрузка...</div>
    <div v-else>
      <p v-if="!profileStore.displayProfile.first_name && !profileStore.displayProfile.last_name">
        Привет гость
        <button @click="handleAuthGoogle">Войти в профиль</button>
      </p>
      <p v-else>
        Привет {{ profileStore.displayProfile.first_name }} {{ profileStore.displayProfile.last_name }}
      </p>

      <form @submit.prevent="handleUpdate">
        <input
          v-model="profileStore.editProfile.first_name"
          type="text"
          placeholder="Ваше имя"
        />
        <input
          v-model="profileStore.editProfile.last_name"
          type="text"
          placeholder="Ваше фамилия"
        />
        <input
          type="text"
          v-model="profileStore.editProfile.phone"
          placeholder="Ваш номер телефона"
        />
        <button type="submit" :disabled="profileStore.isSaving">
          {{ profileStore.isSaving ? "Сохранение..." : "Сохранить" }}
        </button>
      </form>
    </div>

    <div>
      <nuxt-link to="/">Перейти домой</nuxt-link>
    </div>
  </div>
</template> -->

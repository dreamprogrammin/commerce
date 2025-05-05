<script setup lang="ts">
import { useProfileStore } from "~/stores/profile";

definePageMeta({
  layout: "profile",
});
const profileStore = useProfileStore();
async function handleUpdate() {
  await profileStore.updateProfile(profileStore.editProfile);
}
</script>

<template>
  <div>
    <h1>Настройка профайла</h1>

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
</template>

<style scoped>
/* Ваши стили */
</style>

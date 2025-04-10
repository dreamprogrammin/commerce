<script setup lang="ts">
import { useProfile } from "~/composables/profile/useProfile";

const loading = ref(true);
const { profile, updateProfile, loadProfile } = useProfile();

onMounted(async () => {
  try {
    await loadProfile();
  } catch (error) {
    throw error;
  } finally {
    loading.value = false;
  }
});

async function handleUpdate() {
  await updateProfile(profile.value);
}
</script>
<template>
  <div>
    <h1>Настройка профайла</h1>

    <div v-if="loading">Загрузка...</div>
    <div v-else>
      <p v-if="!profile.first_name && !profile.last_name">Привет гость</p>
      <p v-else>Привет {{ profile.first_name }} {{ profile.last_name }}</p>

      <form @click.prevent="handleUpdate">
        <input
          v-model="profile.first_name"
          type="text"
          placeholder="Ваше имя"
        />
        <input
          v-model="profile.last_name"
          type="text"
          placeholder="Ваше фамилия"
        />

        <button type="submit">Сохранить</button>
      </form>
    </div>
  </div>
</template>

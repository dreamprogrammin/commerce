<script setup lang="ts">
import { useProfile } from "~/composables/profile/useProfile";
const {
  displayProfile,
  editProfile,
  updateProfile,
  loadProfile,
  isLoading,
  isSaving,
} = useProfile();

onMounted(async () => {
  try {
    await loadProfile();
  } catch (error) {
    throw error;
  }
});

async function handleUpdate() {
  await updateProfile(editProfile.value);
}
</script>
<template>
  <div>
    <h1>Настройка профайла</h1>

    <div v-if="isLoading">Загрузка...</div>
    <div v-else>
      <p v-if="!displayProfile.first_name && !displayProfile.last_name">
        Привет гость
      </p>
      <p v-else>
        Привет {{ displayProfile.first_name }} {{ displayProfile.last_name }}
      </p>

      <form @submit.prevent="handleUpdate">
        <input
          v-model="editProfile.first_name"
          type="text"
          placeholder="Ваше имя"
        />
        <input
          v-model="editProfile.last_name"
          type="text"
          placeholder="Ваше фамилия"
        />
        <input
          type="text"
          v-model="editProfile.phone"
          placeholder="Ваш номер телефона"
        />
        <button type="submit" :disabled="isSaving">
          {{ isSaving ? "Сохранение..." : "Сохранить" }}
        </button>
      </form>
    </div>

    <div>
      <nuxt-link to="/">Перейти домой</nuxt-link>
    </div>
  </div>
</template>

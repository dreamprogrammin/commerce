<script setup lang="ts">
import { useProfileStore } from '~/stores/profile';


const profileStore = useProfileStore();

onMounted(async () => {
    await profileStore.loadProfile();
});

async function handleUpdate() {
  await profileStore.updateProfile(profileStore.editProfile);
}
</script>
<template>
  <div>
    <h1>Настройка профайла</h1>

    <div v-if="profileStore.isLoading">Загрузка...</div>
    <div v-else>
      <p v-if="!profileStore.displayProfile.first_name && !profileStore.displayProfile.last_name">
        Привет гость
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
</template>

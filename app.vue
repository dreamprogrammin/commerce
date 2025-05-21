<script setup lang="ts">
import { useProfileStore } from "~/stores/profile";
import { AuthLoginModal } from "#components";
import { useModalStore } from "./stores/modal/useModalStore";
const user = useSupabaseUser();
const profileStore = useProfileStore();
const modalStore = useModalStore();
const isLoaded = ref(false);

onMounted(async () => {
  if (user.value) {
    await profileStore.loadProfile();
  }
  isLoaded.value = true;
});
</script>
<template>
  <CommonHeader />
  <main class="app-container">
    <CommonTabBar />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </main>
  <ClientOnly>
    <AuthLoginModal v-if="modalStore.showLoginModal" />
  </ClientOnly>
</template>

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
  <header>
    <CommonHeaderTop />
    <CommonHeader />
  </header>
    <main class="container max-w-screen-2xl px-4 mx-auto">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </main>
  <AuthLoginModal v-if="modalStore.showLoginModal" />
</template>

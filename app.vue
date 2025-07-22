<script setup lang="ts">
import { useProfileStore } from "@/stores/profile";
import { useModalStore } from "@/stores/modal/useModalStore";

const user = useSupabaseUser();
const profileStore = useProfileStore();
const modalStore = useModalStore();

if (user.value && import.meta.server) {
  profileStore.loadProfile();
}
</script>

<template>
  <div>
    <CommonHeader />

    <main class="app-container">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </main>

    <ClientOnly>
      <AuthLoginModal v-if="modalStore.showLoginModal" />
    </ClientOnly>
  </div>
</template>

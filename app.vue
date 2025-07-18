<script setup lang="ts">
import { useProfileStore } from '@/stores/profile';
import { useModalStore } from './stores/modal/useModalStore';
const isLoaded = ref(false);

const nuxtApp = useNuxtApp();
const isLoading = ref(false);

nuxtApp.hook('page:start', () => {
  isLoading.value = true;
});
nuxtApp.hook('page:finish', () => {
  setTimeout(() => {
    isLoading.value = false;
  }, 300);
});

const user = useSupabaseUser();
const profileStore = useProfileStore();
const modalStore = useModalStore();

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
    <NuxtLayout>
      <Suspense>
        <template #default>
          <NuxtPage />
        </template>
        <template #fallback>
          <div class="fixed inset-0 pt-20">
            <CommonAppLoader />
          </div>
        </template>
      </Suspense>
    </NuxtLayout>
  </main>
  <ClientOnly>
    <AuthLoginModal v-if="modalStore.showLoginModal" />
  </ClientOnly>
</template>

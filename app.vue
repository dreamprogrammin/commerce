<script setup lang="ts">
import { useProfileStore } from '@/stores/profile';
import { useModalStore } from '@/stores/modal/useModalStore';

const nuxtApp = useNuxtApp();
const isLoadingPage = ref(true);

nuxtApp.hook('page:start', () => {
  isLoadingPage.value = true;
});

nuxtApp.hook('page:finish', () => {
  setTimeout(() => {
    isLoadingPage.value = false;
  }, 300);
});

const user = useSupabaseUser();
const profileStore = useProfileStore();
const modalStore = useModalStore();

if (user.value && import.meta.server) {
  await profileStore.loadProfile();
}

// Простое решение для первой загрузки
onMounted(() => {
  setTimeout(() => {
    isLoadingPage.value = false;
  }, 300);
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

  <Transition>
    <AppLoader v-if="isLoadingPage" />
  </Transition>

  <ClientOnly>
    <AuthLoginModal v-if="modalStore.showLoginModal" />
  </ClientOnly>
</template>

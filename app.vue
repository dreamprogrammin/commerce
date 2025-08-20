<script setup lang="ts">
import { useModalStore } from '@/stores/modal/useModalStore'
import { useProfileStore } from '@/stores/profile'

const user = useSupabaseUser()
const profileStore = useProfileStore()
const modalStore = useModalStore()

watch(
  user,
  async (newUser) => {
    if (newUser) {
      await profileStore.loadProfile()
    }
    else {
      profileStore.clearProfile()
    }
  },
  { immediate: true },
)
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

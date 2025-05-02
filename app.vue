<script setup lang="ts">
import { ClientOnly } from "#components";
import { useProfileStore } from "~/stores/profile";

const user = useSupabaseUser()
const profileStore = useProfileStore();
const isLoaded = ref(false);
const isProfileLoaded = ref(false)

onMounted(async () => {
  if (user.value) {
    await profileStore.loadProfile();
  }
  isLoaded.value = true;
});
</script>
<template>
  <CommonHeader />

<main>
  <NuxtLayout>
    <NuxtPage>
  </NuxtLayout>
</main>
</template>

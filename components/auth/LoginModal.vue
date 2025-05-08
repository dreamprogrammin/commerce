<script setup lang="ts">
import { useAuth } from "~/composables/auth/useAuth";
import { useModalStore } from "~/stores/modal/useModalStore";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogDescription,
} from "../ui/dialog";

const modalStore = useModalStore();
const { handleAuthGoogle } = useAuth();
const isOpen = computed({
  get: () => modalStore.showLoginModal,
  set: (value) => {
    if (!value) {
      modalStore.closeLoginModal();
    }
  },
});
</script>

<template>
  <Dialog :open="isOpen" @update:open="isOpen = $event">
    <DialogContent class="w-20rem">
      <DialogHeader>
        <DialogTitle>Вход</DialogTitle>
        <DialogDescription> Войти с помощью </DialogDescription>
      </DialogHeader>
      <button @click="handleAuthGoogle">Google</button>
    </DialogContent>
  </Dialog>
</template>

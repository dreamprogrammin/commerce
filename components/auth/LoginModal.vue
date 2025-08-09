<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '~/composables/auth/useAuth'
import { useModalStore } from '~/stores/modal/useModalStore'

const modalStore = useModalStore()
const { handleAuthGoogle } = useAuth()
const isOpen = computed({
  get: () => modalStore.showLoginModal,
  set: (value) => {
    if (!value) {
      modalStore.closeLoginModal()
    }
  },
})
</script>

<template>
  <Dialog :open="isOpen" @update:open="isOpen = $event">
    <DialogTrigger> Edit Profile </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Edit profile</DialogTitle>
        <DialogDescription>
          Make changes to your profile here. Click save when you're done.
        </DialogDescription>
      </DialogHeader>

      <DialogFooter> Save changes </DialogFooter>
      <Button @click="handleAuthGoogle">
        Google
      </Button>
    </DialogContent>
  </Dialog>
</template>

<style></style>

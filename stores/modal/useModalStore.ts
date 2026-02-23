import { defineStore } from 'pinia'

export const useModalStore = defineStore('modalStore', () => {
  const showLoginModal = ref<boolean>(false)
  const showTelegramModal = ref<boolean>(false)

  function openLoginModal() {
    showLoginModal.value = true
  }

  function closeLoginModal() {
    showLoginModal.value = false
  }

  // ✅ Добавляем toggle для удобства
  function toggleLoginModal() {
    showLoginModal.value = !showLoginModal.value
  }

  function openTelegramModal() {
    showTelegramModal.value = true
  }

  function closeTelegramModal() {
    showTelegramModal.value = false
  }

  return {
    // State
    showLoginModal,
    showTelegramModal,

    // Actions
    openLoginModal,
    closeLoginModal,
    toggleLoginModal,
    openTelegramModal,
    closeTelegramModal,
  }
})

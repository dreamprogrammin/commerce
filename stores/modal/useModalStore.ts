import { defineStore } from "pinia"

export const useModalStore = defineStore('modalStore', () => {
  const showLoginModal = ref<boolean>(false)

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

  return {
    // State
    showLoginModal,

    // Actions
    openLoginModal,
    closeLoginModal,
    toggleLoginModal,
  }
})

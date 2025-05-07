export const useModalStore = defineStore("modalStore", () => {
  const showLoginModal = ref<boolean>(false);

  function openLoginModal() {
    showLoginModal.value = true;
  }

  function closeLoginModal() {
    showLoginModal.value = false;
  }

  return {
    openLoginModal,
    showLoginModal,
    closeLoginModal,
  };
});

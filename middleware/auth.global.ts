import { useModalStore } from "~/stores/modal/useModalStore";

export default defineNuxtRouteMiddleware((to, _from) => {
  const user = useSupabaseUser();
  const modalStore = useModalStore();
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/confirm",
    "/forgot-password",
    "/reset-password",
    "/profile",
  ];
  const profilePath = [
    "/profile/bonus",
    "/profile/favorites",
    "/profile/order",
    "/profile/settings",
  ];
  // if (user.value === null) {
  //   return navigateTo("/login");
  // }
  if (user.value && !user.value?.confirmed_at) {
    return navigateTo("/confirm");
  }

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo("/login");
  }

  if (user.value && ["/login", "/register"].includes(to.path)) {
    return navigateTo("/dashboard");
  }
  if (to.path === "/profile" && !user.value) {
    return navigateTo("/login");
  }
  if (profilePath.includes(to.path) && !user.value) {
    modalStore.openLoginModal();

    return abortNavigation();
  }
});

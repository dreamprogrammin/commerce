import { useModalStore } from "~/stores/modal/useModalStore";

export default defineNuxtRouteMiddleware((to, _from) => {
  const user = useSupabaseUser();
  const modalStore = useModalStore();
  const dashboard = "/dashboard";
  const profilePath = [
    "/profile/bonus",
    "/profile/favorites",
    "/profile/order",
    "/profile/settings",
  ];
  if (!user.value && to.path === dashboard) {
    return navigateTo("/login");
  }

  if (user.value && ["/login", "/register"].includes(to.path)) {
    return navigateTo("/");
  }
  if (profilePath.includes(to.path) && !user.value) {
    modalStore.openLoginModal();

    return abortNavigation();
  }
});

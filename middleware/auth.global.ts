import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware(async (to, _from) => {
  const authStore = useAuthStore();
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/confirm",
    "/forgot-password",
    "/reset-password",
  ];
  if (authStore.user === null) {
    return;
  }
  if (authStore.user && !authStore.user?.confirmed_at) {
    return navigateTo("/confirm");
  }

  if (!authStore.user && !publicRoutes.includes(to.path)) {
    return navigateTo("/login");
  }

  if (authStore.user && ["/login", "/register"].includes(to.path)) {
    return navigateTo("/dashboard");
  }
  if (to.path === "/profile" && !authStore.user) {
    return navigateTo("/login");
  }
});

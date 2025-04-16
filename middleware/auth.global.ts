import { useAuthStore } from "~/stores/auth";

export default defineNuxtRouteMiddleware((to, _from) => {
  const authStore = useAuthStore();
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/confirm",
    "/forgot-password",
    "/reset-password",
  ];

  const isPublicRoutes = publicRoutes.includes(to.path);
  const isAuthenticated = !!authStore.user;

  if (!isAuthenticated && !isPublicRoutes) {
    return navigateTo("/login");
  }

  if (isAuthenticated && ["/login"].includes(to.path)) {
    return navigateTo("/dashboard");
  }
  if (authStore.user && !authStore.user?.email_confirmed_at) {
    return navigateTo("/confirm");
  }

  if (authStore.user && ["/login", "/register"].includes(to.path)) {
    return navigateTo("/dashboard");
  }
  if (to.path === "/profile" && !authStore.user) {
    return navigateTo("/login");
  }
});

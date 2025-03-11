export default defineNuxtRouteMiddleware((to, _from) => {
  const user = useSupabaseUser();
  const publicRoutes = [
    "/",
    "/login",
    "/register",
    "/confirm",
    "/forgot-password",
    "/reset-password",
  ];

  if (user.value && !user.value?.email_confirmed_at) {
    return navigateTo("/confirm");
  }

  if (!user.value && !publicRoutes.includes(to.path)) {
    return navigateTo("/login");
  }

  if (user.value && ["/login", "/register"].includes(to.path)) {
    return navigateTo("/dashboard");
  }
});

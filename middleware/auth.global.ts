export default defineNuxtRouteMiddleware((to, _from) => {
  const user = useSupabaseUser();
  const publicRoutes = ["/", "/login", "/register"];
  const isPublicRoute = publicRoutes.includes(to.path);
  if (!user.value && !isPublicRoute) {
    return navigateTo("/login");
  }
});

import { handleError } from "./errorHandles";
import { useAuthStore } from "./useAuthStore";
export function createAuthAction() {
  const errors = reactive<{ [action: string]: string }>({});
  const authStore = useAuthStore();

  function setError(newError: { [action: string]: string }) {
    Object.assign(errors, newError);
  }

  async function handleOut() {
    try {
      await authStore.supabase.auth.signOut();
      setError({});
    } catch (error) {
      setError({ logout: handleError(error, "logout") });
      throw error;
    }
  }

  async function handleAuthGoogle(provider: "google" | "apple") {
    try {
      const { error } = await authStore.supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/`,
          scopes: "profile email",
        },
      });
      if (error) {
        throw error;
      }
      setError({});
    } catch (error) {
      setError({ google: handleError(error, "googleErr") });
      throw error;
    }
  }

  return {
    errors,
    handleOut,
    handleAuthGoogle,
  };
}

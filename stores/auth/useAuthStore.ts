import type { Database } from "~/types/supabase";
import { createAuthAction } from "./actionAuth";

export const useAuthStore = defineStore("authStore", () => {

  const supabase = useSupabaseClient<Database>();
  const {
    handleForgotPassword,
    handleLogin,
    handleRegister,
    handleOut,
    errors,
    handleAuthGoogle,
    handleAuthApple,
  } = createAuthAction();

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN") {
      user.value = session?.user;
    }
  });

  return {
    errors,
    handleForgotPassword,
    handleLogin,
    handleRegister,
    handleOut,
    handleAuthGoogle,
    handleAuthApple,
    supabase,
  };
});
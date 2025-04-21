import type { Database } from "~/types/supabase";
import { createAuthAction } from "./actionAuth";

export const useAuthStore = defineStore("authStore", () => {
  const supabase = useSupabaseClient<Database>();
  const user = useSupabaseUser();
  const isClient = ref(false);
  const {
    handleForgotPassword,
    handleLogin,
    handleRegister,
    handleOut,
    errors,
    handleAuthGoogle,
    handleAuthApple,
  } = createAuthAction();

  async function initializeAuthState() {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.log("ошибка данных при получения пользователя");
        user.value = null;
      } else {
        user.value = data.user ?? null;
      }
    } catch (error) {
      console.log("не удалось инициализировать данные");
      user.value = null;
    }
  }
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.log("ошибка при обновление данных пользователя", error);
        user.value = null;
      } else {
        user.value = data.user ?? null;
      }
    } else if (event === "SIGNED_OUT") {
      user.value = null;
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
    user,
    isClient,
    initializeAuthState,
  };
});

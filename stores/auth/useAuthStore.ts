import type { Database } from "~/types/supabase";
import { createAuthAction } from "./actionAuth";

export const useAuthStore = defineStore("authStore", () => {
  const supabase = useSupabaseClient<Database>();
  const user = useSupabaseUser();
  const isClient = ref(false);

  console.log(user.value);

  const { handleOut, errors, handleAuthGoogle } = createAuthAction();
  return {
    errors,
    handleOut,
    handleAuthGoogle,
    supabase,
    user,
    isClient,
  };
});

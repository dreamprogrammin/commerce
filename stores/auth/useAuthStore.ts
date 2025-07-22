import type { Database } from "@/types/supabase";
import { createAuthAction } from "./actionAuth";

export const useAuthStore = defineStore("authStore", () => {
  const supabase = useSupabaseClient<Database>();
  const isClient = ref(false);

  const { handleOut, errors, handleAuthGoogle } = createAuthAction();
  return {
    errors,
    handleOut,
    handleAuthGoogle,
    supabase,
    isClient,
  };
});

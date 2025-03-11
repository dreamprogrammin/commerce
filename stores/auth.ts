import { defineStore } from "pinia";
import { signIn, signOut, signUp } from "~/composables/useAuth";
import type { User } from "@supabase/supabase-js";
import type { ParamsSignUp } from "~/type";

export const useAuthStore = defineStore(
  "store",
  () => {
    const user = ref<User | null>(null);

    async function handleLogin(email: string, password: string) {
      try {
        const userData = await signIn(email, password);
        user.value = userData;
      } catch (error) {
        console.log((error as Error).message);
        throw error;
      }
    }

    async function handleOut() {
      await signOut();
      user.value = null;
    }

    async function handleRegister(params: ParamsSignUp) {
      try {
        const userData = await signUp(params);
        user.value = userData;
      } catch (error) {
        console.log((error as Error).message);
        throw error;
      }
    }

    return {
      user,
      handleLogin,
      handleOut,
      handleRegister,
    };
  },
  {
    persist: {
      storage: piniaPluginPersistedstate.localStorage(),
    },
  }
);

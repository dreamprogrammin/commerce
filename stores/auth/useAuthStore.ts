import { defineStore } from 'pinia';
import type { Database } from '@/types/supabase';
import { handleError } from './errorHandles'; 

export const useAuthStore = defineStore('authStore', () => {
  // === STATE ===
  const supabase = useSupabaseClient<Database>();
  const errors = ref<{ [action: string]: string }>({}); // Используем ref для реактивности ошибок

  // === ACTIONS ===
  function setErrors(newErrors: { [action: string]: string }) {
    errors.value = newErrors;
  }
  async function handleOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setErrors({}); 
    } catch (error) {
      setErrors({ logout: handleError(error, 'logout') });
      console.error("Ошибка при выходе:", error);
      // throw error; 
    }
  }

  // --- Вход через OAuth ---
  async function handleAuthGoogle(provider: 'google' | 'apple' = 'google') {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/profile`, 
          scopes: 'profile email',
        },
      });

      if (error) throw error;
      setErrors({});
      
    } catch (error) {
      setErrors({ google: handleError(error, 'googleErr') });
      console.error("Ошибка при входе через Google:", error);
      // throw error;
    }
  }

  // === RETURN ===
  return {
    errors,
    handleOut,
    handleAuthGoogle,
  };
});
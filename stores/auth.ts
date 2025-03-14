import { defineStore } from 'pinia';
import { signIn, signOut, signUp } from '~/composables/auth/useAuth';
import type { User } from '@supabase/supabase-js';
import type { ParamsSignUp } from '~/type';
import { forgotPassword } from '~/composables/auth/useForgotPassword';

export const useAuthStore = defineStore(
  'authStore',
  () => {
    const user = ref<User | null>(null);
    const errors = reactive<{ [action: string]: string }>({});

    function setError(newError: { [action: string]: string }) {
      Object.assign(errors, newError);
    }

    function handleError(err: unknown, action: string = 'general') {
      const authError = err as Error;

      console.log(`${[action]} ошибка:`, authError.message);

      const generalError: { [key: string]: string } = {
        'User not found': 'Пользователь с таким email не найден',
        'Invalid login credentials': 'Неверный email или пароль',
        'Email already registered': 'Этот email уже зарегистрирован',
        'Network error': 'Проблемы с сетью. Пожалуйста, проверьте подключение.'
      };

      const actionHandlers: { [key: string]: (message: string) => string } = {
        login: message => {
          if (authError.message.includes('Invalid login credentials')) {
            return 'Неверный email или пароль';
          }
          return generalError[message] || 'Ошибка при входе';
        },
        register: message => {
          if (authError.message.includes('Email already registered')) {
            return 'Этот email уже зарегистрирован';
          }
          return generalError[message] || 'Ошибка в регистрации';
        },
        forgotPassword: message => {
          if (authError.message.includes('User not found')) {
            return 'Пользователь с таким email не найден';
          }
          return generalError[message] || 'Ошибка восстановления пароля';
        },
        logout: message => {
          return generalError[message] || 'Ошибка при выходе';
        }
      };

      let errorMessage = generalError[authError.message] || 'Произошла ошибка';

      if (actionHandlers[action]) {
        errorMessage = actionHandlers[action](authError.message);
      }
    }

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
      handleRegister
    };
  },
  {
    persist: {
      storage: piniaPluginPersistedstate.localStorage()
    }
  }
);

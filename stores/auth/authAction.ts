import type { User } from '@supabase/supabase-js';
import type { IParamsForgotPassword, ParamsSignUp } from '~/type';
import { signIn, signUp, signOut, signInOtp } from '~/composables/auth/useAuth';
import { forgotPassword } from '~/composables/auth/useForgotPassword';
import { handleError } from './errorHandles';
export function createAuthAction() {
  const user = ref<User | { provider: string } | null>(null);
  const errors = reactive<{ [action: string]: string }>({});

  function setError(newError: { [action: string]: string }) {
    Object.assign(errors, newError);
  }

  async function handleLogin(email: string, password: string) {
    try {
      const userData = await signIn(email, password);
      user.value = userData;
      setError({});
    } catch (error) {
      setError({ login: handleError(error, 'login') });
      throw error;
    }
  }

  async function handleOut() {
    try {
      await signOut();
      user.value = null;
      setError({});
    } catch (error) {
      setError({ logout: handleError(error, 'logout') });
      throw error;
    }
  }

  async function handleRegister(params: ParamsSignUp) {
    try {
      const userData = await signUp(params);
      user.value = userData;
      setError({});
    } catch (error) {
      setError({ register: handleError(error, 'register') });
      throw error;
    }
  }

  async function handleForgotPassword(params: IParamsForgotPassword) {
    try {
      await forgotPassword(params);
      setError({});
    } catch (error) {
      setError({ forgotPassword: handleError(error, 'forgotPassword') });
      throw error;
    }
  }

  async function handleAuthGoogle(provider: 'google') {
    try {
      const userData = await signInOtp(provider);
      user.value = userData;
      setError({});
    } catch (error) {
      setError({ google: handleError(error, 'googleErr') });
      throw error;
    }
  }

  async function handleAuthApple(provider: 'apple') {
    try {
      const userData = await signInOtp(provider) 
      user.value = userData
      setError({})
    } catch (error) {
      setError({ apple: handleError(error, 'appleErr') });
      throw error
    }
  }

  return {
    user,
    errors,
    handleLogin,
    handleOut,
    handleRegister,
    handleForgotPassword,
    handleAuthGoogle,
    handleAuthApple
  };
}

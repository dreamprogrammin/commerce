import type { User } from '@supabase/supabase-js';
import type { IParamsForgotPassword, ParamsSignUp } from '~/type';
import { signIn, signUp, signOut, signInOtp } from '~/composables/auth/useAuth';
import { forgotPassword } from '~/composables/auth/useForgotPassword';
import { handleError } from './errorHandles';
export function createAuthAction() {
  const errors = reactive<{ [action: string]: string }>({});

  function setError(newError: { [action: string]: string }) {
    Object.assign(errors, newError);
  }

  async function handleLogin(email: string, password: string) {
    try {
      await signIn(email, password);
      setError({});
    } catch (error) {
      setError({ login: handleError(error, 'login') });
      throw error;
    }
  }

  async function handleOut() {
    try {
      await signOut();
      setError({});
    } catch (error) {
      setError({ logout: handleError(error, 'logout') });
      throw error;
    }
  }

  async function handleRegister(params: ParamsSignUp) {
    try {
      await signUp(params);
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
      await signInOtp(provider);
      setError({});
    } catch (error) {
      setError({ google: handleError(error, 'googleErr') });
      throw error;
    }
  }

  async function handleAuthApple(provider: 'apple') {
    try {
      await signInOtp(provider);
      setError({});
    } catch (error) {
      setError({ apple: handleError(error, 'appleErr') });
      throw error;
    }
  }

  return {
    errors,
    handleLogin,
    handleOut,
    handleRegister,
    handleForgotPassword,
    handleAuthGoogle,
    handleAuthApple
  };
}

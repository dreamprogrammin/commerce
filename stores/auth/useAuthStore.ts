import { createAuthAction } from './authAction';

export const useAuthStore = defineStore('authStore', () => {
  const { handleForgotPassword, handleLogin, handleRegister, handleOut, errors, handleAuthGoogle, handleAuthApple } =
    createAuthAction();

  return {
    errors,
    handleForgotPassword,
    handleLogin,
    handleRegister,
    handleOut,
    handleAuthGoogle,
    handleAuthApple
  };
});

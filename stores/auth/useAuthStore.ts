import { createAuthAction } from './authAction';

export const useAuthStore = defineStore(
  'authStore',
  () => {
    const { handleForgotPassword, handleLogin, handleRegister, handleOut, user, errors,handleAuthGoogle, handleAuthApple } = createAuthAction();

    return {
      user,
      errors,
      handleForgotPassword,
      handleLogin,
      handleRegister,
      handleOut,
      handleAuthGoogle,
      handleAuthApple
    };
  },
  {
    persist: {
      storage: piniaPluginPersistedstate.localStorage()
    }
  }
);

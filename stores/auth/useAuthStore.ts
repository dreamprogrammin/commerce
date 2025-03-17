import { createAuthAction } from './authAction';

export const useAuthStore = defineStore(
  'authStore',
  () => {
    const { handleForgotPassword, handleLogin, handleRegister, handleOut, user, errors } = createAuthAction();

    return {
      user,
      errors,
      handleForgotPassword,
      handleLogin,
      handleRegister,
      handleOut
    };
  },
  {
    persist: {
      storage: piniaPluginPersistedstate.localStorage()
    }
  }
);

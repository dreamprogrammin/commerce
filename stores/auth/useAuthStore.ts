import { createAuthAction } from "./actionAuth";


export const useAuthStore = defineStore('authStore', () => {
  const user = useSupabaseUser()
  const { handleForgotPassword, handleLogin, handleRegister, handleOut, errors, handleAuthGoogle, handleAuthApple } =
    createAuthAction();

  return {
    errors,
    handleForgotPassword,
    handleLogin,
    handleRegister,
    handleOut,
    handleAuthGoogle,
    handleAuthApple,
    user
  };
});

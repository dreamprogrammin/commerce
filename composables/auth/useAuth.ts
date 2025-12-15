import type { ParamsSignUp } from '@/types/type'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { validatorSingUp } from '@/validator/signUp.validator'

export async function signIn(email: string, password: string) {
  const supabase = useSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    throw new Error(error.message || 'Ошибка входа')
  }
}

export async function signInOtp() {
  const supabase = useSupabaseClient()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      scopes: 'profile email',
    },
  })
  if (error) {
    throw error
  }
}

export async function signUp(params: ParamsSignUp) {
  const supabase = useSupabaseClient()
  validatorSingUp(params)
  const { email, password } = params
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/confirm`,
    },
  })
  if (error) {
    throw new Error(error.message || 'Ошибка регистрации')
  }
}

export async function signOut() {
  const supabase = useSupabaseClient()
  await supabase.auth.signOut()
}

export function useAuth() {
  const authStore = useAuthStore()

  async function handleAuthGoogle() {
    try {
      await authStore.signInWithOAuth('google', '/')
    }
    catch (error) {
      console.error('Google auth error:', error)
      throw error
    }
  }

  async function handleOut() {
    await authStore.signOut()
  }

  return {
    handleAuthGoogle,
    handleOut,
  }
}

import type { ParamsSignUp } from "~/types/type";
import { validatorSingUp } from "~/validator/signUp.validator";
export async function signIn(email: string, password: string) {
  const supabase = useSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    throw new Error(error.message || "Ошибка входа");
  }
}
export async function signInOtp(provider: "google" | "apple") {
  const supabase = useSupabaseClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/`,
      scopes: "profile email",
    },
  });
  if (error) {
    throw error;
  }
}
export async function signUp(params: ParamsSignUp) {
  const supabase = useSupabaseClient();
  validatorSingUp(params);
  const { email, password } = params;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + "/confirm",
    },
  });
  if (error) {
    throw new Error(error.message || "Ошибка регистрации");
  }
}

export async function signOut() {
  const supabase = useSupabaseClient();
  await supabase.auth.signOut();
}

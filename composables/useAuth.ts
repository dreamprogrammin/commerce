import type { User } from "@supabase/supabase-js";
import type { ParamsSignUp } from "~/type";
import { validatorSingUp } from "~/validator/signUp.valitator";

export async function signIn(email: string, password: string) {
  const supabase = useSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.error(error.message);
  }
  return data.user as User;
}
export async function signUp(params: ParamsSignUp) {
  const supabase = useSupabaseClient();
  validatorSingUp(params);
  const { email, password, firstName, lastName } = params;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin + "/confirm",
      data: {
        first_name: firstName,
        last_name: lastName,
      },
    },
  });
  if (error) {
    console.error(error.message);
  }
  return data.user as User;
}

export async function signOut() {
  const supabase = useSupabaseClient();
  await supabase.auth.signOut();
}

import { validatorForgotPassword } from "~/validator/forgotPassword.validator";
import type { IParamsForgotPassword } from "~/types/type";
import type { AuthApiError } from "@supabase/supabase-js";

export async function forgotPassword(params: IParamsForgotPassword) {
  const supabase = useSupabaseClient();
  const { email, option } = params;

  try {
    validatorForgotPassword(params);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: option.redirectTo,
    });
    if (error) {
      throw new Error("Не удалось отправить письмо для восстановления пароля");
    }

    return true;
  } catch (error) {
    console.error("Ошибка в forgotPassword:", error);
    throw error;
  }
}

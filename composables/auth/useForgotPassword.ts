import { validatorForgotPassword } from '~/validator/forgotPassword.validator';
import type { IParamsForgotPassword } from '~/type';
import type { AuthApiError } from '@supabase/supabase-js';

export async function forgotPassword(params: IParamsForgotPassword) {
  const supabase = useSupabaseClient();
  const { email, option } = params;
  validatorForgotPassword(params);
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: option.redirectTo
    });
    if (error) {
      throw new Error(error.message);
    }
    console.log('Ссылка на восстановление пароля была отправлена на вашу почту  ');
  } catch (err: unknown) {
    const authError = err as AuthApiError;

    if (authError.message.includes('User not found')) {
      console.error('Пользователь не найден');
    } else {
      console.error('Произошла ошибка', authError.message);
    }
  }
}

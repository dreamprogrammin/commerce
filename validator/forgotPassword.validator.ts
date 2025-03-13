import type { IParamsForgotPassword } from '~/type';

export function validatorForgotPassword(params: IParamsForgotPassword) {
  const { email } = params;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Неверный формат электронной почты!');
  }
}

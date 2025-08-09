import type { ParamsSignUp } from '~/types/type'

export function validatorSingUp(params: ParamsSignUp) {
  const { email, password, confirmPassword, firstName, lastName } = params

  if (!email && !password && !confirmPassword && !firstName) {
    throw new Error('Заполните все поля!')
  }

  if (password.length < 6) {
    throw new Error('Пароль должен быть не менее 6 символов!')
  }

  if (password !== confirmPassword) {
    throw new Error('Пароли не совпадают!')
  }

  if (!/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
    throw new Error('Неверный формат электронной почты!')
  }
}

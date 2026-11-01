/**
 * Сохранить логин и пароль API DataForSEO. Сначала проверка у самого
 * DataForSEO (бесплатный `/appendix/user_data`), и только принятый ключ уходит
 * в Vault: опечатка всплыла бы иначе только при обновлении спроса.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ login?: unknown, password?: unknown }>(event)
  const login = typeof body?.login === 'string' ? body.login.trim() : ''
  const password = typeof body?.password === 'string' ? body.password.trim() : ''
  if (!login || login.length > 200 || /[\s:]/.test(login))
    throw createError({ statusCode: 400, message: 'Логин API — строка без пробелов и двоеточий' })
  if (password.length < 8 || password.length > 200 || /\s/.test(password))
    throw createError({ statusCode: 400, message: 'Это не похоже на пароль API' })

  const account = await dataforseoAccount(login, password)

  const { error } = await db.rpc('market_demand_credentials_set', { p_login: login, p_password: password, p_admin: event.context.adminId })
  if (error)
    throw createError({ statusCode: 400, message: error.message })
  return { login, last4: password.slice(-4), balance: account.balance }
})

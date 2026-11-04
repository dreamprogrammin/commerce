/** Вход, шаг 3: пароль двухэтапной проверки. Пароль нигде не хранится. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ password?: unknown }>(event)
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!password || password.length > 256)
    throw createError({ statusCode: 400, message: 'Введите пароль двухэтапной проверки' })
  return submitTelegramPassword(db, event.context.adminId, password)
})

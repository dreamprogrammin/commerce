import { normalizeCode } from '~/utils/telegramLogin'

/** Вход, шаг 2: код из Telegram. Ответ — вошли или нужен пароль. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ code?: unknown }>(event)
  const code = typeof body?.code === 'string' ? normalizeCode(body.code) : null
  if (!code)
    throw createError({ statusCode: 400, message: 'Код — 5 цифр из Telegram' })
  return submitTelegramCode(db, event.context.adminId, code)
})

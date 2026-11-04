import { normalizePhone } from '~/utils/telegramLogin'

/** Вход, шаг 1: телефон → Telegram присылает код. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ phone?: unknown }>(event)
  const phone = typeof body?.phone === 'string' ? normalizePhone(body.phone) : null
  if (!phone)
    throw createError({ statusCode: 400, message: 'Номер — в международном формате: +7 и 10 цифр' })
  return startTelegramLogin(db, event.context.adminId, phone)
})

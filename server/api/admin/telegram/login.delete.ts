/** Отменить начатый вход: временная сессия и phone_code_hash стираются. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  await cancelTelegramLogin(db)
  return { ok: true }
})

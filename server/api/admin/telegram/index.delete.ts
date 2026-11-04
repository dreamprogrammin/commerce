/**
 * Выйти из аккаунта: сессия закрывается у Telegram (пропадает из «Устройств»
 * в его настройках) и стирается из Vault. api_id и api_hash остаются.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  await logoutTelegram(db)
  return { ok: true }
})

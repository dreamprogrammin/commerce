/**
 * Закрытые каналы поставщиков глазами аккаунта: вступил ли он, когда в канале
 * последний пост. Ходит в Telegram — поэтому по кнопке, а не при открытии
 * страницы.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return checkTelegramChannels(db)
})

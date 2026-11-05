/**
 * Проверить ссылку на канал у Telegram, ничего не записывая: окно поставщика
 * показывает название, подписчиков и последний пост до сохранения, а если
 * канал уже записан за кем-то — за кем.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const check = await checkTelegramChannel(readChannelLink(await readBody(event)))
  return { ...check, existing: await channelOwner(db, check) }
})

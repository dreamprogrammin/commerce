/**
 * Приложение с my.telegram.org — api_id и api_hash. Без него Telegram не
 * пускает сторонние программы. Проверит их сам Telegram при запросе кода:
 * отдельной бесплатной проверки у него нет.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ apiId?: unknown, apiHash?: unknown }>(event)
  const apiId = typeof body?.apiId === 'string' || typeof body?.apiId === 'number' ? String(body.apiId).trim() : ''
  const apiHash = typeof body?.apiHash === 'string' ? body.apiHash.trim().toLowerCase() : ''
  if (!/^[1-9]\d{0,11}$/.test(apiId))
    throw createError({ statusCode: 400, message: 'api_id — число со страницы my.telegram.org' })
  if (!/^[0-9a-f]{32}$/.test(apiHash))
    throw createError({ statusCode: 400, message: 'api_hash — 32 знака из цифр и букв a–f со страницы my.telegram.org' })
  await saveTelegramApp(db, event.context.adminId, apiId, apiHash)
  return { configured: true }
})

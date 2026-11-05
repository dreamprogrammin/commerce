/**
 * Каналы поставщиков в Telegram (3 ноября 2026) — для страницы «Поставщики».
 * Без миграции 20261103120000 — `installed: false`, и страница работает как
 * раньше: превью с `dev` смотрит в боевую базу ещё до того, как миграцию
 * применят.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { data, error } = await db.from('supplier_channels')
    .select(SUPPLIER_CHANNEL_COLUMNS)
    .order('created_at')
  if (channelsNotInstalled(error))
    return { installed: false as const, channels: [] }
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { installed: true as const, channels: data }
})

/** Убрать канал у поставщика. Сам канал в Telegram, понятно, остаётся. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!isUuid(id))
    throw createError({ statusCode: 400, message: 'Неверный номер канала' })
  const { data, error } = await db.from('supplier_channels').delete().eq('id', id).select('id')
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!data?.length)
    throw createError({ statusCode: 404, message: 'Канал не найден' })
  return { ok: true }
})

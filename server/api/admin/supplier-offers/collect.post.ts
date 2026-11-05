/**
 * Собрать новые товары канала поставщика. За раз — один канал и до 30
 * товаров; `more: true` — есть ещё, страница зовёт снова. Telegram попросил
 * подождать — время записывается для «батарейки» сбора на дашборде.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ channelId?: unknown }>(event)
  if (!isUuid(body?.channelId))
    throw createError({ statusCode: 400, message: 'Не указан канал' })
  try {
    return await collectSupplierOffers(db, body.channelId)
  }
  catch (e) {
    const data = (e as { data?: { telegram?: unknown, seconds?: unknown } }).data
    if (typeof data?.telegram === 'string' && /FLOOD/.test(data.telegram) && typeof data.seconds === 'number') {
      const { data: channel } = await db.from('supplier_channels').select('title').eq('id', body.channelId).maybeSingle()
      await recordTelegramFlood(db, data.seconds, channel?.title ?? null)
    }
    throw e
  }
})

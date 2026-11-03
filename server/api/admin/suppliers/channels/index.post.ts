/**
 * Записать канал за поставщиком. Канал проверяется у Telegram заново: в базу
 * попадает то, что Telegram показал сейчас, а не то, что прислал браузер.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ supplierId?: unknown, link?: unknown }>(event)
  const supplierId = body?.supplierId
  if (!isUuid(supplierId))
    throw createError({ statusCode: 400, message: 'Не указан поставщик' })
  const check = await checkTelegramChannel(readChannelLink(body))

  const owner = await channelOwner(db, check)
  if (owner) {
    throw createError({
      statusCode: 409,
      message: owner.supplierId === supplierId
        ? 'Этот канал у поставщика уже есть'
        : `Этот канал уже у поставщика «${owner.supplierName}»`,
    })
  }
  const { data, error } = await db.from('supplier_channels')
    .insert({
      supplier_id: supplierId,
      username: check.username,
      invite_hash: check.inviteHash,
      title: check.title,
      chat_type: check.type,
      web_preview: check.webPreview,
      created_by: event.context.adminId,
    })
    .select(SUPPLIER_CHANNEL_COLUMNS)
    .single()
  if (channelsNotInstalled(error))
    throw createError({ statusCode: 409, message: 'Каналов ещё нет в базе: нужна миграция 20261103120000_supplier_channels' })
  // Тот же канал записали в эту же секунду из другой вкладки
  if (error?.code === '23505')
    throw createError({ statusCode: 409, message: 'Этот канал уже записан за поставщиком' })
  if (error?.code === '23503')
    throw createError({ statusCode: 400, message: 'Поставщика нет — его удалили?' })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return data
})

/**
 * Сохранить ключ Вордстата: API-ключ сервисного аккаунта Yandex Cloud и ID
 * каталога. Сначала проверка у самого Вордстата (бесплатный GetRegionsTree,
 * там же номер региона «Казахстан»), и только принятый ключ уходит в Vault:
 * опечатка всплыла бы иначе только при обновлении.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ apiKey?: unknown, folderId?: unknown }>(event)
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  const folderId = typeof body?.folderId === 'string' ? body.folderId.trim() : ''
  if (apiKey.length < 20 || apiKey.length > 300 || /\s/.test(apiKey))
    throw createError({ statusCode: 400, message: 'Это не похоже на API-ключ Yandex Cloud' })
  if (!/^[a-z0-9]{8,50}$/.test(folderId))
    throw createError({ statusCode: 400, message: 'ID каталога — строчные латинские буквы и цифры, как b1g…' })

  const region = await wordstatKazakhstan(apiKey, folderId)

  const { error } = await db.rpc('market_demand_yandex_key_set', {
    p_api_key: apiKey,
    p_folder_id: folderId,
    p_region_id: region.id,
    p_region_name: region.name,
    p_admin: event.context.adminId,
  })
  if (error)
    throw createError({ statusCode: error.code === 'P0001' ? 400 : 500, message: error.message })
  return { folderId, last4: apiKey.slice(-4), region: region.name }
})

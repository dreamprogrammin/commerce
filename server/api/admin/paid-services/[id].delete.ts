/** Убрать платный сервис из списка */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 400, message: 'Неверный сервис' })
  const { data, error } = await db.from('paid_services').delete().eq('id', id).select('id')
  if (error)
    throw createError({ statusCode: siteHealthNotInstalled(error) ? 409 : 500, message: error.message })
  if (!data?.length)
    throw createError({ statusCode: 404, message: 'Сервис не найден' })
  return { ok: true }
})

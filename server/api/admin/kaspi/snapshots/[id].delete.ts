/** Удалить ошибочный замер Kaspi */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(id) || id <= 0)
    throw createError({ statusCode: 400, message: 'Неверный замер' })
  await deleteKaspiSnapshot(db, id)
  return { ok: true }
})

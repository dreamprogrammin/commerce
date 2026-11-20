import { parseKaspiInput } from '~/utils/kaspiSnapshot'

/** Сохранить замер Kaspi у темы или товара поставщика */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const input = parseKaspiInput(await readBody(event))
  if (typeof input === 'string')
    throw createError({ statusCode: 400, message: input })
  return saveKaspiSnapshot(db, event.context.adminId, input)
})

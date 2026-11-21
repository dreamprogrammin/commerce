import { parsePaidService } from '~/utils/siteHealth'

/** Добавить платный сервис или поправить (id в теле) */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody(event)
  const input = parsePaidService(body)
  if (typeof input === 'string')
    throw createError({ statusCode: 400, message: input })
  const row = { name: input.name, plan: input.plan, cost: input.cost, currency: input.currency, period: input.period, renews_on: input.renewsOn, url: input.url, note: input.note, updated_at: new Date().toISOString() }
  const id = typeof body?.id === 'string' ? body.id : null
  if (id && !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 400, message: 'Неверный сервис' })
  const q = id
    ? db.from('paid_services').update(row).eq('id', id).select('*').maybeSingle()
    : db.from('paid_services').insert({ ...row, sort: 100 }).select('*').single()
  const { data, error } = await q
  if (siteHealthNotInstalled(error))
    throw createError({ statusCode: 409, message: 'Сначала миграция 20261121120000 (CI, APPLY)' })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!data)
    throw createError({ statusCode: 404, message: 'Сервис не найден' })
  return toPaidService(data)
})

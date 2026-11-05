/**
 * Бюджет ИИ для «батарейки» дашборда (6 ноября 2026): сколько на счёте
 * провайдера и день сброса. Расход считается со дня, когда бюджет задан.
 * `usd: 0` — убрать бюджет.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ usd?: unknown, resetDay?: unknown }>(event)
  const usd = Number(body?.usd)
  if (!Number.isFinite(usd) || usd < 0 || usd > 10_000)
    throw createError({ statusCode: 400, message: 'Сумма — от 0 до 10 000 $' })
  if (usd === 0) {
    const { error } = await db.from('ai_settings').delete().eq('key', 'ai_budget')
    if (error)
      throw createError({ statusCode: 500, message: error.message })
    return { budget: null }
  }
  const resetDay = body?.resetDay == null || body.resetDay === '' ? null : Number(body.resetDay)
  if (resetDay !== null && !(Number.isInteger(resetDay) && resetDay >= 1 && resetDay <= 28))
    throw createError({ statusCode: 400, message: 'День сброса — от 1 до 28, или без сброса' })
  const budget = {
    usd: Math.round(usd * 100) / 100,
    since: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date()),
    resetDay,
  }
  const { error } = await db.from('ai_settings').upsert({ key: 'ai_budget', value: budget, updated_at: new Date().toISOString(), updated_by: event.context.adminId })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { budget }
})

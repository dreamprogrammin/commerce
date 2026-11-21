/**
 * Ключ Vercel для расхода в админке. Сначала проверка у Vercel — видит ли
 * ключ команду с проектом commerce, — и только принятый ключ уходит в Vault.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ token?: unknown }>(event)
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (token.length < 20 || token.length > 200 || /\s/.test(token))
    throw createError({ statusCode: 400, message: 'Это не похоже на ключ Vercel' })
  let team: { teamId: string, teamName: string }
  try {
    team = await vercelCheckKey(token)
  }
  catch (e: any) {
    throw createError({ statusCode: 400, message: e?.message ?? 'Vercel не принял ключ' })
  }
  const { error } = await db.rpc('vercel_key_set', { p_token: token, p_team_id: team.teamId, p_team_name: team.teamName, p_admin: event.context.adminId })
  if (vercelNotInstalled(error))
    throw createError({ statusCode: 409, message: 'Сначала миграция 20261121140000 (CI, APPLY)' })
  if (error)
    throw createError({ statusCode: 400, message: error.message })
  forgetVercelUsage()
  return { last4: token.slice(-4), teamName: team.teamName }
})

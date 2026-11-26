/** Убрать ключ Vercel */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { error } = await db.rpc('vercel_key_delete')
  if (error)
    throw createError({ statusCode: vercelNotInstalled(error) ? 409 : 500, message: error.message })
  forgetVercelUsage()
  return { ok: true }
})

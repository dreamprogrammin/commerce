/** Удалить ключ провайдера ИИ из Vault. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const provider = getQuery(event).provider
  if (!isAiProvider(provider))
    throw createError({ statusCode: 400, message: 'Провайдер — только anthropic, openai или gemini' })
  const { error } = await db.rpc('ai_key_delete', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { provider }
})

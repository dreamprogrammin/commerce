/**
 * Сохранить ключ провайдера ИИ. Сначала проверка у самого провайдера
 * (список моделей — бесплатно), и только принятый ключ уходит в Vault:
 * опечатка в ключе всплыла бы иначе только при первом разборе поста.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ provider?: unknown, key?: unknown }>(event)
  const provider = body?.provider
  const key = typeof body?.key === 'string' ? body.key.trim() : ''
  if (!isAiProvider(provider))
    throw createError({ statusCode: 400, message: 'Провайдер — только anthropic, openai или gemini' })
  if (key.length < 20 || key.length > 500 || /\s/.test(key))
    throw createError({ statusCode: 400, message: 'Это не похоже на ключ API' })

  const models = await listModels(provider, key)

  const { error } = await db.rpc('ai_key_set', { p_provider: provider, p_key: key, p_admin: event.context.adminId })
  if (error)
    throw createError({ statusCode: 400, message: error.message })
  return { provider, last4: key.slice(-4), models }
})

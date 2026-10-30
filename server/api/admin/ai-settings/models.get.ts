/**
 * Модели провайдера по сохранённому ключу — для выбора модели на странице.
 * Список живой, от самого провайдера: новые модели появляются без правок кода.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const provider = getQuery(event).provider
  if (!isAiProvider(provider))
    throw createError({ statusCode: 400, message: 'Провайдер — только anthropic, openai или gemini' })
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!key)
    throw createError({ statusCode: 404, message: 'Ключ этого провайдера не задан' })
  return listModels(provider, key as string)
})

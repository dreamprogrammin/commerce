/**
 * Выбрать модель под задачу: строка «провайдер/модель», как её понимает
 * supabase/functions/_shared/supplierVision.ts. Провайдер должен быть с
 * заданным ключом, а модель — из его живого списка: так опечатка в названии
 * не доживёт до первого разбора поста.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ task?: unknown, model?: unknown }>(event)
  const task = body?.task
  const spec = typeof body?.model === 'string' ? body.model.trim() : ''
  if (typeof task !== 'string' || !Object.hasOwn(AI_TASKS, task))
    throw createError({ statusCode: 400, message: 'Неизвестная задача' })
  const slash = spec.indexOf('/')
  const provider = spec.slice(0, slash)
  const model = spec.slice(slash + 1)
  if (slash < 1 || !model || !isAiProvider(provider))
    throw createError({ statusCode: 400, message: 'Модель — в виде «провайдер/модель», провайдер anthropic, openai или gemini' })

  const { data: key } = await db.rpc('ai_key_get', { p_provider: provider })
  if (!key)
    throw createError({ statusCode: 400, message: `Сначала задайте ключ ${AI_PROVIDERS[provider].label}` })
  const models = await listModels(provider, key as string)
  const found = models.find(m => m.id === model)
  if (!found)
    throw createError({ statusCode: 400, message: `У ${AI_PROVIDERS[provider].label} нет модели ${model}` })
  if (found.vision === false)
    throw createError({ statusCode: 400, message: `${found.label} не понимает картинки` })

  const { error } = await db.from('ai_settings').upsert({
    key: task,
    value: spec,
    updated_at: new Date().toISOString(),
    updated_by: event.context.adminId,
  })
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  return { task, model: spec }
})

/**
 * Страница «Модели ИИ»: какие ключи заданы и какая модель стоит на задаче.
 *
 * Сам ключ отсюда не уходит никогда — только последние 4 символа, чтобы
 * узнать, какой задан (владелец 31.10.2026: ключи вводятся в админке, а не в
 * коде). Ключи лежат в Supabase Vault, см. миграцию 20261031120000.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const [{ data: keys, error }, { data: settings }] = await Promise.all([
    db.rpc('ai_keys_status'),
    db.from('ai_settings').select('key, value, updated_at'),
  ])
  if (error)
    throw createError({ statusCode: 500, message: error.message })

  const keyRows = (keys ?? []) as { provider: string, last4: string, updated_at: string }[]
  const settingRows = (settings ?? []) as { key: string, value: unknown, updated_at: string }[]

  return {
    providers: (Object.keys(AI_PROVIDERS) as AiProvider[]).map((id) => {
      const key = keyRows.find(k => k.provider === id)
      return {
        id,
        label: AI_PROVIDERS[id].label,
        keyUrl: AI_PROVIDERS[id].keyUrl,
        configured: Boolean(key),
        last4: key?.last4 ?? null,
        updatedAt: key?.updated_at ?? null,
      }
    }),
    tasks: (Object.keys(AI_TASKS) as (keyof typeof AI_TASKS)[]).map((task) => {
      const row = settingRows.find(s => s.key === task)
      return {
        task,
        label: AI_TASKS[task].label,
        hint: AI_TASKS[task].hint,
        model: typeof row?.value === 'string' ? row.value : null,
        default: AI_TASKS[task].default,
        updatedAt: row?.updated_at ?? null,
      }
    }),
  }
})

/**
 * Ключи и выбор модели — из страницы «Модели ИИ» в админке (31.10.2026),
 * а не из секретов функций: владелец меняет их сам, без кода и выкатки.
 *
 * Ключ лежит в Supabase Vault, читается `ai_key_get` (только service_role),
 * модель — строка в `ai_settings`. Переменная окружения (ANTHROPIC_API_KEY и
 * т. п.) — запасной путь, если ключ в админке не задан.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { DEFAULT_MODEL, parseModelSpec } from './supplierVision.ts'

export async function loadVisionConfig(db: SupabaseClient, task = 'supplier_vision_model') {
  const { data: setting } = await db.from('ai_settings').select('value').eq('key', task).maybeSingle()
  const model = typeof setting?.value === 'string' ? setting.value : DEFAULT_MODEL
  const { provider, config } = parseModelSpec(model)
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw new Error(`Не прочитать ключ ${provider}: ${error.message}`)
  const env = (name: string) => (name === config.keyEnv && typeof key === 'string' && key) ? key : Deno.env.get(name)
  return { model, env }
}

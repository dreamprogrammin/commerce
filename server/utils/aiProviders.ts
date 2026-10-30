import process from 'node:process'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Провайдеры моделей ИИ для страницы «Модели ИИ» в админке.
 *
 * Только официальные API разработчиков (решение владельца 31.10.2026: данные
 * поставщиков не должны уходить посредникам вроде OpenRouter). Список — тот
 * же, что в supabase/functions/_shared/supplierVision.ts и в проверке
 * `ai_key_set` в базе; меняется во всех трёх местах сразу.
 */
export const AI_PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', keyUrl: 'https://console.anthropic.com/settings/keys' },
  openai: { label: 'OpenAI (GPT)', keyUrl: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google (Gemini)', keyUrl: 'https://aistudio.google.com/apikey' },
} as const

export type AiProvider = keyof typeof AI_PROVIDERS

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && Object.hasOwn(AI_PROVIDERS, value)
}

/** Задачи, под которые выбирается модель; ключ — строка в `ai_settings` */
export const AI_TASKS = {
  supplier_vision_model: {
    label: 'Чтение постов поставщиков',
    hint: 'Читает артикул и цену с фото товара. Нужна модель, которая понимает картинки.',
    default: 'anthropic/claude-haiku-5-5',
  },
} as const

export interface AiModel {
  id: string
  label: string
  /** Понимает ли картинки; null — провайдер об этом не сообщает */
  vision: boolean | null
}

/*
 * Заглушка для проверки страницы без настоящих ключей: все три провайдера
 * идут на один локальный адрес. Только localhost — иначе переменная
 * окружения увела бы ключи на чужой сервер.
 */
function stubBase(): string | null {
  const url = process.env.AI_STUB_URL
  if (!url)
    return null
  if (!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(url))
    throw createError({ statusCode: 500, message: 'AI_STUB_URL — только локальная заглушка' })
  return url
}

function rejected(status: number) {
  return status === 401 || status === 403
    ? 'Ключ не подошёл: провайдер его отклонил'
    : `Провайдер ответил ошибкой ${status}`
}

/**
 * Список моделей по ключу — он же проверка ключа: запрос бесплатный, токены
 * не тратит. Текст ошибки провайдера наружу не отдаём: в нём бывает кусок
 * ключа.
 */
export async function listModels(provider: AiProvider, key: string): Promise<AiModel[]> {
  const stub = stubBase()

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey: key, baseURL: stub ?? undefined, maxRetries: 0 })
    const models: AiModel[] = []
    try {
      for await (const m of client.models.list())
        models.push({ id: m.id, label: m.display_name, vision: m.capabilities?.image_input?.supported ?? null })
    }
    catch (error) {
      if (error instanceof Anthropic.APIError)
        throw createError({ statusCode: 400, message: rejected(error.status ?? 0) })
      throw createError({ statusCode: 502, message: 'Не удалось связаться с Anthropic' })
    }
    return models
  }

  const url = provider === 'openai'
    ? `${stub ? `${stub}/openai` : 'https://api.openai.com'}/v1/models`
    : `${stub ? `${stub}/gemini` : 'https://generativelanguage.googleapis.com'}/v1beta/models?pageSize=1000`
  const headers: Record<string, string> = provider === 'openai'
    ? { Authorization: `Bearer ${key}` }
    : { 'x-goog-api-key': key }
  const res = await fetch(url, { headers }).catch(() => null)
  if (!res)
    throw createError({ statusCode: 502, message: `Не удалось связаться с ${AI_PROVIDERS[provider].label}` })
  if (!res.ok)
    throw createError({ statusCode: 400, message: rejected(res.status) })
  const body = await res.json()

  if (provider === 'openai') {
    // Только модели для диалога: без звука, картинок-генераторов, эмбеддингов
    return ((body.data ?? []) as { id: string }[])
      .map(m => m.id)
      .filter(id => /^(?:gpt-|o\d|chatgpt-)/.test(id) && !/audio|realtime|tts|transcribe|image|embedding|search|instruct/.test(id))
      .sort()
      .map(id => ({ id, label: id, vision: null }))
  }
  return ((body.models ?? []) as { name: string, displayName?: string, supportedGenerationMethods?: string[] }[])
    .filter(m => m.name.startsWith('models/gemini') && m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({ id: m.name.slice('models/'.length), label: m.displayName ?? m.name, vision: null }))
}

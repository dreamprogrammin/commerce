import type { SupabaseClient } from '@supabase/supabase-js'
import type { RateLimits, ReadItem, ReadResult, SupplierPost } from '../../supabase/functions/_shared/supplierVisionCore'
import type { OfferItem } from '~/utils/supplierOfferList'

/**
 * Чтение постов поставщиков на сервере сайта (5 ноября 2026): название,
 * артикул и цена с фото товара — моделью со страницы «Модели ИИ». Модель
 * выбрана стендом 5.11 — Claude Haiku 5.5 (docs/HANDOFF.md). Модуль чтения —
 * supabase/functions/_shared/supplierVisionCore.ts, тот же, что у стенда;
 * здесь к нему подставлен SDK Anthropic из npm.
 *
 * Модуль и SDK — по требованию: файлы server/utils Nitro кладёт в главный
 * чанк, а нужны они только «Товарам поставщиков» (см. aiProviders.ts).
 */
const loadCore = () => import('../../supabase/functions/_shared/supplierVisionCore')
const loadAnthropic = () => import('@anthropic-ai/sdk').then(m => m.default)

/** Ответа модели ждём не дольше: дальше товар остаётся непрочитанным, его прочтёт «Прочитать» */
const READ_TIMEOUT_MS = 45_000

export interface VisionReader {
  model: string
  read: (post: SupplierPost) => Promise<ReadResult>
  /** Лимиты из отказа провайдера: SDK Anthropic кладёт заголовки в ошибку, модуль — в `limits` */
  limitsOf: (error: unknown) => RateLimits | null
}

/** Модель задачи со страницы «Модели ИИ»; не выбрана — по умолчанию */
export async function visionModel(db: SupabaseClient): Promise<string> {
  const { data } = await db.from('ai_settings').select('value').eq('key', 'supplier_vision_model').maybeSingle()
  return typeof data?.value === 'string' ? data.value : AI_TASKS.supplier_vision_model.default
}

/**
 * Чем читать посты: модель и ключ её провайдера. Ключа нет — null: товары
 * собираются без чтения.
 */
export async function loadVisionReader(db: SupabaseClient): Promise<VisionReader | null> {
  const [model, core, Anthropic] = await Promise.all([visionModel(db), loadCore(), loadAnthropic()])
  const { provider, config } = core.parseModelSpec(model)
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: `Не прочитать ключ ${provider}: ${error.message}` })
  if (typeof key !== 'string' || !key)
    return null
  // Заглушка стража — та же, что у «Моделей ИИ»: адреса провайдеров под одним localhost
  const stub = aiStubBase()
  const base = stub ? { anthropic: stub, openai: `${stub}/openai/v1`, gemini: `${stub}/gemini/v1beta/openai` }[provider] : undefined
  const env = (name: string) => name === config.keyEnv ? key : name === `${provider.toUpperCase()}_BASE_URL` ? base : undefined
  return {
    model,
    limitsOf: (error) => {
      const e = error as { limits?: RateLimits | null, headers?: { get?: unknown } } | null
      if (e?.limits)
        return e.limits
      return typeof e?.headers?.get === 'function' ? core.rateLimits(e.headers as Headers) : null
    },
    // Один повтор: SDK сам ждёт, сколько скажет провайдер; дольше сбор не тянем
    read: post => core.readSupplierPost(post, model, env, options => new Anthropic({ ...options, timeout: READ_TIMEOUT_MS, maxRetries: 1 })),
  }
}

/** Код ответа провайдера — фразой; сам его текст не берём: в нём бывает кусок ключа */
function statusText(status: number): string {
  if (status === 401 || status === 403)
    return 'Ключ не подошёл: провайдер его отклонил'
  if (status === 404)
    return 'Модели нет у провайдера — выберите другую на странице «Модели ИИ»'
  if (status === 413)
    return 'Фото слишком большое для модели'
  if (status === 429)
    return 'Лимит запросов провайдера — прочитайте позже'
  if (status >= 500)
    return 'Провайдер перегружен — прочитайте позже'
  return `Провайдер ответил ошибкой ${status}`
}

/**
 * Код, на котором дальше не читаем: ключ, модель, лимит, перегрузка — то же
 * ждёт и следующие товары. Прочие 4xx — про сам пост (фото не разобралось,
 * велико): остановись чтение на нём, он вставал бы первым в каждом проходе.
 */
const stopsReading = (status: number) => [401, 403, 404, 429].includes(status) || status >= 500

/**
 * Почему товар не прочёлся — для карточки. `stop` — отказал сам провайдер
 * (ключ, лимит, связь): следующие товары ждёт то же, дальше не читаем. Ответ
 * модели не разобрался, она отказалась или не приняла фото — дело в посте,
 * читаем следующий.
 */
export async function readFailure(error: unknown): Promise<{ text: string, stop: boolean }> {
  const Anthropic = await loadAnthropic()
  // Тайм-аут — частный случай сбоя связи, тот — ответа с ошибкой
  if (error instanceof Anthropic.APIConnectionTimeoutError)
    return { text: 'Модель не ответила вовремя — прочитайте позже', stop: true }
  // OpenAI и Google — срок модуля чтения (RESPONSE_TIMEOUT_MS)
  if (error instanceof Error && error.name === 'TimeoutError')
    return { text: 'Модель не ответила вовремя — прочитайте позже', stop: true }
  if (error instanceof Anthropic.APIConnectionError)
    return { text: 'Не удалось связаться с провайдером — прочитайте позже', stop: true }
  if (error instanceof Anthropic.APIError)
    return { text: statusText(error.status ?? 0), stop: stopsReading(error.status ?? 500) }
  const message = error instanceof Error ? error.message : String(error)
  // OpenAI и Google: «<модель>: HTTP 401 <ответ провайдера>»
  const http = /: HTTP (\d{3})\b/.exec(message)
  if (http)
    return { text: statusText(Number(http[1])), stop: stopsReading(Number(http[1])) }
  if (error instanceof TypeError && /fetch failed/i.test(message))
    return { text: 'Не удалось связаться с провайдером — прочитайте позже', stop: true }
  return { text: message.slice(0, 300), stop: false }
}

/**
 * Прочитанное — для карточки (`read_items` хранит ответ модели как есть):
 * цена по правилу владельца, подпись главнее фото.
 */
export async function offerItemsReader(): Promise<(raw: unknown) => OfferItem[] | null> {
  const { pickPrice } = await loadCore()
  return (raw) => {
    if (!Array.isArray(raw))
      return null
    return (raw as ReadItem[]).map((it) => {
      const { price, source, conflict } = pickPrice(it)
      return {
        name: it.name,
        article: it.article,
        brand: it.brand,
        price,
        priceFrom: source,
        imagePrice: conflict ? it.price_image : null,
        priceNote: it.price_note,
        age: it.age,
        confidence: it.confidence,
        doubt: it.doubt,
      }
    })
  }
}

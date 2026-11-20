import type { SupabaseClient } from '@supabase/supabase-js'
import type { KaspiFields, KaspiSnapshot, KaspiSnapshotInput, KaspiSource, KaspiSummary } from '~/utils/kaspiSnapshot'
import { kaspiSummaries, offerKaspiKey, parseKaspiReadReply } from '~/utils/kaspiSnapshot'
import { aiStubBase } from './aiProviders'
import { readFailure, visionModel } from './supplierVision'

/**
 * Цифры Kaspi (20 ноября 2026, миграция 20261120120000): замеры у тем спроса
 * и товаров поставщиков. Сервер на kaspi.kz не ходит — замер приносит
 * владелец: кнопкой со страницы Kaspi в своём браузере или скриншотом,
 * который здесь читает модель со страницы «Модели ИИ».
 */

const loadCore = () => import('../../supabase/functions/_shared/supplierVisionCore')
const loadAnthropic = () => import('@anthropic-ai/sdk').then(m => m.default)

const COLUMNS = 'id, topic_id, offer_id, offer_item, kaspi_url, title, price, reviews, rating, sellers, source, taken_at'
const READ_TIMEOUT_MS = 45_000
/** Скриншот после сжатия на странице — с запасом под предел тела запроса Vercel (4,5 МБ) */
export const KASPI_IMAGE_MAX = 3_000_000

interface Row {
  id: number
  topic_id: string | null
  offer_id: string | null
  offer_item: number | null
  kaspi_url: string | null
  title: string
  price: number | null
  reviews: number | null
  rating: number | string | null
  sellers: number | null
  source: KaspiSource
  taken_at: string
}

function toSnapshot(r: Row): KaspiSnapshot {
  return {
    id: r.id,
    topicId: r.topic_id,
    offerId: r.offer_id,
    offerItem: r.offer_item,
    url: r.kaspi_url,
    title: r.title,
    price: r.price,
    reviews: r.reviews,
    rating: r.rating == null ? null : Number(r.rating),
    sellers: r.sellers,
    source: r.source,
    takenAt: r.taken_at,
  }
}

/** Таблицы ещё нет — миграция не применена */
export const kaspiNotInstalled = (error: { code?: string } | null | undefined) => error?.code === '42P01' || error?.code === 'PGRST205'

function dbError(error: { message: string }) {
  return createError({ statusCode: 500, message: error.message })
}

/** Замеры цели, новые сверху; null — нет миграции */
export async function listKaspiSnapshots(db: SupabaseClient, target: { topicId?: string, offerId?: string }): Promise<KaspiSnapshot[] | null> {
  let q = db.from('kaspi_snapshots').select(COLUMNS).order('taken_at', { ascending: false }).limit(200)
  q = target.topicId ? q.eq('topic_id', target.topicId) : q.eq('offer_id', target.offerId!)
  const { data, error } = await q
  if (kaspiNotInstalled(error))
    return null
  if (error)
    throw dbError(error)
  return (data as Row[]).map(toSnapshot)
}

/**
 * Есть ли таблица замеров. GET, а не head: на HEAD к несуществующей таблице
 * PostgREST отвечает 204 без ошибки.
 */
export async function kaspiInstalled(db: SupabaseClient): Promise<boolean> {
  const { error } = await db.from('kaspi_snapshots').select('id').limit(1)
  if (kaspiNotInstalled(error))
    return false
  if (error)
    throw dbError(error)
  return true
}

/** Сводки для карточек: по темам или по товарам поставщиков; null — нет миграции */
export async function kaspiSummariesFor(db: SupabaseClient, by: 'topic' | 'offer', ids: string[]): Promise<Record<string, KaspiSummary> | null> {
  if (!ids.length)
    return {}
  const column = by === 'topic' ? 'topic_id' : 'offer_id'
  const rows: Row[] = []
  // Порциями: сотни id в одной строке адреса PostgREST не помещаются
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('kaspi_snapshots').select(COLUMNS).in(column, ids.slice(i, i + 100)).limit(5000)
    if (kaspiNotInstalled(error))
      return null
    if (error)
      throw dbError(error)
    rows.push(...(data as Row[]))
  }
  const map = kaspiSummaries(rows.map(toSnapshot), s => by === 'topic' ? s.topicId : s.offerId && offerKaspiKey(s.offerId, s.offerItem))
  return Object.fromEntries(map)
}

export async function saveKaspiSnapshot(db: SupabaseClient, adminId: string | undefined, input: KaspiSnapshotInput): Promise<KaspiSnapshot> {
  const { data, error } = await db.from('kaspi_snapshots').insert({
    topic_id: input.topicId,
    offer_id: input.offerId,
    offer_item: input.offerItem,
    kaspi_url: input.url,
    title: input.title,
    price: input.price,
    reviews: input.reviews,
    rating: input.rating,
    sellers: input.sellers,
    source: input.source,
    created_by: adminId ?? null,
  }).select(COLUMNS).single()
  if (kaspiNotInstalled(error))
    throw createError({ statusCode: 409, message: 'Нет миграции цифр Kaspi (20261120120000) — её применяют кнопкой в CI' })
  // Тема или товар поставщика удалены, пока открыта форма
  if (error?.code === '23503')
    throw createError({ statusCode: 404, message: 'Тема или товар поставщика уже удалены' })
  if (error)
    throw dbError(error)
  return toSnapshot(data as Row)
}

export async function deleteKaspiSnapshot(db: SupabaseClient, id: number) {
  const { error } = await db.from('kaspi_snapshots').delete().eq('id', id)
  if (kaspiNotInstalled(error))
    throw createError({ statusCode: 409, message: 'Нет миграции цифр Kaspi' })
  if (error)
    throw dbError(error)
}

const n = { anyOf: [{ type: 'number' }, { type: 'null' }] }

const KASPI_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, price: n, reviews: n, rating: n, sellers: n },
        required: ['title', 'price', 'reviews', 'rating', 'sellers'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

export const KASPI_PROMPT = `Ты читаешь скриншот Kaspi Магазина (kaspi.kz, Казахстан, цены в тенге): страницу товара или выдачу поиска.
Для каждого товара, который виден на скриншоте целиком, выпиши:
- title — название товара, как написано;
- price — цена товара в тенге целым числом. Не путай с платежом в рассрочку или кредит («1 083 ₸ × 12», «в месяц») — это не цена;
- reviews — число отзывов (обычно в скобках рядом со звёздами или словом «отзывов»);
- rating — рейтинг от 0 до 5 (звёзды), с одной цифрой после точки;
- sellers — сколько продавцов или предложений у товара, если это видно на скриншоте.
Чего на скриншоте не видно — null. Ничего не придумывай и не оценивай на глаз.
Если это страница одного товара — в ответе один товар. Если на скриншоте нет товаров Kaspi — пустой список.`

export interface KaspiReadOutcome {
  items: KaspiFields[]
  model: string
  /** Почему не прочлось — для владельца; off — нет ключа */
  error: string | null
  off: 'key' | null
}

/** Прочесть скриншот Kaspi; картинка — base64 без префикса */
export async function readKaspiScreenshot(db: SupabaseClient, image: { mediaType: string, data: string }): Promise<KaspiReadOutcome> {
  const [model, core, Anthropic] = await Promise.all([visionModel(db), loadCore(), loadAnthropic()])
  const { provider, config } = core.parseModelSpec(model)
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: `Не прочитать ключ ${provider}: ${error.message}` })
  if (typeof key !== 'string' || !key)
    return { items: [], model, error: null, off: 'key' }
  const stub = aiStubBase()
  const base = stub ? { anthropic: stub, openai: `${stub}/openai/v1`, gemini: `${stub}/gemini/v1beta/openai` }[provider] : undefined
  const env = (name: string) => name === config.keyEnv ? key : name === `${provider.toUpperCase()}_BASE_URL` ? base : undefined
  const task = { system: KASPI_PROMPT, schema: KASPI_SCHEMA, name: 'kaspi_screenshot', user: () => 'Скриншот Kaspi Магазина.', refusal: 'Модель отказалась читать скриншот' }
  try {
    const out = await core.askVision({ images: [image], caption: null }, model, env, options => new Anthropic({ ...options, timeout: READ_TIMEOUT_MS, maxRetries: 1 }), task)
    // Расход — в «Бюджет ИИ», как у чтения постов; постов не прибавляем
    if (out.inputTokens || out.outputTokens) {
      const { error: usageError } = await db.rpc('ai_usage_add', { p_model: model, p_input: out.inputTokens ?? 0, p_output: out.outputTokens ?? 0, p_posts: 0 })
      if (usageError && !['PGRST202', '42883'].includes(usageError.code ?? ''))
        console.error('[kaspi-read] расход не записался:', usageError.message)
    }
    const items = parseKaspiReadReply(out.raw)
    return { items, model, error: items.length ? null : 'На скриншоте не нашлось товаров Kaspi', off: null }
  }
  catch (e) {
    return { items: [], model, error: (await readFailure(e)).text, off: null }
  }
}

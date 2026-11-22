import type { SupabaseClient } from '@supabase/supabase-js'
import { parseQueriesReply } from '~/utils/offerQueries'
import { aiStubBase } from './aiProviders'
import { readFailure, visionModel } from './supplierVision'

/**
 * Запросы покупателя к товарам поставщиков (18 ноября 2026). Владелец 18.11:
 * поиск «работает слишком широко, типа по запросу «куклы»». По названию,
 * бренду и возрасту, которые ИИ уже прочёл с фото, модель со страницы «Модели
 * ИИ» подбирает каждому товару 2–3 запроса, какими его ищут в Google; сколько
 * их ищут — отвечает DataForSEO (миграция 20261118120000).
 *
 * Отдельный текстовый запрос, а не поле в чтении фото: чтение артикулов и
 * цен проверено стендом 5.11, его промпт не трогаем; заодно подбор работает
 * и для уже прочитанных товаров. Без фото — дёшево: на Claude Haiku 5.5
 * ≈ $0,002 за пачку из 40 товаров.
 */

const loadCore = () => import('../../supabase/functions/_shared/supplierVisionCore')
const loadAnthropic = () => import('@anthropic-ai/sdk').then(m => m.default)

/** Товаров в одном запросе к модели */
const ITEMS_PER_CALL = 40
/** Товаров (постов) за один запрос страницы */
const OFFERS_PER_PASS = 40
const TIMEOUT_MS = 45_000
const MAX_TOKENS = 8000
const OFFER_DAYS = 30

const QUERIES_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, queries: { type: 'array', items: { type: 'string' } } },
        required: ['id', 'queries'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

export const QUERIES_PROMPT = `Ты помогаешь закупщику магазина детских игрушек в Казахстане понять, ищут ли покупатели конкретный товар.
Для каждого товара из списка напиши 2–3 поисковых запроса в Google на русском, которыми покупатель ищет именно этот товар.

Правила:
- Запрос — 2–5 слов строчными: тип товара + то, что его выделяет: бренд, персонаж, серия, профессия куклы, размер, главная особенность («кукла барби ветеринар», «машинка на пульте перевертыш», «щенячий патруль набор машинок»).
- Не пиши общих запросов из одного-двух слов, которые подходят к любому товару своего типа: «кукла», «игрушка», «детская машинка».
- Известные бренды и персонажей пиши так, как их ищут по-русски: «барби», «хот вилс», «щенячий патруль», «лабубу», «человек паук».
- Малоизвестную марку поставщика («Q.joele», «Bilina», «Fashion Girl», «Amra Toys») в запрос не ставь — опиши суть товара: «кукла с гардеробом», «кукла доктор с набором».
- Без цен, артикулов, количества штук, кавычек и знаков препинания.
- id в ответе — ровно как в списке; ответ — по каждому товару.`

interface Job {
  offerId: string
  /** Товаров в посте; фразы ложатся в том же порядке */
  count: number
  items: { id: string, name: string, brand: string | null, age: string | null }[]
}

type Ask = (user: string) => Promise<{ raw: string, input: number, output: number }>

/** Текстовый запрос к модели: системный промпт, схема ответа и что делает — для текста ошибки */
export interface TextAskSpec {
  system: string
  schema: Record<string, unknown>
  /** Имя схемы для OpenAI-совместимых */
  name: string
  /** «подбирать запросы» — в «Модель отказалась …» */
  what: string
}

/**
 * Чем спрашивать: модель «Моделей ИИ» и ключ её провайдера; ключа нет — null.
 * Общий для подбора запросов и разбора товаров (server/utils/supplierGuess.ts).
 */
export async function loadTextAsk(db: SupabaseClient, spec: TextAskSpec): Promise<{ model: string, ask: Ask } | null> {
  const [model, core] = await Promise.all([visionModel(db), loadCore()])
  const { provider, model: id, config } = core.parseModelSpec(model)
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: `Не прочитать ключ ${provider}: ${error.message}` })
  if (typeof key !== 'string' || !key)
    return null
  const stub = aiStubBase()

  if (config.kind === 'anthropic') {
    const Anthropic = await loadAnthropic()
    const client = new Anthropic({ apiKey: key, baseURL: stub ?? undefined, timeout: TIMEOUT_MS, maxRetries: 1 })
    return {
      model,
      ask: async (user) => {
        const reply = await client.messages.create({
          model: id,
          max_tokens: MAX_TOKENS,
          system: spec.system,
          // Форма вывода — как у чтения фото (supplierVisionCore): в типах SDK её может не быть
          ...({ output_config: { format: { type: 'json_schema', schema: spec.schema } } } as object),
          messages: [{ role: 'user', content: user }],
        })
        if (reply.stop_reason === 'refusal')
          throw new Error(`Модель отказалась ${spec.what}`)
        if (reply.stop_reason === 'max_tokens')
          throw new Error(`Ответ не поместился в ${MAX_TOKENS} токенов`)
        const block = reply.content.find(b => b.type === 'text')
        if (!block || block.type !== 'text' || !block.text)
          throw new Error('Пустой ответ модели')
        return { raw: block.text, input: reply.usage.input_tokens, output: reply.usage.output_tokens }
      },
    }
  }

  // OpenAI и Google — их совместимый адрес; заглушка — под тем же localhost
  const base = stub ? { openai: `${stub}/openai/v1`, gemini: `${stub}/gemini/v1beta/openai` }[provider] ?? stub : config.baseURL!
  return {
    model,
    ask: async (user) => {
      let strict = true
      const signal = AbortSignal.timeout(TIMEOUT_MS)
      const request = () => fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal,
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: id,
          [config.maxTokensParam ?? 'max_tokens']: MAX_TOKENS,
          messages: [
            { role: 'system', content: strict ? spec.system : `${spec.system}\n\nОтветь только JSON по схеме:\n${JSON.stringify(spec.schema)}` },
            { role: 'user', content: user },
          ],
          response_format: strict
            ? { type: 'json_schema', json_schema: { name: spec.name, strict: true, schema: spec.schema } }
            : { type: 'json_object' },
        }),
      })
      let res = await request()
      if (res.status === 400) {
        strict = false
        res = await request()
      }
      if (!res.ok)
        throw Object.assign(new Error(`${id}: HTTP ${res.status}`), { status: res.status })
      const body = await res.json() as { choices?: { message?: { content?: string } }[], usage?: { prompt_tokens?: number, completion_tokens?: number } }
      const raw = body.choices?.[0]?.message?.content
      if (typeof raw !== 'string' || !raw.trim())
        throw new Error('Пустой ответ модели')
      return { raw, input: body.usage?.prompt_tokens ?? 0, output: body.usage?.completion_tokens ?? 0 }
    },
  }
}

export interface QueriesOutcome {
  /** Товарам (постам) подобраны запросы */
  done: number
  /** Ещё ждут */
  left: number
  more: boolean
  /** Почему не подбирали: нет миграции, ключа ИИ; ошибка провайдера — текстом */
  off: 'migration' | 'key' | null
  error: string | null
}

/**
 * Подобрать запросы новым прочитанным товарам, у которых их ещё нет: до
 * OFFERS_PER_PASS постов за раз, по ITEMS_PER_CALL товаров в запросе к модели.
 * Модель не ответила на товар — у него пустой список: второй раз его не берём
 * (иначе вставал бы первым в каждом проходе).
 */
export async function fillOfferQueries(db: SupabaseClient): Promise<QueriesOutcome> {
  const since = new Date(Date.now() - OFFER_DAYS * 86_400_000).toISOString()
  const { data, error } = await db.from('supplier_offers')
    .select('id, read_items')
    .eq('status', 'new')
    .gte('posted_at', since)
    .not('read_items', 'is', null)
    .is('search_queries', null)
    .order('posted_at', { ascending: false })
    .limit(OFFERS_PER_PASS + 1)
  if (error) {
    if (error.code === '42703')
      return { done: 0, left: 0, more: false, off: 'migration', error: null }
    throw createError({ statusCode: 500, message: error.message })
  }
  const rows = data.slice(0, OFFERS_PER_PASS)
  if (!rows.length)
    return { done: 0, left: 0, more: false, off: null, error: null }

  const loaded = await loadTextAsk(db, { system: QUERIES_PROMPT, schema: QUERIES_SCHEMA, name: 'search_queries', what: 'подбирать запросы' })
  if (!loaded)
    return { done: 0, left: data.length, more: false, off: 'key', error: null }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const jobs: Job[] = rows.map((r, n) => {
    const items = Array.isArray(r.read_items) ? r.read_items as Record<string, unknown>[] : []
    return {
      offerId: r.id,
      count: items.length,
      items: items.map((it, i) => ({ id: `${n}.${i}`, name: str(it.name) ?? '', brand: str(it.brand), age: str(it.age) })).filter(it => it.name),
    }
  })
  const found = new Map<string, string[]>()
  const spent = { input: 0, output: 0 }
  const all = jobs.flatMap(j => j.items)
  let failure: string | null = null
  for (let i = 0; i < all.length && !failure; i += ITEMS_PER_CALL) {
    const list = all.slice(i, i + ITEMS_PER_CALL)
    try {
      const reply = await loaded.ask(`Товары:\n${JSON.stringify(list)}`)
      spent.input += reply.input
      spent.output += reply.output
      for (const [id, queries] of parseQueriesReply(reply.raw, list.map(it => it.id)))
        found.set(id, queries)
    }
    catch (e) {
      failure = (await readFailure(e)).text
    }
  }

  // Записываем то, на что модель ответила; пачка с ошибкой — ждёт следующего прохода
  let done = 0
  const now = new Date().toISOString()
  for (const [n, job] of jobs.entries()) {
    const answered = job.items.length === 0 || job.items.some(it => found.has(it.id))
    if (!answered)
      continue
    const queries = Array.from({ length: job.count }, (_, i) => found.get(`${n}.${i}`) ?? [])
    const { error: saveError } = await db.from('supplier_offers').update({ search_queries: queries, queries_at: now }).eq('id', job.offerId)
    if (saveError)
      console.error('[supplier-queries] запросы не записались', job.offerId, saveError.message)
    else
      done++
  }
  // Расход — в журнал «батареек», как у чтения фото; постов не прибавляем
  if (spent.input || spent.output) {
    const { error: usageError } = await db.rpc('ai_usage_add', { p_model: loaded.model, p_input: spent.input, p_output: spent.output, p_posts: 0 })
    if (usageError && !['PGRST202', '42883'].includes(usageError.code ?? ''))
      console.error('[supplier-queries] расход не записался:', usageError.message)
  }
  const left = data.length - done
  return { done, left, more: !failure && done > 0 && left > 0, off: null, error: failure }
}

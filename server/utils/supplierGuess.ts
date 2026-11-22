import type { SupabaseClient } from '@supabase/supabase-js'
import type { QueriesOutcome } from './supplierQueries'
import type { OfferGuess } from '~/utils/offerGuess'
import { parseGuessReply } from '~/utils/offerGuess'
import { loadTextAsk } from './supplierQueries'
import { readFailure } from './supplierVision'

/**
 * Разбор товаров поставщиков ИИ — примерный спрос (22 ноября 2026). Владелец
 * 22.11: «для товаров ии должен еще делать примерный поиск а не обязательно
 * по названию товара то есть какой либо анализ».
 *
 * По прочитанному с фото названию, бренду и возрасту модель со страницы
 * «Модели ИИ» отвечает про каждый товар: как такую вещь ищут, не зная марки
 * («игрушечный пылесос»), и к какой теме «Спроса на рынке» она ближе по
 * смыслу. Запрос проверяет «Узнать спрос» вместе с точными фразами, тема даёт
 * уровень сразу — из её цифр. Подробности — utils/offerGuess.ts, миграция
 * 20261122120000.
 *
 * Отдельный проход, а не поле в подборе точных фраз: те уже подобраны у
 * сотен товаров, а здесь нужен ещё и список тем. Текстом, без фото: на Claude
 * Haiku 5.5 пачка из 40 товаров с сотней тем — ≈ 3 000 токенов на входе и
 * ≈ 1 000 на выходе, меньше $0,001.
 */

/** Товаров в одном запросе к модели */
const ITEMS_PER_CALL = 40
/** Товаров (постов) за один запрос страницы */
const OFFERS_PER_PASS = 40
const OFFER_DAYS = 30
/** Ключевых фраз темы в подсказке модели */
const TOPIC_HINTS = 3

const GUESS_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, query: { type: 'string' }, topic: { type: 'integer' } },
        required: ['id', 'query', 'topic'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

export const GUESS_PROMPT = `Ты разбираешь товары для закупщика магазина детских игрушек в Казахстане: что это за вещь и как такие вещи ищут покупатели.
Название у поставщика часто непонятное: малоизвестная марка, номер модели, перевод с китайского. Точное название почти никто не ищет — поэтому разбери по смыслу, что это за вещь.

Для каждого товара ответь:
- query — запрос в Google на русском, которым покупатель ищет такую вещь, не зная марки и модели: 2–4 слова строчными, вид вещи и её главное свойство («игрушечный пылесос», «коляска для кукол», «машинка на радиоуправлении», «набор фигурок животных», «детский туалетный столик»). Без марки поставщика, артикула, цены, количества и знаков препинания. Известного персонажа или бренд оставь, только если без него вещь не описать («фигурка человек паук», «кукла барби»). Не понять, что это за вещь, — пустая строка.
- topic — номер темы спроса из списка, которую ищут, когда хотят именно такую вещь: «полицейская машина с мигалкой» — тема машинок, «игровое кафе с продуктами» — тема детской кухни или сюжетно-ролевых игр. Тема должна быть про ту же вещь, а не про соседнюю: коляске для кукол не подходит тема кукол, набору для лепки — тема пазлов. Ни одна не подходит — 0.
- id — ровно как в списке; ответ — по каждому товару.`

interface Job {
  offerId: string
  /** Товаров в посте; разбор ложится в том же порядке */
  count: number
  items: { id: string, name: string, brand: string | null, age: string | null }[]
}

/** Темы — нумерованным списком: модель отвечает номером, а не длинным id */
function topicList(topics: { name: string, keywords: string[] | null }[]): string {
  return topics.map((t, i) => {
    const hints = (t.keywords ?? []).slice(0, TOPIC_HINTS).join(', ')
    return `${i + 1}. ${t.name}${hints ? ` — ${hints}` : ''}`
  }).join('\n')
}

/**
 * Разобрать новые прочитанные товары, у которых разбора ещё нет: до
 * OFFERS_PER_PASS постов за раз, по ITEMS_PER_CALL товаров в запросе к
 * модели. Модель не ответила на товар — у него пустой разбор: второй раз
 * его не берём (иначе вставал бы первым в каждом проходе).
 */
export async function fillOfferGuesses(db: SupabaseClient): Promise<QueriesOutcome> {
  const since = new Date(Date.now() - OFFER_DAYS * 86_400_000).toISOString()
  const { data, error } = await db.from('supplier_offers')
    .select('id, read_items')
    .eq('status', 'new')
    .gte('posted_at', since)
    .not('read_items', 'is', null)
    .is('demand_guess', null)
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

  const [loaded, topicsRes] = await Promise.all([
    loadTextAsk(db, { system: GUESS_PROMPT, schema: GUESS_SCHEMA, name: 'demand_guess', what: 'разбирать товары' }),
    db.from('market_demand_topics').select('id, name, keywords').eq('is_active', true).order('name'),
  ])
  if (!loaded)
    return { done: 0, left: data.length, more: false, off: 'key', error: null }
  // Без «Спроса на рынке» тем нет — разбор только с запросом
  if (topicsRes.error && !['42P01', 'PGRST205'].includes(topicsRes.error.code ?? ''))
    throw createError({ statusCode: 500, message: topicsRes.error.message })
  const topics = (topicsRes.data ?? []) as { id: string, name: string, keywords: string[] | null }[]
  const topicIds = topics.map(t => t.id)
  const topicText = topics.length ? topicList(topics) : '(тем пока нет — topic всегда 0)'

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const jobs: Job[] = rows.map((r, n) => {
    const items = Array.isArray(r.read_items) ? r.read_items as Record<string, unknown>[] : []
    return {
      offerId: r.id,
      count: items.length,
      items: items.map((it, i) => ({ id: `${n}.${i}`, name: str(it.name) ?? '', brand: str(it.brand), age: str(it.age) })).filter(it => it.name),
    }
  })
  const found = new Map<string, OfferGuess>()
  const spent = { input: 0, output: 0 }
  const all = jobs.flatMap(j => j.items)
  let failure: string | null = null
  for (let i = 0; i < all.length && !failure; i += ITEMS_PER_CALL) {
    const list = all.slice(i, i + ITEMS_PER_CALL)
    try {
      const reply = await loaded.ask(`Темы спроса:\n${topicText}\n\nТовары:\n${JSON.stringify(list)}`)
      spent.input += reply.input
      spent.output += reply.output
      for (const [id, guess] of parseGuessReply(reply.raw, list.map(it => it.id), topicIds))
        found.set(id, guess)
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
    const guess = Array.from({ length: job.count }, (_, i) => found.get(`${n}.${i}`) ?? { query: null, topic: null })
    const { error: saveError } = await db.from('supplier_offers').update({ demand_guess: guess, guessed_at: now }).eq('id', job.offerId)
    if (saveError)
      console.error('[supplier-guess] разбор не записался', job.offerId, saveError.message)
    else
      done++
  }
  // Расход — в журнал «батареек», как у подбора запросов; постов не прибавляем
  if (spent.input || spent.output) {
    const { error: usageError } = await db.rpc('ai_usage_add', { p_model: loaded.model, p_input: spent.input, p_output: spent.output, p_posts: 0 })
    if (usageError && !['PGRST202', '42883'].includes(usageError.code ?? ''))
      console.error('[supplier-guess] расход не записался:', usageError.message)
  }
  const left = data.length - done
  return { done, left, more: !failure && done > 0 && left > 0, off: null, error: failure }
}

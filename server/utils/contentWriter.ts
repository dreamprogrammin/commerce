import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WriterCategory, WrittenOfferProduct, WrittenProduct } from '~/utils/aiWriter'
import type { OfferItem } from '~/utils/supplierOfferList'
import { Buffer } from 'node:buffer'
import { adminPromptTask, PROMPT_SHOP_RULES } from '~/constants/adminPrompts'
import { sanitizeBrandHtml } from '../../supabase/functions/generate-brand-seo/validate'

/**
 * «Тексты для сайта» (23 ноября 2026). Владелец: «чтобы кнопка на сайт
 * отработала так чтобы были добавлено описание и подбираться разделы бренды а
 * если бренд отсутствует ии должна найти ее и написать описание для сайта».
 *
 * «На сайт» в «Товарах поставщиков» открывает форму нового товара, и модель
 * задачи «Тексты для сайта» со страницы «Модели ИИ» (по умолчанию Claude
 * Sonnet 5.5) пишет по фото и подписи поста название, описание и
 * SEO-описание, выбирает раздел и бренд из тех, что есть на сайте. Бренда на
 * сайте нет — модель только называет его (new_brand), а создаёт бренд
 * человек, в окне формы товара. Поиск бренда в интернете с его страницей был
 * (23.11) и убран 24.11.2026 по слову владельца: «если бренд отсутствует то
 * мы его вручную заполняем чтобы не уходила много денег на бренд» — первый
 * же бренд съел ~7 центов токенов и поиски сверху, а товар — ~2. Код поиска —
 * в коммите 1afd0ace.
 *
 * Правила магазина и задания — те же, что у кнопки «Скопировать промпт»
 * (constants/adminPrompts.ts): меняются там — меняются и здесь. Отличие одно:
 * ответ — JSON по схеме, а не строки «Имя поля:».
 *
 * В базу пишет только журнал расхода: тексты уходят в форму, человек их
 * читает, правит и сохраняет.
 *
 * Отказной запасной модели (`fallbacks`) здесь нет намеренно: у Sonnet 5.5
 * сервер повторяет на другой модели только отказы «cyber» и «frontier_llm»,
 * к описаниям игрушек они отношения не имеют. Отказ показывается как есть.
 */

/*
 * SDK и модуль чтения постов — по требованию, как в supplierVision.ts: файлы
 * server/utils попадают в общий чанк сервера.
 */
const loadAnthropic = () => import('@anthropic-ai/sdk').then(m => m.default)
const loadCore = () => import('../../supabase/functions/_shared/supplierVisionCore')

/** Ответа ждём не дольше: дальше «Повторить» в карточке над формой */
const WRITE_TIMEOUT_MS = 90_000
/** Потолок ответа; в него входят и размышления модели. Платится только выданное */
const MAX_TOKENS = 8000
/**
 * Уровень рассуждений — низкий, как у чтения постов: описание по готовым
 * правилам — не задача на долгие раздумья, а Sonnet 5.5 без явного уровня
 * думает на high — дольше и дороже.
 */
const EFFORT = 'low'
/** Подписи поставщика модели хватит начала: дальше обычно условия опта */
const CAPTION_CHARS = 1500
/** Закрытый бакет фото постов — как в supplierOffers.ts */
const PHOTO_BUCKET = 'supplier-photos'
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type PhotoType = typeof PHOTO_TYPES[number]

// ---------- разделы и бренды сайта ----------

export interface WriterBrand {
  id: string
  name: string
  slug: string
}

/**
 * Путь каждого раздела от верхнего — по нему модель понимает, что это за
 * раздел («Питомцы» у девочек и у мальчиков разные). Порядок — по пути:
 * промпт одинаков от запроса к запросу и берётся из кеша Anthropic.
 */
export function categoryPaths(rows: { id: string, name: string, parent_id: string | null }[]): WriterCategory[] {
  const byId = new Map(rows.map(r => [r.id, r]))
  const pathOf = (row: (typeof rows)[number]) => {
    const names: string[] = []
    const seen = new Set<string>()
    for (let cur: (typeof rows)[number] | undefined = row; cur && !seen.has(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined) {
      seen.add(cur.id)
      names.unshift(cur.name.trim())
    }
    return names.join(' › ')
  }
  return rows.map(r => ({ id: r.id, path: pathOf(r) })).sort((a, b) => a.path.localeCompare(b.path, 'ru'))
}

/** Название бренда для сравнения: «L.O.L. Surprise!», «LOL Surprise» и слаг lol-surprise — одно */
export function normBrandName(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Бренд сайта под другим написанием — по названию или слагу */
export function matchSiteBrand<T extends { name: string, slug: string }>(brands: T[], name: string): T | null {
  const key = normBrandName(name)
  if (!key)
    return null
  return brands.find(b => normBrandName(b.name) === key || normBrandName(b.slug) === key) ?? null
}

async function siteLists(db: SupabaseClient): Promise<{ categories: WriterCategory[], brands: WriterBrand[] }> {
  const [cats, brands] = await Promise.all([
    db.from('categories').select('id, name, parent_id'),
    db.from('brands').select('id, name, slug'),
  ])
  if (cats.error)
    throw createError({ statusCode: 500, message: cats.error.message })
  if (brands.error)
    throw createError({ statusCode: 500, message: brands.error.message })
  return {
    categories: categoryPaths(cats.data),
    brands: (brands.data as WriterBrand[]).map(b => ({ ...b, name: b.name.trim() })).sort((a, b) => a.name.localeCompare(b.name, 'ru')),
  }
}

// ---------- данные поста ----------

/**
 * Подпись поставщика — без телефонов, ссылок, упоминаний и сумм: модели
 * они не нужны, а оптовая цена или чужой номер в тексте сайта — брак.
 */
export function cleanCaption(caption: string | null | undefined): string {
  if (!caption)
    return ''
  return caption
    .replace(/https?:\/\/\S+|(?:t|wa)\.me\/\S+/gi, ' ')
    .replace(/@\w{3,}/g, ' ')
    .replace(/(?:\+\s*7|\b8|\b7)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, ' ')
    // Сумма — в пределах строки: через перевод строки съелся бы артикул выше
    .replace(/\d[\d .,\xA0]*(?:тг|тенге|₸|kzt|руб|₽)/gi, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, CAPTION_CHARS)
}

/** Блок ДАННЫЕ — подписи строк как у кнопки «Скопировать промпт» */
export function offerProductData(item: OfferItem, caption: string | null, itemsInPost: number): string {
  const lines = [
    `- Название сейчас (с коробки / от поставщика): ${item.name}`,
    `- Бренд: ${item.brand ?? ''}`,
    `- Код модели (артикул с коробки): ${item.article ?? ''}`,
    `- Возраст: ${item.age ?? ''}`,
  ]
  const text = cleanCaption(caption)
  const where = itemsInPost > 1
    ? `В посте товаров: ${itemsInPost} — пиши только про этот: «${item.name}»${item.article ? `, артикул ${item.article}` : ''}. На фото могут быть и другие.`
    : ''
  return [
    'ДАННЫЕ:',
    ...lines,
    `- Подпись поставщика к посту (сырые сведения о товаре; цены, условия опта, телефоны и ссылки на сайт не переносить):\n${text || '(без подписи)'}`,
    where,
  ].filter(Boolean).join('\n')
}

async function offerPhoto(db: SupabaseClient, offerId: string): Promise<{ mediaType: PhotoType, data: string } | null> {
  const { data: row, error } = await db.from('supplier_offers').select('photo_path').eq('id', offerId).maybeSingle()
  const path = (row as { photo_path: string | null } | null)?.photo_path
  if (error || !path)
    return null
  const { data: blob, error: downloadError } = await db.storage.from(PHOTO_BUCKET).download(path)
  if (downloadError || !blob) {
    console.error('[content-writer] фото поста не скачалось', path, downloadError?.message)
    return null
  }
  const byExt: Record<string, PhotoType> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }
  const mediaType = (PHOTO_TYPES as readonly string[]).includes(blob.type)
    ? blob.type as PhotoType
    : byExt[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg'
  return { mediaType, data: Buffer.from(await blob.arrayBuffer()).toString('base64') }
}

// ---------- ответ модели ----------

const PRODUCT_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    seo_description: { type: 'string' },
    category: { type: 'integer' },
    brand: { type: 'integer' },
    new_brand: { type: 'string' },
  },
  required: ['name', 'description', 'seo_description', 'category', 'brand', 'new_brand'],
  additionalProperties: false,
} as const

/** Системный промпт: правила и задание кнопки + списки сайта. Одинаков для всех товаров — кешируется */
export function productSystem(categories: WriterCategory[], brands: WriterBrand[]): string {
  return `${PROMPT_SHOP_RULES}

${adminPromptTask('product')}

ОТКУДА ДАННЫЕ: товар пришёл от оптового поставщика. К блоку ДАННЫЕ приложено фото из его поста — что на нём видно (вид товара, цвет, детали комплекта, надписи на коробке), тоже данные. Название от поставщика бывает машинным переводом — перепиши его по схеме из задания.

РАЗДЕЛЫ КАТАЛОГА (номер. путь):
${categories.map((c, i) => `${i + 1}. ${c.path}`).join('\n')}

БРЕНДЫ НА САЙТЕ (номер. название):
${brands.length ? brands.map((b, i) => `${i + 1}. ${b.name}`).join('\n') : '(пока нет)'}

ОТВЕТ — JSON по схеме, а не строки «Имя поля:»:
- name — «Название товара»;
- description — «Описание», HTML по формату из правил;
- seo_description — «SEO описание»;
- category — номер раздела каталога, куда покупатель пойдёт за таким товаром. Бери самый узкий подходящий раздел (последний в пути); верхний («Девочкам», «Мальчикам», «Малышам») — только если ни один его подраздел не подходит. Не подходит ни один — 0;
- brand — номер бренда из списка, если товар этого бренда (бренд виден на коробке, в названии или в подписи); иначе 0;
- new_brand — если на товаре или в подписи явно указан бренд-производитель, а в списке его нет, — его название, как пишет сам бренд; иначе пустая строка. Не бренд: название поставщика или магазина, серия, персонаж, фабрика без торговой марки, «noname».`
}

const plainText = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/** Шаблонная вода и чужие сроки доставки — те же проверки, что у генератора страниц брендов */
function textWarnings(text: string): string[] {
  const warnings: string[] = []
  if (/за\s+1\s+день|за\s+один\s+день|по\s+(?:всему\s+)?казахстану[^.]{0,40}1[–-]3/i.test(text))
    warnings.push('Неверное обещание доставки: по условиям Алматы 1–3 рабочих дня, Казахстан 3–7')
  if (/(?:широк|больш|огромн|богат)(?:ий|ой|ого|ый)\s+(?:выбор|ассортимент)|заказывайте|прямо сейчас|вы найд[её]те/i.test(text))
    warnings.push('Шаблонная вода («широкий выбор», «заказывайте прямо сейчас») — переписать')
  return warnings
}

/**
 * Ответ модели — в поля формы. Номера разделов и брендов — в id; номер не
 * из списка — «не выбрано». «Новый» бренд, который на сайте есть под другим
 * написанием, — существующий.
 */
export function parseProductReply(raw: string, categories: WriterCategory[], brands: WriterBrand[]): WrittenProduct {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw)
  }
  catch {
    throw new Error('Ответ модели не разобрался')
  }
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const num = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : 0)

  const name = plainText(str(data.name)).slice(0, 200)
  const { html: description, warnings } = sanitizeBrandHtml(str(data.description))
  const seoDescription = plainText(str(data.seo_description)).slice(0, 300)
  const c = num(data.category)
  const b = num(data.brand)
  const category = c >= 1 && c <= categories.length ? categories[c - 1]! : null
  let brand: WriterBrand | null = b >= 1 && b <= brands.length ? brands[b - 1]! : null
  let newBrand: string | null = plainText(str(data.new_brand)).slice(0, 60) || null
  if (newBrand) {
    const known = matchSiteBrand(brands, newBrand)
    brand ??= known
    // Бренд из списка — главнее: «новым» модель назвала то же или ошиблась
    if (brand)
      newBrand = null
  }

  const head = name.split(' — ')[0] ?? ''
  if (!name)
    warnings.push('Название пустое — оставлено прочитанное с фото')
  else if (head.length > 60)
    warnings.push(`Название до « — » — ${head.length} знаков: Google обрежет после 60`)
  if (!description)
    warnings.push('Описание пустое — напишите вручную')
  if (seoDescription && (seoDescription.length < 100 || seoDescription.length > 170))
    warnings.push(`SEO описание — ${seoDescription.length} знаков, нужно 120–160`)
  warnings.push(...textWarnings(`${name} ${seoDescription} ${plainText(description)}`))

  return {
    name,
    description,
    seoDescription,
    category,
    brand: brand && { id: brand.id, name: brand.name },
    newBrand,
    warnings,
  }
}

// ---------- запрос к Claude ----------

interface Claude {
  client: Anthropic
  /** «anthropic/claude-sonnet-5-5» — для журнала расхода */
  spec: string
  model: string
  effort: boolean
}

async function claudeFor(db: SupabaseClient, timeout: number): Promise<Claude> {
  const [spec, core, AnthropicSdk] = await Promise.all([aiTaskModel(db, 'content_writer_model'), loadCore(), loadAnthropic()])
  const { provider, model } = core.parseModelSpec(spec)
  if (provider !== 'anthropic')
    throw createError({ statusCode: 409, message: '«Тексты для сайта» пишет только Claude — выберите модель Claude на странице «Модели ИИ»' })
  const { data: key, error } = await db.rpc('ai_key_get', { p_provider: provider })
  if (error)
    throw createError({ statusCode: 500, message: `Не прочитать ключ ${provider}: ${error.message}` })
  if (typeof key !== 'string' || !key)
    throw createError({ statusCode: 409, message: 'Ключа Anthropic нет — задайте его на странице «Модели ИИ»' })
  // Заглушка стража — та же, что у «Моделей ИИ» и чтения постов
  const client = new AnthropicSdk({ apiKey: key, baseURL: aiStubBase() ?? undefined, timeout, maxRetries: 1 })
  return { client, spec, model, effort: await core.supportsEffort(client, model) }
}

interface Spent { input: number, output: number }

function addUsage(spent: Spent, usage: Anthropic.Usage) {
  // Журнал считает весь вход одной ценой, хотя запись в кеш в 1,25 раза дороже, а чтение у Sonnet 5.5 — в 20 раз
  // дешевле: это оценка. Точная цена запроса — в ответе (usage) и в карточке «Тексты от ИИ» (utils/aiCost.ts)
  spent.input += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  spent.output += usage.output_tokens
}

/** Расход — в журнал «батареек», как у чтения постов; постов не прибавляем */
async function recordUsage(db: SupabaseClient, spec: string, spent: Spent) {
  if (!spent.input && !spent.output)
    return
  const { error } = await db.rpc('ai_usage_add', { p_model: spec, p_input: spent.input, p_output: spent.output, p_posts: 0 })
  if (error && !['PGRST202', '42883'].includes(error.code ?? ''))
    console.error('[content-writer] расход не записался:', error.message)
}

/** Сбой провайдера — фразой для карточки над формой; текст провайдера не отдаём: в нём бывает кусок ключа */
async function providerFailure(error: unknown): Promise<never> {
  if (isError(error))
    throw error
  const { text } = await readFailure(error)
  throw createError({ statusCode: 502, message: text.replace('прочитайте позже', 'попробуйте позже') })
}

function stopProblem(reply: Anthropic.Message, what: string): string | null {
  if (reply.stop_reason === 'refusal')
    return `Модель отказалась ${what} — заполните вручную`
  if (reply.stop_reason === 'max_tokens')
    return `Ответ модели не поместился в ${MAX_TOKENS} токенов — нажмите «Повторить»`
  return null
}

/**
 * Тексты, раздел и бренд для товара из поста поставщика: `item` — номер
 * товара в посте, как в адресе «На сайт».
 */
export async function writeOfferProduct(db: SupabaseClient, offerId: string, itemIndex: number): Promise<WrittenOfferProduct> {
  const [offer, photo, lists] = await Promise.all([supplierOfferDraft(db, offerId), offerPhoto(db, offerId), siteLists(db)])
  const items = offer.items ?? []
  const item = items[itemIndex]
  if (!item?.name)
    throw createError({ statusCode: 409, message: 'ИИ ещё не прочитал этот товар — нажмите «Прочитать» в «Товарах поставщиков»' })

  const claude = await claudeFor(db, WRITE_TIMEOUT_MS)
  // Курс для строки «Расход» — пока модель пишет; не бросает (server/utils/usdKzt.ts)
  const rate = usdKztRate()
  const reply = await claude.client.messages.create({
    model: claude.model,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: productSystem(lists.categories, lists.brands), cache_control: { type: 'ephemeral' } }],
    output_config: { format: { type: 'json_schema', schema: PRODUCT_SCHEMA }, ...(claude.effort ? { effort: EFFORT } : {}) },
    messages: [{
      role: 'user',
      content: [
        ...(photo ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: photo.mediaType, data: photo.data } }] : []),
        { type: 'text' as const, text: offerProductData(item, offer.caption, items.length) },
      ],
    }],
  }).catch(providerFailure)

  // Токены платятся и за отказ — в журнал до разбора
  const spent: Spent = { input: 0, output: 0 }
  addUsage(spent, reply.usage)
  await recordUsage(db, claude.spec, spent)

  const problem = stopProblem(reply, 'писать текст для этого товара')
  if (problem)
    throw createError({ statusCode: 502, message: problem })
  const block = reply.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text' || !block.text)
    throw createError({ statusCode: 502, message: 'Модель вернула пустой ответ — нажмите «Повторить»' })
  let written: WrittenProduct
  try {
    written = parseProductReply(block.text, lists.categories, lists.brands)
  }
  catch (e) {
    throw createError({ statusCode: 502, message: `${(e as Error).message} — нажмите «Повторить»` })
  }
  if (!photo)
    written.warnings.unshift('Фото поста не скачалось — текст написан только по подписи и прочитанному')
  // Бюджет — после записи расхода: этот запрос уже в журнале (server/utils/usageMeters.ts)
  const [usdKzt, budget] = await Promise.all([rate, writerBudget(db, claude.spec)])
  const usage = {
    input: reply.usage.input_tokens,
    cacheWrite: reply.usage.cache_creation_input_tokens ?? 0,
    cacheRead: reply.usage.cache_read_input_tokens ?? 0,
    output: reply.usage.output_tokens,
    rate: usdKzt,
  }
  return { ...written, model: claude.spec, photo: Boolean(photo), usage, budget }
}

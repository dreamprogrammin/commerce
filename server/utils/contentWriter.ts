import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BrandPage, BrandResearch, WriterCategory, WrittenOfferProduct, WrittenProduct } from '~/utils/aiWriter'
import type { OfferItem } from '~/utils/supplierOfferList'
import { Buffer } from 'node:buffer'
import { adminPromptTask, PROMPT_SHOP_RULES } from '~/constants/adminPrompts'
import { slugify } from '~/utils/slugify'
import { checkLengths, sanitizeBrandHtml } from '../../supabase/functions/generate-brand-seo/validate'

/**
 * «Тексты для сайта» (23 ноября 2026). Владелец: «чтобы кнопка на сайт
 * отработала так чтобы были добавлено описание и подбираться разделы бренды а
 * если бренд отсутствует ии должна найти ее и написать описание для сайта».
 *
 * «На сайт» в «Товарах поставщиков» открывает форму нового товара, и модель
 * задачи «Тексты для сайта» со страницы «Модели ИИ» (по умолчанию Claude
 * Sonnet 5.5) пишет по фото и подписи поста название, описание и
 * SEO-описание, выбирает раздел и бренд из тех, что есть на сайте. Бренда на
 * сайте нет — researchBrand ищет его в интернете (инструмент поиска
 * Anthropic) и пишет страницу бренда; создаётся бренд вместе с товаром, по
 * «Создать товар».
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
/** Поиск бренда — несколько запросов в интернет подряд, ему дольше */
const RESEARCH_TIMEOUT_MS = 120_000
/** Потолок ответа; в него входят и размышления модели. Платится только выданное */
const MAX_TOKENS = 8000
/**
 * Уровень рассуждений — низкий, как у чтения постов: описание по готовым
 * правилам — не задача на долгие раздумья, а Sonnet 5.5 без явного уровня
 * думает на high — дольше и дороже.
 */
const EFFORT = 'low'
/** Поисков в интернете на бренд: у Anthropic $10 за 1000, то есть цент за поиск */
const BRAND_SEARCHES = 4
/** Сколько раз продолжать поиск, поставленный сервером на паузу (pause_turn) */
const MAX_CONTINUES = 2
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

interface Spent { input: number, output: number, searches: number }

function addUsage(spent: Spent, usage: Anthropic.Usage) {
  // Чтение из кеша дешевле в 10 раз, но журнал считает токены одной ценой — оценка с запасом
  spent.input += usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  spent.output += usage.output_tokens
  spent.searches += usage.server_tool_use?.web_search_requests ?? 0
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
  const spent: Spent = { input: 0, output: 0, searches: 0 }
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
  return { ...written, model: claude.spec, photo: Boolean(photo) }
}

// ---------- бренд, которого на сайте нет ----------

export const RESEARCH_PROMPT = `Ты помогаешь интернет-магазину детских игрушек «Ухтышка» (Алматы, Казахстан) завести страницу бренда, которого на сайте ещё нет. Найди в интернете, что это за бренд: кто и где его выпускает, что именно (виды игрушек, известные серии), для какого возраста, страна и год основания — только если их называют надёжные источники: сайт самого бренда, Википедия, крупные магазины и издания об игрушках. Отзывы, объявления и карточки маркетплейсов без сведений о бренде — не источник.

Ответь коротко, по-русски, списком фактов; у каждого факта — адрес источника. Первой строкой — как пишется название бренда у самого бренда.

Если поиск не подтвердил, что это бренд игрушек или детских товаров (это название поставщика, магазина, фабрики без торговой марки, серии или персонажа другого бренда — или о нём ничего не нашлось), начни ответ словами «НЕ НАЙДЕН» и объясни одной фразой почему. Не додумывай: лучше «НЕ НАЙДЕН», чем чужие факты.`

const BRAND_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    name: { type: 'string' },
    meta_title: { type: 'string' },
    seo_h1: { type: 'string' },
    seo_description: { type: 'string' },
    seo_keywords: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
  },
  required: ['found', 'name', 'meta_title', 'seo_h1', 'seo_description', 'seo_keywords', 'description'],
  additionalProperties: false,
} as const

export const BRAND_SYSTEM = `${PROMPT_SHOP_RULES}

${adminPromptTask('brand')}

Бренда на сайте ещё нет: факты о нём найдены поиском в интернете и даны в ДАННЫХ вместе с адресами. Используй только их — чего там нет, того не пиши.

ОТВЕТ — JSON по схеме, а не строки «Имя поля:»:
- found — false, если по ДАННЫМ не видно, что это бренд игрушек или детских товаров; тогда остальные поля — пустые;
- name — название бренда, как его пишет сам бренд;
- meta_title — «Заголовок страницы (title)»;
- seo_h1 — «Заголовок на странице (H1)»;
- seo_description — «SEO описание»;
- seo_keywords — «Ключевые слова», по одной фразе в элементе;
- description — «Описание», HTML по формату из правил.`

/** Страница бренда из ответа модели; found=false или без названия — бренда нет */
export function parseBrandReply(raw: string): { page: BrandPage | null, warnings: string[] } {
  let data: Record<string, unknown>
  try {
    data = JSON.parse(raw)
  }
  catch {
    throw new Error('Ответ модели не разобрался')
  }
  const str = (v: unknown) => (typeof v === 'string' ? plainText(v) : '')
  const name = str(data.name).slice(0, 60)
  if (data.found !== true || !name)
    return { page: null, warnings: [] }
  const { html: description, warnings } = sanitizeBrandHtml(typeof data.description === 'string' ? data.description.trim() : '')
  const keywords = Array.isArray(data.seo_keywords) ? data.seo_keywords.map(str).filter(Boolean) : []
  const page: BrandPage = {
    name,
    slug: slugify(name),
    meta_title: str(data.meta_title).slice(0, 120),
    seo_h1: str(data.seo_h1).slice(0, 120),
    seo_description: str(data.seo_description).slice(0, 300),
    seo_keywords: [...new Set(keywords)].slice(0, 10),
    description,
  }
  warnings.push(...checkLengths({ brand_id: '', ...page }))
  return { page, warnings }
}

const NOT_FOUND = /^[\s*#_«"]*НЕ\s+НАЙДЕН[\s.:—-]*/i

/**
 * Бренд, которого нет на сайте: поиск в интернете, потом страница бренда по
 * найденному — двумя запросами. Одним нельзя: ответ по схеме (output_config)
 * несовместим с цитатами, а поиск Anthropic всегда отвечает с цитатами.
 * Ничего не создаёт — страница уходит в форму товара.
 */
export async function researchBrand(db: SupabaseClient, input: { name: string, product: string, article: string | null }): Promise<BrandResearch> {
  const { brands } = await siteLists(db)
  const already = matchSiteBrand(brands, input.name)
  if (already)
    return { found: true, existing: { id: already.id, name: already.name }, page: null, facts: '', sources: [], warnings: [], searches: 0, model: '' }
  const claude = await claudeFor(db, RESEARCH_TIMEOUT_MS)

  const spent: Spent = { input: 0, output: 0, searches: 0 }
  try {
    // 1. Поиск: факты с адресами
    const messages: Anthropic.MessageParam[] = [{
      role: 'user',
      content: `Бренд: «${input.name}». Товар этого бренда у поставщика: «${input.product}»${input.article ? `, артикул ${input.article}` : ''}.`,
    }]
    const texts: string[] = []
    const sources = new Map<string, string>()
    for (let turn = 0; ; turn++) {
      const reply = await claude.client.messages.create({
        model: claude.model,
        max_tokens: MAX_TOKENS,
        system: RESEARCH_PROMPT,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: BRAND_SEARCHES }],
        ...(claude.effort ? { output_config: { effort: EFFORT } } : {}),
        messages,
      }).catch(providerFailure)
      addUsage(spent, reply.usage)
      for (const block of reply.content) {
        if (block.type !== 'text')
          continue
        texts.push(block.text)
        for (const c of block.citations ?? []) {
          if (c.type === 'web_search_result_location' && !sources.has(c.url))
            sources.set(c.url, c.title || c.url)
        }
      }
      const problem = stopProblem(reply, 'искать этот бренд')
      if (reply.stop_reason === 'refusal')
        throw createError({ statusCode: 502, message: problem! })
      // Сервер поставил поиск на паузу — отправить ход назад как есть, он продолжит
      if (reply.stop_reason === 'pause_turn' && turn < MAX_CONTINUES) {
        messages.push({ role: 'assistant', content: reply.content })
        continue
      }
      break
    }
    const facts = texts.join('').trim()
    if (!facts || NOT_FOUND.test(facts)) {
      const reason = facts.replace(NOT_FOUND, '').split('\n')[0]!.trim().slice(0, 300)
      return { found: false, name: input.name, reason: reason || 'Поиск ничего не нашёл', searches: spent.searches, model: claude.spec }
    }

    // 2. Страница бренда по найденному
    const reply = await claude.client.messages.create({
      model: claude.model,
      max_tokens: MAX_TOKENS,
      system: BRAND_SYSTEM,
      output_config: { format: { type: 'json_schema', schema: BRAND_SCHEMA }, ...(claude.effort ? { effort: EFFORT } : {}) },
      messages: [{
        role: 'user',
        content: [
          'ДАННЫЕ:',
          `- Бренд: ${input.name}`,
          `- Что выпускает (по товарам в магазине): у нас пока один товар этого бренда — «${input.product}»`,
          `- Факты о бренде из надёжного источника (страна, год, чем известен) — с источником:\n${facts}`,
        ].join('\n'),
      }],
    }).catch(providerFailure)
    addUsage(spent, reply.usage)
    const problem = stopProblem(reply, 'писать страницу бренда')
    if (problem)
      throw createError({ statusCode: 502, message: problem })
    const block = reply.content.find(b => b.type === 'text')
    if (!block || block.type !== 'text' || !block.text)
      throw createError({ statusCode: 502, message: 'Модель вернула пустой ответ — нажмите «Повторить»' })
    let parsed: ReturnType<typeof parseBrandReply>
    try {
      parsed = parseBrandReply(block.text)
    }
    catch (e) {
      throw createError({ statusCode: 502, message: `${(e as Error).message} — нажмите «Повторить»` })
    }
    const list = [...sources].slice(0, 6).map(([url, title]) => ({ url, title }))
    if (!parsed.page)
      return { found: false, name: input.name, reason: 'По найденному не видно, что это бренд игрушек', searches: spent.searches, model: claude.spec }
    // Поиск назвал бренд так, как он уже записан на сайте
    const known = matchSiteBrand(brands, parsed.page.name)
    if (known)
      return { found: true, existing: { id: known.id, name: known.name }, page: null, facts, sources: list, warnings: [], searches: spent.searches, model: claude.spec }
    return { found: true, existing: null, page: parsed.page, facts, sources: list, warnings: parsed.warnings, searches: spent.searches, model: claude.spec }
  }
  finally {
    await recordUsage(db, claude.spec, spent)
  }
}

/**
 * Чтение поста поставщика: фото товара + подпись → название, артикул, цена.
 *
 * Зачем (31 октября 2026). Агент «новинки поставщиков» (проект в
 * docs/HANDOFF.md) читает Telegram-каналы оптовиков и отбирает, что стоит
 * завести на сайт. Главное, что должна уметь модель, — без ошибок прочесть
 * артикул и цену с фотографии. Какая модель справится лучше и дешевле — решит
 * тест на реальных постах, поэтому модель здесь — НАСТРОЙКА, а не код
 * (просьба владельца: «чтобы мы могли подставить любую модель, которая может
 * чётко читать картинки»).
 *
 * Модель задаётся строкой `провайдер/модель`:
 *   anthropic/claude-haiku-5-5        — Anthropic, официальный SDK
 *   openai/gpt-…                      — OpenAI
 *   gemini/gemini-…                   — Google, через их OpenAI-совместимый адрес
 *
 * Только официальные API разработчиков моделей (решение владельца
 * 31.10.2026): фото и цены поставщиков не должны уходить посредникам.
 * OpenRouter и «любой совместимый сервер» были здесь и убраны — агрегатор
 * пропускает данные через себя и через сторонних хостеров моделей.
 * Новый провайдер — только с его собственным адресом API.
 * Ключи — переменными окружения, см. PROVIDERS. Модуль без зависимостей от
 * Supabase: его же гоняет стенд `scripts/supplier-vision/compare.ts`.
 */
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.123.0'

export interface PostImage {
  /** image/jpeg, image/png, image/webp */
  mediaType: string
  /** base64 без префикса data: */
  data: string
}

export interface SupplierPost {
  images: PostImage[]
  /** Подпись к посту или соседнее текстовое сообщение — может не быть */
  caption: string | null
}

export interface ReadItem {
  name: string
  article: string | null
  brand: string | null
  /** Цена из текста поста */
  price_text: number | null
  /** Цена, напечатанная на картинке */
  price_image: number | null
  /** Опт, розница, «от 3 шт.» — как сказано у поставщика */
  price_note: string | null
  age: string | null
  confidence: 'high' | 'medium' | 'low'
  /** Что именно не удалось прочесть уверенно */
  doubt: string | null
}

export interface ReadResult {
  model: string
  items: ReadItem[]
  /** Сырой ответ модели — для разбора ошибок стендом */
  raw: string
  inputTokens: number | null
  outputTokens: number | null
  ms: number
}

/** Итоговая цена по правилу владельца: текст рядом с фото главнее цены на фото. */
export function pickPrice(item: ReadItem): { price: number | null, source: 'text' | 'image' | null, conflict: boolean } {
  const conflict = item.price_text !== null && item.price_image !== null && item.price_text !== item.price_image
  if (item.price_text !== null)
    return { price: item.price_text, source: 'text', conflict }
  if (item.price_image !== null)
    return { price: item.price_image, source: 'image', conflict }
  return { price: null, source: null, conflict }
}

const nullable = (type: string) => ({ anyOf: [{ type }, { type: 'null' }] })

/** Одна схема для всех провайдеров — так ответы разных моделей сравнимы. */
export const READ_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          article: nullable('string'),
          brand: nullable('string'),
          price_text: nullable('number'),
          price_image: nullable('number'),
          price_note: nullable('string'),
          age: nullable('string'),
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          doubt: nullable('string'),
        },
        required: ['name', 'article', 'brand', 'price_text', 'price_image', 'price_note', 'age', 'confidence', 'doubt'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const

export const SYSTEM_PROMPT = `Ты читаешь посты оптовых поставщиков детских игрушек из Telegram (Казахстан, цены в тенге).
Пост — одна или несколько фотографий и, возможно, подпись. Выпиши каждый товар из поста.

Правила:
- article — артикул/модель ровно как напечатан на коробке или в тексте (буквы, цифры, дефисы). Не угадывай: если символ не читается, верни артикул с «?» на месте символа и confidence "low". Штрихкод — не артикул.
- price_text — цена из подписи, price_image — цена, напечатанная на самой картинке. Только число в тенге, без пробелов. Нет цены — null. Не переноси цену из одного поля в другое.
- price_note — уточнение к цене дословно: «опт», «от 3 шт», «за коробку 12 шт» и т. п.
- name — коротко, по-русски, что это за товар (тип + бренд/серия), как назвал бы продавец.
- age — возраст с коробки («3+»), если есть.
- confidence: high — всё прочитано чётко; medium — есть сомнение в одном поле; low — главное (артикул или цена) прочитано неуверенно. В doubt — что именно под сомнением.
- Несколько фото одного товара — один товар. Разные товары на одном фото — разные строки.
- Ничего не выдумывай: чего не видно, то null.`

const USER_TEXT = (caption: string | null) =>
  caption?.trim() ? `Подпись к посту:\n${caption.trim()}` : 'Подписи к посту нет — только фото.'

interface ProviderConfig {
  kind: 'anthropic' | 'openai-compatible'
  baseURL?: string
  keyEnv: string
}

/** Провайдер → откуда брать ключ и адрес. Добавить нового — одна строка. */
export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: { kind: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { kind: 'openai-compatible', baseURL: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY' },
  gemini: { kind: 'openai-compatible', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY' },
}

/** Модель по умолчанию — кандидат из проекта агента; меняется VISION_MODEL. */
export const DEFAULT_MODEL = 'anthropic/claude-haiku-5-5'

export function parseModelSpec(spec: string): { provider: string, model: string, config: ProviderConfig } {
  const slash = spec.indexOf('/')
  const provider = slash > 0 ? spec.slice(0, slash) : ''
  const model = spec.slice(slash + 1)
  const config = PROVIDERS[provider]
  if (!config || !model)
    throw new Error(`Модель «${spec}»: нужно «провайдер/модель», провайдеры: ${Object.keys(PROVIDERS).join(', ')}`)
  return { provider, model, config }
}

type Env = (name: string) => string | undefined

/**
 * Прочесть пост выбранной моделью. `env` — откуда брать ключи (в функции
 * Supabase это Deno.env.get, на стенде — тоже, но можно подменить).
 */
export async function readSupplierPost(post: SupplierPost, spec: string, env: Env): Promise<ReadResult> {
  if (!post.images.length)
    throw new Error('В посте нет фото')
  const { provider, model, config } = parseModelSpec(spec)
  const apiKey = env(config.keyEnv)
  if (!apiKey)
    throw new Error(`Нет ключа ${config.keyEnv} для «${provider}»`)
  // Адрес переопределяется только на локальную заглушку стенда: иначе одна
  // переменная окружения увела бы фото поставщиков на чужой сервер
  const override = env(`${provider.toUpperCase()}_BASE_URL`)
  if (override && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(override))
    throw new Error(`${provider.toUpperCase()}_BASE_URL — только локальная заглушка, не ${override}`)
  const baseURL = override || config.baseURL

  const started = Date.now()
  const out = config.kind === 'anthropic'
    ? await callAnthropic(post, model, apiKey, baseURL)
    : await callOpenAICompatible(post, model, apiKey, baseURL!)
  return { model: spec, ...out, items: parseItems(out.raw), ms: Date.now() - started }
}

/** Разбор и проверка ответа: структурированный вывод есть не у всех моделей. */
export function parseItems(raw: string): ReadItem[] {
  // Модели без строгой схемы иногда заворачивают JSON в ```json … ```
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  }
  catch {
    throw new Error(`Ответ модели — не JSON: ${raw.slice(0, 200)}`)
  }
  const items = (parsed as { items?: unknown })?.items
  if (!Array.isArray(items))
    throw new Error(`В ответе нет items: ${raw.slice(0, 200)}`)
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const num = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v))
      return v
    // «12 500 ₸» от моделей без схемы
    if (typeof v === 'string' && /\d/.test(v)) {
      const n = Number(v.replace(/[^\d.,]/g, '').replace(',', '.'))
      return Number.isFinite(n) && n > 0 ? n : null
    }
    return null
  }
  return items.map((it: Record<string, unknown>) => ({
    name: str(it.name) ?? 'без названия',
    article: str(it.article),
    brand: str(it.brand),
    price_text: num(it.price_text),
    price_image: num(it.price_image),
    price_note: str(it.price_note),
    age: str(it.age),
    confidence: (['high', 'medium', 'low'] as const).includes(it.confidence as 'high') ? it.confidence as ReadItem['confidence'] : 'low',
    doubt: str(it.doubt),
  }))
}

async function callAnthropic(post: SupplierPost, model: string, apiKey: string, baseURL?: string) {
  const client = new Anthropic({ apiKey, baseURL })
  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: READ_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        ...post.images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType as 'image/jpeg', data: img.data },
        })),
        { type: 'text' as const, text: USER_TEXT(post.caption) },
      ],
    }],
  })
  // Причина остановки — до чтения текста: отказ приходит с кодом 200
  if (response.stop_reason === 'refusal')
    throw new Error('Модель отказалась читать пост')
  if (response.stop_reason === 'max_tokens')
    throw new Error('Ответ не поместился в max_tokens')
  // Типы SDK с esm.sh в Deno приходят не всегда — форма блока описана явно
  const block = (response.content as { type: string, text?: string }[]).find(b => b.type === 'text')
  if (!block?.text)
    throw new Error('Пустой ответ модели')
  return { raw: block.text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
}

async function callOpenAICompatible(post: SupplierPost, model: string, apiKey: string, baseURL: string) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        ...post.images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
        { type: 'text', text: USER_TEXT(post.caption) },
      ],
    },
  ]
  const request = (responseFormat: unknown, extraSystem = '') => fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: extraSystem ? [{ role: 'system', content: SYSTEM_PROMPT + extraSystem }, messages[1]] : messages,
      response_format: responseFormat,
    }),
  })

  let res = await request({ type: 'json_schema', json_schema: { name: 'supplier_post', strict: true, schema: READ_SCHEMA } })
  // Строгую схему понимают не все: тогда просим просто JSON и даём схему текстом
  if (res.status === 400) {
    res = await request({ type: 'json_object' }, `\n\nОтветь только JSON по схеме:\n${JSON.stringify(READ_SCHEMA)}`)
  }
  if (!res.ok)
    throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  const choice = body.choices?.[0]
  if (choice?.finish_reason === 'length')
    throw new Error('Ответ не поместился в max_tokens')
  const raw = choice?.message?.content
  if (typeof raw !== 'string' || !raw.trim())
    throw new Error(`Пустой ответ модели: ${JSON.stringify(body).slice(0, 300)}`)
  return { raw, inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null }
}

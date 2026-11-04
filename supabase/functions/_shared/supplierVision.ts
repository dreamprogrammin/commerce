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

const CYRILLIC_TWINS = 'АВЕІКМНОРСТУХ'
const LATIN_TWINS = 'ABEIKMHOPCTYX'

/**
 * Артикул для сравнения: без регистра, пробелов, дефисов, точек и косых, а
 * кириллица, похожая на латиницу, — латиницей. Модель переписывает «Н08-13»
 * кириллицей с фото, где рядом напечатано «Арт.», — на глаз это «H08-13».
 * Цифра 0 и буква O не сводятся: их путают при чтении, это ошибка.
 */
export function normArticle(s: string | null): string {
  return [...(s ?? '').toUpperCase().replace(/[\s\-–._/]/g, '')]
    .map((ch) => {
      const i = CYRILLIC_TWINS.indexOf(ch)
      return i < 0 ? ch : LATIN_TWINS[i]
    })
    .join('')
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
- Артикул, подписанный продавцом («Арт.…»), главнее номера на самой коробке. Артикул через косую («Y347-9P/11P») — один артикул: перепиши целиком, одной строкой.
- price_text — цена из подписи, price_image — цена, напечатанная на самой картинке. Только число в тенге, без пробелов. Нет цены — null. Не переноси цену из одного поля в другое.
- Две цены — за штуку и за упаковку или коробку («1800тг/шт 10800тг/уп»): в цену — за штуку, цену за упаковку перепиши в price_note дословно.
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
  /**
   * Как у OpenAI-совместимого называется потолок ответа. У OpenAI `max_tokens`
   * устарел — заменён на `max_completion_tokens`, с моделями o-серии уже не
   * работает. Google в описании своего совместимого адреса (на 2.11.2026) не
   * называет ни один из двух — у него оставлен прежний `max_tokens`.
   */
  maxTokensParam?: 'max_tokens' | 'max_completion_tokens'
}

/** Провайдер → откуда брать ключ и адрес. Добавить нового — одна строка. */
export const PROVIDERS: Record<string, ProviderConfig> = {
  anthropic: { kind: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY' },
  openai: { kind: 'openai-compatible', baseURL: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', maxTokensParam: 'max_completion_tokens' },
  gemini: { kind: 'openai-compatible', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY', maxTokensParam: 'max_tokens' },
}

/**
 * Потолок ответа. У Claude и GPT в него входят и «размышления»: прежних
 * 4 000 могло не хватить — Sonnet 5.5 без явного уровня думает на high.
 * Платится только выданное, так что запас ничего не стоит; выше ~21 000 SDK
 * Anthropic без потоковой передачи запрос не пускает.
 */
export const MAX_OUTPUT_TOKENS = 16000

/**
 * Уровень рассуждений — явно низкий (2.11.2026). Прочесть артикул и цену —
 * не задача на долгие раздумья, а без явного уровня Claude 5.5 и GPT думают
 * на medium, Sonnet 5.5 — на high, Gemini — на своём по умолчанию: дольше и
 * дороже. В рейтинге чтения текста с фото (Roboflow, 26.10.2026) у четырёх
 * моделей, где есть оба замера, low уступает high 1,6–4,1 пункта и дешевле в
 * 1,4–4,3 раза. `low` есть у всех трёх провайдеров.
 */
export const EFFORT = 'low'

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
    : await callOpenAICompatible(post, model, apiKey, baseURL!, config.maxTokensParam ?? 'max_tokens')
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

/**
 * Принимает ли модель Anthropic уровень усилия: у Claude Haiku 4.5 и
 * Sonnet 4.5 его нет, запрос с ним — 400. Спрашиваем Models API (так же
 * админка узнаёт, понимает ли модель картинки) — раз на модель за запуск.
 */
const effortSupport = new Map<string, Promise<boolean>>()

function supportsEffort(client: Anthropic, model: string): Promise<boolean> {
  const key = `${client.baseURL} ${model}`
  const known = effortSupport.get(key)
  if (known)
    return known
  const asked: Promise<boolean> = client.models.retrieve(model)
    // Типы SDK с esm.sh приходят не всегда — форма описана явно
    .then((m: unknown) => (m as { capabilities?: { effort?: { low?: { supported?: boolean } } } | null }).capabilities?.effort?.low?.supported === true)
    .catch(() => {
      // Сбой справки не запоминаем; этот пост — на уровне модели по умолчанию
      effortSupport.delete(key)
      return false
    })
  effortSupport.set(key, asked)
  return asked
}

async function callAnthropic(post: SupplierPost, model: string, apiKey: string, baseURL?: string) {
  const client = new Anthropic({ apiKey, baseURL })
  const effort = await supportsEffort(client, model)
  const response = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: READ_SCHEMA }, ...(effort ? { effort: EFFORT } : {}) },
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
    throw new Error(`Ответ не поместился в ${MAX_OUTPUT_TOKENS} токенов`)
  // Типы SDK с esm.sh в Deno приходят не всегда — форма блока описана явно
  const block = (response.content as { type: string, text?: string }[]).find(b => b.type === 'text')
  if (!block?.text)
    throw new Error('Пустой ответ модели')
  return { raw: block.text, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
}

async function callOpenAICompatible(post: SupplierPost, model: string, apiKey: string, baseURL: string, maxTokensParam: 'max_tokens' | 'max_completion_tokens') {
  const user = {
    role: 'user',
    content: [
      ...post.images.map(img => ({ type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}` } })),
      { type: 'text', text: USER_TEXT(post.caption) },
    ],
  }
  // Что снимается, если модель ответила 400. Строгую схему понимают не все —
  // тогда просим просто JSON и даём схему текстом; уровня рассуждений нет у
  // моделей без рассуждений, вроде gpt-4.1
  let strict = true
  let effort = true
  const request = () => fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      [maxTokensParam]: MAX_OUTPUT_TOKENS,
      ...(effort ? { reasoning_effort: EFFORT } : {}),
      messages: [
        { role: 'system', content: strict ? SYSTEM_PROMPT : `${SYSTEM_PROMPT}\n\nОтветь только JSON по схеме:\n${JSON.stringify(READ_SCHEMA)}` },
        user,
      ],
      response_format: strict
        ? { type: 'json_schema', json_schema: { name: 'supplier_post', strict: true, schema: READ_SCHEMA } }
        : { type: 'json_object' },
    }),
  })

  let res = await request()
  while (res.status === 400 && (strict || effort)) {
    // Отвергнутый параметр OpenAI называет в error.param; у Google его там
    // нет — тогда сначала схема, потом уровень рассуждений
    const param = await res.json().then((b: { error?: { param?: string } }) => b?.error?.param, () => undefined)
    if (param === 'reasoning_effort' || !strict)
      effort = false
    else
      strict = false
    res = await request()
  }
  if (!res.ok)
    throw new Error(`${model}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  const choice = body.choices?.[0]
  if (choice?.finish_reason === 'length')
    throw new Error(`Ответ не поместился в ${MAX_OUTPUT_TOKENS} токенов`)
  const raw = choice?.message?.content
  if (typeof raw !== 'string' || !raw.trim())
    throw new Error(`Пустой ответ модели: ${JSON.stringify(body).slice(0, 300)}`)
  return { raw, inputTokens: body.usage?.prompt_tokens ?? null, outputTokens: body.usage?.completion_tokens ?? null }
}

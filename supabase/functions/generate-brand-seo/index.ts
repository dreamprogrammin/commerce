/**
 * Генератор SEO-полей страницы бренда.
 *
 * Зачем. В таблице `brands` под SEO отведено больше двадцати колонок, но
 * `meta_title` и `seo_h1` пусты у ВСЕХ 32 брендов: заполнять их было нечем,
 * пока поля не появились в админке (2 сентября 2026). Заполнять руками —
 * 32 захода, и по Search Console это самый дорогой тип страниц на сайте:
 * 20 кликов из 70 при 1550 показах.
 *
 * Функция НИЧЕГО НЕ ПИШЕТ В БАЗУ. Она собирает факты, просит модель написать
 * тексты и возвращает их админке — та подставляет их в форму, человек правит
 * и сохраняет обычным «Сохранить». Так решение остаётся за человеком, а у
 * функции нет права записи, которое можно было бы использовать чужими руками.
 *
 * Устройство повторяет `generate-premium-questions` (тот же ключ, тот же
 * рантайм), но отличается тремя вещами:
 *
 *  1. проверяет, что зовущий — администратор. У соседней функции такой
 *     проверки нет: ей хватает JWT любого зарегистрированного пользователя,
 *     а пишет она сервисным ключом;
 *  2. просит структурированный ответ (`output_config.format`), а не «ответь
 *     строго JSON» словами в промпте — разбор чужого текста рано или поздно
 *     ломается;
 *  3. пишет тексты для НЕСКОЛЬКИХ брендов одним запросом. Это не экономия, а
 *     единственный способ получить непохожие тексты: когда модель видит
 *     соседей, она их разводит. Поштучная генерация в этом проекте уже дала
 *     пару текстов с 89 % совпадения (category_brand_seo).
 */

import type { GeneratedBrandSeo } from './validate.ts'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { checkLengths, sanitizeBrandHtml } from './validate.ts'

/** За раз — не больше, чем успевает один запрос до таймаута функции. */
const MAX_BRANDS_PER_CALL = 4

/*
 * Модель — решение владельца от 2 сентября 2026: начинаем с самой дешёвой.
 *
 * Haiku 4.5 против Opus 5 — примерно впятеро дешевле ($1/$5 против $5/$25 за
 * миллион токенов), то есть чуть больше цента за бренд. Структурированный
 * вывод она поддерживает, а размышления мы и не включаем.
 *
 * Если тексты окажутся слабыми, менять здесь одну строку: `claude-opus-5`
 * или `claude-sonnet-5`. Идентификаторы пишутся БЕЗ хвоста с датой — в
 * соседней `generate-premium-questions` стоит устаревший
 * `claude-3-5-haiku-20241022`, повторять это не надо.
 */
const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 8000

/** Сколько названий товаров показываем модели как образец ассортимента. */
const SAMPLE_PRODUCTS = 8

/**
 * Факты о магазине. Модель НЕ ИМЕЕТ ПРАВА придумывать условия сама, поэтому
 * всё, что можно обещать покупателю, перечислено здесь явным списком.
 *
 * Значения обязаны совпадать с `constants/index.ts` (FREE_SHIPPING_THRESHOLD)
 * и с текстами на сайте. Меняете там — поменяйте здесь.
 */
const SHOP_FACTS = [
  'Магазин «Ухтышка», сайт uhti.kz, собственный склад в Алматы (мкр. Шапагат).',
  'Доставка по Алматы за 1 день при заказе до 18:00, бесплатно от 15 000 ₸.',
  'Доставка по Казахстану — почтой и курьерскими службами.',
  'Самовывоз со склада в Алматы.',
  'За покупку начисляются бонусы, ими можно оплатить часть следующего заказа.',
].join('\n')

interface BrandFacts {
  id: string
  name: string
  slug: string
  has_description: boolean
  products_count: number
  min_price: number | null
  max_price: number | null
  top_categories: string[]
  product_lines: string[]
  sample_products: string[]
  reviews_count: number
  rating: number | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Схема ответа. `additionalProperties: false` и полный `required` обязательны:
 * без них структурированный вывод не гарантирует форму.
 */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    brands: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          brand_id: { type: 'string' },
          meta_title: { type: 'string' },
          seo_h1: { type: 'string' },
          seo_description: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['brand_id', 'meta_title', 'seo_h1', 'seo_description', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['brands'],
  additionalProperties: false,
}

const SYSTEM_PROMPT = `Ты пишешь SEO-тексты для интернет-магазина детских игрушек «Ухтышка» (uhti.kz, Алматы, Казахстан). Пишешь по-русски, для родителей, которые ищут игрушки в поиске.

ГЛАВНОЕ ПРАВИЛО: никаких выдуманных фактов. Разрешено опираться только на данные о бренде, которые тебе дали, и на список фактов о магазине. Если год основания, страна бренда, награды, сертификаты или гарантии не указаны — не пиши о них вовсе. Лучше короче, чем правдоподобно и неверно.

ЗАПРЕЩЕНО: эмодзи и символы-украшения; слова «официальный дилер», «эксклюзивный представитель», «гарантия производителя», если этого нет в данных; ЗАГЛАВНЫЕ слова целиком; восклицательные знаки чаще одного на текст; вода вроде «широкий ассортимент качественных товаров».

ФАКТЫ О МАГАЗИНЕ (можно использовать все):
${SHOP_FACTS}

ЧТО НУЖНО ДЛЯ КАЖДОГО БРЕНДА:

1. meta_title — строка для выдачи Google. СТРОГО не длиннее 60 знаков вместе с хвостом " | Ухтышка", который обязателен. Обязана содержать название бренда и то, ЧТО это за товар (не просто «LEGO», а «Конструкторы LEGO»). Если помещается — добавь «купить в Алматы» или «в Алматы». Без кавычек вокруг названия бренда.

2. seo_h1 — заголовок на самой странице. Два-четыре слова: тип товара плюс бренд («Конструкторы LEGO», «Куклы Defa Lucy»). Без «купить», без города, без цен.

3. seo_description — описание для выдачи Google, 120–160 знаков. Вперёд выноси то, ради чего кликают: что за товар, сколько моделей, от какой цены. Дальше — доставка или самовывоз. Числа бери только из данных.

4. description — большой текст «О бренде» для самой страницы. Пиши его ТОЛЬКО если в данных стоит has_description: false. Если стоит true — верни пустую строку "".
   Формат — HTML ровно в таком виде, как на других страницах магазина:
   <h2 data-icon="fluent-emoji-flat:ИКОНКА">Заголовок про бренд</h2>
   <p>Абзац 400–700 знаков: что это за бренд, что выпускает, для какого возраста, чем интересен ребёнку.</p>
   <ul>
   <li data-icon="fluent-emoji-flat:ИКОНКА">Пункт про ассортимент</li>
   <li data-icon="fluent-emoji-flat:ИКОНКА">Пункт про то, кому подойдёт</li>
   <li data-icon="fluent-emoji-flat:ИКОНКА">Пункт про покупку в Ухтышке</li>
   </ul>
   Вместо ИКОНКА подставляй существующие имена из набора fluent-emoji-flat, подходящие по смыслу: racing-car, teddy-bear, puzzle-piece, rocket, house, sparkles, wrapped-gift, robot, artist-palette, soccer-ball.

БРЕНД БЕЗ ТОВАРОВ: если products_count равен нулю, ты НЕ ЗНАЕШЬ, что этот бренд выпускает — в данных этого нет. Не придумывай тип товара и не пиши «конструкторы», «куклы» и подобное наугад. Пиши общо: «Игрушки <бренд>», и не упоминай ни количество, ни цены.

РАЗНООБРАЗИЕ: если брендов несколько, тексты не должны быть под копирку. Меняй порядок фактов и первые слова: одинаковые зачины у соседних брендов — брак.

Ответ верни строго по заданной схеме, по одному объекту на каждый переданный бренд, с тем же brand_id.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    /*
     * Проверка прав. Функция стоит денег на каждый вызов, поэтому дальше
     * пускаем только администратора: JWT подтверждает, что это вообще
     * пользователь, а роль читаем сервисным ключом — под RLS профиль чужой
     * роли не виден, и проверка молча превратилась бы в «нет профиля».
     */
    const authHeader = req.headers.get('Authorization')
    if (!authHeader)
      return json({ error: 'Нужна авторизация' }, 401)

    /*
     * Токен передаём в `getUser` ЯВНО, а не заголовком клиента.
     * `auth.getUser()` без аргумента ищет сессию в хранилище, которого в
     * функции нет, и отвечает «Auth session missing» — проверено локально:
     * администратор с настоящим токеном получал 401.
     */
    const accessToken = authHeader.replace(/^Bearer\s+/i, '')
    const asUser = createClient(supabaseUrl, anonKey)
    const { data: { user }, error: userError } = await asUser.auth.getUser(accessToken)
    if (userError || !user) {
      // Причину пишем в лог: снаружи она выглядит одинаково («не опознали»),
      // а внутри это либо просроченный токен, либо неверный адрес auth.
      console.error('getUser:', userError?.message ?? 'пользователь не найден')
      return json({ error: 'Не удалось опознать пользователя' }, 401)
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'admin')
      return json({ error: 'Доступно только администратору' }, 403)

    const body = await req.json().catch(() => ({}))
    const brandIds: string[] = Array.isArray(body?.brand_ids) ? body.brand_ids : []

    if (brandIds.length === 0)
      return json({ error: 'Не переданы бренды (brand_ids)' }, 400)

    if (brandIds.length > MAX_BRANDS_PER_CALL)
      return json({ error: `За один раз не больше ${MAX_BRANDS_PER_CALL} брендов` }, 400)

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY не задан в секретах проекта')
      return json({ error: 'Генерация не настроена: нет ANTHROPIC_API_KEY' }, 500)
    }

    const facts = await collectFacts(admin, brandIds)
    if (facts.length === 0)
      return json({ error: 'Бренды не найдены' }, 404)

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
      /*
       * Адрес API переопределяется переменной окружения — это нужно, чтобы
       * прогонять функцию локально против заглушки, не тратя обращения к
       * настоящей модели. В проде переменная не задана, и клиент идёт на
       * api.anthropic.com.
       */
      baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
    })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
      messages: [{
        role: 'user',
        // Пустые поля выбрасываем: `"min_price": null` модель однажды
        // перепишет в «от null ₸», а отсутствующего поля просто не будет.
        content: `Данные о брендах:\n\n${JSON.stringify(facts.map(dropEmpty), null, 2)}`,
      }],
    })

    /*
     * Причину остановки проверяем ДО чтения текста.
     *
     * `refusal` — отказ по правилам безопасности: приходит с кодом 200, и без
     * этой ветки он выглядел бы как «пустой ответ». `max_tokens` — обрыв на
     * середине JSON: разбор упадёт, и сообщение «неразбираемый ответ» увело
     * бы в сторону, хотя лечится оно уменьшением числа брендов в запросе.
     */
    if (response.stop_reason === 'refusal') {
      console.error('Модель отказалась писать:', JSON.stringify(response.stop_details))
      return json({ error: 'Модель отказалась писать этот текст' }, 502)
    }

    if (response.stop_reason === 'max_tokens') {
      console.error('Ответ не поместился в max_tokens')
      return json({ error: 'Ответ не поместился — попробуйте меньше брендов за раз' }, 502)
    }

    // Структурированный вывод гарантирует форму, но не гарантирует, что
    // ответ вообще пришёл: пустой content — это сбой, а не пустые тексты.
    const textBlock = response.content.find(block => block.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.error('Пустой ответ модели', JSON.stringify(response.content).slice(0, 500))
      return json({ error: 'Модель вернула пустой ответ' }, 502)
    }

    let generated: GeneratedBrandSeo[]
    try {
      generated = JSON.parse(textBlock.text).brands ?? []
    }
    catch (parseError) {
      console.error('Не разобрать ответ модели:', textBlock.text.slice(0, 500), parseError)
      return json({ error: 'Модель вернула неразбираемый ответ' }, 502)
    }

    const byId = new Map(facts.map(f => [f.id, f]))
    const items = generated
      .filter(item => byId.has(item.brand_id))
      .map((item) => {
        const brand = byId.get(item.brand_id)!
        // Текст «О бренде» отдаём только тем, у кого его нет: у остальных он
        // написан руками, и подменять его сгенерированным нельзя.
        const rawDescription = brand.has_description ? '' : item.description
        const description = sanitizeBrandHtml(rawDescription)

        const noProducts = brand.products_count === 0
          ? ['У бренда нет активных товаров: модель не знает, что он выпускает — проверьте текст особенно внимательно']
          : []

        return {
          ...item,
          brand_slug: brand.slug,
          brand_name: brand.name,
          description: description.html,
          warnings: [...noProducts, ...checkLengths(item), ...description.warnings],
        }
      })

    return json({
      brands: items,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        model: response.model,
      },
    })
  }
  catch (err) {
    console.error('generate-brand-seo:', err)
    return json({ error: String(err) }, 500)
  }
})

/**
 * Убирает пустые поля перед отправкой модели: пустой массив и `null` — это
 * не факт, а его отсутствие, и в промпте им делать нечего.
 */
function dropEmpty(facts: BrandFacts): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(facts).filter(([, value]) => {
      if (value === null || value === undefined)
        return false
      if (Array.isArray(value))
        return value.length > 0
      return true
    }),
  )
}

/** Собирает по брендам всё, на что модели разрешено опираться. */
async function collectFacts(
  admin: ReturnType<typeof createClient>,
  brandIds: string[],
): Promise<BrandFacts[]> {
  const [brandsRes, productsRes, categoriesRes, linesRes] = await Promise.all([
    admin.from('brands').select('id, name, slug, description').in('id', brandIds),
    admin
      .from('products')
      .select('name, price, final_price, category_id, brand_id, avg_rating, review_count')
      .in('brand_id', brandIds)
      .eq('is_active', true),
    admin.from('categories').select('id, name'),
    admin.from('product_lines').select('name, brand_id').in('brand_id', brandIds),
  ])

  const categoryName = new Map(
    (categoriesRes.data ?? []).map((c: any) => [c.id, c.name as string]),
  )

  return (brandsRes.data ?? []).map((brand: any) => {
    const products = (productsRes.data ?? []).filter((p: any) => p.brand_id === brand.id)
    const prices = products
      .map((p: any) => Number(p.final_price ?? p.price))
      .filter((n: number) => Number.isFinite(n) && n > 0)

    const perCategory = new Map<string, number>()
    for (const p of products) {
      const name = categoryName.get(p.category_id)
      if (name)
        perCategory.set(name, (perCategory.get(name) ?? 0) + 1)
    }

    const reviews = products.reduce((sum: number, p: any) => sum + Number(p.review_count ?? 0), 0)
    const weighted = products.reduce(
      (sum: number, p: any) => sum + Number(p.avg_rating ?? 0) * Number(p.review_count ?? 0),
      0,
    )

    return {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      has_description: !!(brand.description ?? '').trim(),
      products_count: products.length,
      min_price: prices.length ? Math.min(...prices) : null,
      max_price: prices.length ? Math.max(...prices) : null,
      top_categories: [...perCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name),
      product_lines: (linesRes.data ?? [])
        .filter((l: any) => l.brand_id === brand.id)
        .map((l: any) => l.name as string),
      sample_products: products.slice(0, SAMPLE_PRODUCTS).map((p: any) => p.name as string),
      reviews_count: reviews,
      rating: reviews > 0 ? Math.round((weighted / reviews) * 10) / 10 : null,
    }
  })
}

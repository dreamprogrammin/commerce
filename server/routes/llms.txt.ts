import type { Database } from '@/types'
import type { CategoryFactRow, NounForms } from '~/utils/categoryFacts'
import { serverSupabaseClient } from '#supabase/server'
import { COURIER_DELIVERY_COST, FREE_SHIPPING_THRESHOLD } from '~/constants'
import { SHOP, SHOP_ADDRESS_FULL } from '~/constants/shop'
import { categoryFactsFromRows, composeCategoryFactsParagraph, countPhrase, priceRangePhrase, sinceAge } from '~/utils/categoryFacts'
import { formatPrice } from '~/utils/formatPrice'

/**
 * `/llms.txt` — краткая карта сайта для языковых моделей.
 *
 * Зачем. Ответ ИИ-поисковика собирается не из всей страницы, а из коротких
 * фрагментов, которые он смог достать и понять. Наши разделы и бренды
 * разложены по клиентской навигации и фильтрам, и модели приходится
 * догадываться, что у магазина вообще есть. Этот файл называет разделы,
 * бренды и число живых товаров в каждом прямым текстом со ссылками.
 *
 * Google файл игнорирует (официальной поддержки нет), поэтому на обычную
 * выдачу он не влияет и заменой карты сайта не является.
 *
 * Цифры берутся из базы, а не пишутся руками: файл, разошедшийся с
 * каталогом, хуже отсутствующего — модель процитирует устаревшее число.
 *
 * Короткий блок условий здесь всё-таки есть: без него модель, прочитавшая
 * файл, не сможет ответить на «сколько идёт доставка» и пойдёт искать ответ
 * у конкурента. Формулировки взяты ДОСЛОВНО из опубликованных `/terms` и
 * `/returns` и продублированы ссылками на них же — если условия поменяются,
 * расхождение будет видно сразу.
 *
 * Аудит 24 сентября 2026: файл не знал о самовывозе (42 заказа из 45),
 * писал «стоимость зависит от адреса» при фиксированной цене курьера по
 * Алматы и вёл на закрытые от индекса страницы — `/catalog/all`,
 * `/catalog/new` и разделы без товаров. Адрес, часы и цены теперь из тех же
 * констант, что «Условия» и корзина; разделы — только с товарами.
 *
 * С 25 сентября (план аудита, п. 18) — блоки «Радиоуправляемые машинки» и
 * «Серии LEGO»: владелец двигает их в топ, а модели здесь нечего было
 * процитировать, кроме имени раздела. Цифры собирают те же функции, что абзац
 * на странице раздела (`utils/categoryFacts.ts`), — файл и страница говорят
 * одно и то же. Пустые серии (Friends, Technic, Ninjago) не называются: их
 * страницы закрыты `noindex`.
 *
 * ИМЯ ФАЙЛА БЕЗ `.get` — НАМЕРЕННО. С суффиксом Nitro регистрирует маршрут
 * только на GET, и на бою `HEAD /llms.txt` отдавал 404 при живом `GET` (200).
 * Краулер, который сперва пробует HEAD, — а так делают и обходчики ИИ, и
 * проверяльщики ссылок — решал, что файла нет. У `/robots.txt` HEAD отвечает
 * 200, ломался только этот файл. Найдено аудитом 15 сентября 2026.
 */

const SITE_URL = 'https://uhti.kz'

/** Сколько брендов перечислять: дальше идут бренды с одним-двумя товарами. */
const BRANDS_LIMIT = 20

/** Разделы блока «Радиоуправляемые машинки»: машинки и летающие модели, переехавшие от них 24 сентября. */
const RC_SLUGS = ['radioupravlyaemye-mashinki', 'letayushchie-igrushki']
const SETS: NounForms = ['набор', 'набора', 'наборов']

export default defineEventHandler(async (event): Promise<string> => {
  const client = await serverSupabaseClient<Database>(event)

  const [categoriesResult, brandsResult, productsResult, linesResult] = await Promise.all([
    client
      .from('categories')
      .select('id, name, slug, href, parent_id, seo_h1')
      .order('name'),
    client
      .from('brands')
      .select('id, name, slug, products(count)')
      .eq('products.is_active', true)
      .limit(200),
    client
      .from('products')
      .select('category_id, product_line_id, brand_id, price, final_price, stock_quantity, min_age_months')
      .eq('is_active', true),
    client
      .from('product_lines')
      .select('id, name, slug, brand_id'),
  ])

  // Раздел без товаров закрыт `noindex` — считаем товары по всей ветке
  const categories = categoriesResult.data ?? []
  const activeIn = new Map<string, number>()
  for (const p of productsResult.data ?? []) {
    if (p.category_id)
      activeIn.set(p.category_id, (activeIn.get(p.category_id) ?? 0) + 1)
  }
  const branchCount = (id: string): number =>
    (activeIn.get(id) ?? 0) + categories.filter(c => c.parent_id === id).reduce((sum, c) => sum + branchCount(c.id), 0)
  const roots = categories.filter(c => c.parent_id === null && branchCount(c.id) > 0)

  const products = productsResult.data ?? []
  const branchIds = (id: string): string[] =>
    [id, ...categories.filter(c => c.parent_id === id).flatMap(c => branchIds(c.id))]

  // Раздел строкой с цифрами — те же, что в абзаце на его странице
  const rcLines = RC_SLUGS.flatMap((slug) => {
    const category = categories.find(c => c.slug === slug)
    if (!category)
      return []
    const ids = new Set(branchIds(category.id))
    const rows: CategoryFactRow[] = products.filter(p => p.category_id && ids.has(p.category_id))
    const paragraph = composeCategoryFactsParagraph(categoryFactsFromRows(rows))
    // Пустой раздел закрыт `noindex` — называть его модели незачем
    return paragraph
      ? [`- [${category.seo_h1 || category.name}](${SITE_URL}${category.href || `/catalog/${category.slug}`}). ${paragraph}`]
      : []
  })

  // Серии LEGO — только с товарами, по числу наборов
  const lego = (brandsResult.data ?? []).find(b => b.slug === 'lego')
  const legoLines = (linesResult.data ?? [])
    .filter(line => lego && line.brand_id === lego.id && line.slug)
    .map(line => ({ line, facts: categoryFactsFromRows(products.filter(p => p.product_line_id === line.id)) }))
    .filter(({ facts }) => facts.count > 0)
    .sort((a, b) => b.facts.count - a.facts.count || a.line.name.localeCompare(b.line.name, 'ru'))
    .map(({ line, facts }) => {
      const range = priceRangePhrase(facts)
      const youngest = facts.ageGroups[0]
      return `- [${line.name}](${SITE_URL}/brand/lego/${line.slug}) — ${countPhrase(facts.count, SETS)}${range ? ` ${range}` : ''}${youngest ? `, ${sinceAge(youngest[0])}` : ''}`
    })

  const brands = (brandsResult.data ?? [])
    .map(brand => ({
      name: brand.name,
      slug: brand.slug,
      count: (brand as any).products?.[0]?.count ?? 0,
    }))
    // Бренд без товаров закрыт `noindex` — называть его модели незачем.
    .filter(brand => brand.slug && brand.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'))
    .slice(0, BRANDS_LIMIT)

  const lines = [
    '# Ухтышка',
    '',
    '> Интернет-магазин детских игрушек в Алматы: конструкторы, куклы, машинки,',
    '> развивающие игрушки. Доставка по Казахстану, бонусная программа',
    '> (1 бонус = 1 ₸).',
    '',
    `Сайт: ${SITE_URL}`,
    'Город: Алматы, Казахстан',
    'Язык: русский',
    '',
    '## Разделы каталога',
    '',
    ...roots.map(
      category => `- [${category.name}](${SITE_URL}${category.href || `/catalog/${category.slug}`})`,
    ),
    '',
    ...(rcLines.length ? ['## Радиоуправляемые машинки', '', ...rcLines, ''] : []),
    ...(legoLines.length ? ['## Серии LEGO', '', ...legoLines, ''] : []),
    '## Бренды',
    '',
    ...brands.map(
      brand => `- [${brand.name}](${SITE_URL}/brand/${brand.slug}) — товаров в наличии: ${brand.count}`,
    ),
    '',
    '## Условия',
    '',
    '- Доставка: отправка из Алматы. По городу 1–3 рабочих дня, по остальным',
    '  городам Казахстана 3–7 рабочих дней. Курьер по Алматы',
    `  ${formatPrice(COURIER_DELIVERY_COST)} ₸, от ${formatPrice(FREE_SHIPPING_THRESHOLD)} ₸ — бесплатно; в другие города — по адресу.`,
    `- Самовывоз в Алматы: бесплатно, ${SHOP_ADDRESS_FULL}, ${SHOP.openingHoursHuman}.`,
    '- Оплата: наличными при получении либо переводом или по QR через Kaspi.',
    '- Возврат и обмен: 14 календарных дней при сохранённых упаковке и',
    '  товарном виде; при заводском браке доставка за счёт магазина.',
    '- Бонусы: 1 бонус = 1 ₸ при оплате следующего заказа, активируются через',
    '  14 дней после получения заказа.',
    '- Цены в тенге (₸), актуальные значения — в карточках товаров на сайте.',
    '',
    '## Контакты',
    '',
    `- Адрес (склад и самовывоз): ${SHOP_ADDRESS_FULL}, ${SHOP.openingHoursHuman}`,
    '- Телефон и WhatsApp: +7 702 537 94 73',
    '- Telegram: https://t.me/uhtikz',
    '- Почта: info@uhti.kz',
    '',
    '## Полезные страницы',
    '',
    `- [Каталог](${SITE_URL}/catalog)`,
    `- [Акции](${SITE_URL}/catalog/promotions)`,
    `- [Все бренды](${SITE_URL}/brands)`,
    `- [О магазине](${SITE_URL}/about)`,
    `- [Условия использования](${SITE_URL}/terms)`,
    `- [Возврат товара](${SITE_URL}/returns)`,
    `- [Карта сайта](${SITE_URL}/sitemap.xml)`,
    '',
  ]

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  // Час в кеше: файл меняется вместе с каталогом, а не с каждым запросом.
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600')

  return lines.join('\n')
})

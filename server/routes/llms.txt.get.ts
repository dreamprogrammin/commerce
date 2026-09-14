import type { Database } from '@/types'
import { serverSupabaseClient } from '#supabase/server'

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
 */

const SITE_URL = 'https://uhti.kz'

/** Сколько брендов перечислять: дальше идут бренды с одним-двумя товарами. */
const BRANDS_LIMIT = 20

export default defineEventHandler(async (event): Promise<string> => {
  const client = await serverSupabaseClient<Database>(event)

  const [categoriesResult, brandsResult] = await Promise.all([
    client
      .from('categories')
      .select('id, name, slug, href, parent_id')
      .is('parent_id', null)
      .order('name'),
    client
      .from('brands')
      .select('name, slug, products(count)')
      .eq('products.is_active', true)
      .limit(200),
  ])

  const roots = categoriesResult.data ?? []

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
    '## Бренды',
    '',
    ...brands.map(
      brand => `- [${brand.name}](${SITE_URL}/brand/${brand.slug}) — товаров в наличии: ${brand.count}`,
    ),
    '',
    '## Условия',
    '',
    '- Доставка: отправка из Алматы. По городу 1–3 рабочих дня, по остальным',
    '  городам Казахстана 3–7 рабочих дней. Стоимость зависит от адреса.',
    '- Оплата: наличными при получении, картой при получении, онлайн-оплата.',
    '- Возврат и обмен: 14 календарных дней при сохранённых упаковке и',
    '  товарном виде; при заводском браке доставка за счёт магазина.',
    '- Бонусы: 1 бонус = 1 ₸ при оплате следующего заказа, активируются через',
    '  14 дней после получения заказа.',
    '- Цены в тенге (₸), актуальные значения — в карточках товаров на сайте.',
    '',
    '## Контакты',
    '',
    '- Телефон и WhatsApp: +7 702 537 94 73',
    '- Telegram: https://t.me/uhtikz',
    '- Почта: info@uhti.kz',
    '',
    '## Полезные страницы',
    '',
    `- [Весь каталог](${SITE_URL}/catalog/all)`,
    `- [Новинки](${SITE_URL}/catalog/new)`,
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

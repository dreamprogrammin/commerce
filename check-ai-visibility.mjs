/*
 * Видимость для ИИ-поисковиков: доступ краулерам, факты в машиночитаемом
 * виде, сущность магазина в разметке.
 *
 * Зачем. Ответ ChatGPT, Perplexity или Google AI собирается из страниц,
 * которые их краулер смог забрать и понять. Проверяем ровно это, а не
 * догадки: отвечает ли сайт их агентам, лежит ли текст в СЕРВЕРНОЙ разметке
 * (JS они не ждут), названы ли они в robots.txt, есть ли короткий свод
 * условий в `/llms.txt` и опознаётся ли магазин как сущность.
 *
 *   node check-ai-visibility.mjs --base=http://localhost:3008
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3008'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const AGENTS = [
  'GPTBot/1.2',
  'OAI-SearchBot/1.0',
  'ChatGPT-User/1.0',
  'PerplexityBot/1.0',
  'ClaudeBot/1.0',
  'Google-Extended',
  'Bingbot/2.0',
]

// ---------- 1. Краулеры получают готовую страницу ----------
console.log('\n1) доступ краулерам ИИ')
for (const ua of AGENTS) {
  const response = await fetch(`${BASE}/brand/lego`, { headers: { 'user-agent': ua } })
  const html = await response.text()
  const hasText = html.includes('Конструкторы LEGO в Алматы')
  const hasFaq = html.includes('Где купить оригинальный LEGO в Алматы')
  check(
    response.status === 200 && hasText && hasFaq,
    `${ua}: ${response.status}, текст ${hasText ? 'на месте' : 'ОТСУТСТВУЕТ'}, вопросы ${hasFaq ? 'на месте' : 'ОТСУТСТВУЮТ'}`,
  )
}

// ---------- 2. robots.txt называет их поимённо ----------
{
  console.log('\n2) robots.txt')
  const robots = await (await fetch(`${BASE}/robots.txt`)).text()
  const named = ['GPTBot', 'OAI-SearchBot', 'PerplexityBot', 'ClaudeBot', 'Google-Extended']
  const missing = named.filter(ua => !new RegExp(`User-agent:\\s*${ua}\\b`, 'i').test(robots))
  check(missing.length === 0, missing.length === 0
    ? `названы поимённо: ${named.join(', ')}`
    : `не названы: ${missing.join(', ')}`)
  check(!/User-agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/m.test(robots), 'общего запрета `Disallow: /` нет')

  /*
   * Файлы сборки (/_nuxt) открыты для Google. До 30 сентября 2026 в robots.txt
   * стоял `Disallow: /_nuxt` — он длиннее `Allow: /`, и Google выбирает самое
   * длинное совпадение: весь JS и CSS сайта был закрыт, страницу нельзя было
   * отрисовать так, как её видит покупатель. Проверяется настоящий файл с
   * главной по правилам группы `*`.
   */
  const home = await (await fetch(`${BASE}/`)).text()
  const asset = home.match(/(?:href|src)="(\/_nuxt\/[^"]+\.(?:css|js))"/)?.[1]
  const star = robots.split(/\n(?=User-agent:)/i).find(g => /^User-agent:\s*\*\s*$/im.test(g)) ?? ''
  const rules = [...star.matchAll(/^(Allow|Disallow):\s*(\S+)/gim)].map(m => ({ allow: /^allow$/i.test(m[1]), path: m[2] }))
  const matches = path => rules.filter(r => new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}`).test(path))
  const winner = asset ? matches(asset).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow))[0] : null
  check(!!asset && (!winner || winner.allow), asset
    ? `файл сборки ${asset} для Google ${!winner || winner.allow ? 'открыт' : `ЗАКРЫТ правилом Disallow: ${winner.path}`}`
    : 'на главной не нашлось файла /_nuxt — проверить нечего')

  // Сайт на одном языке: hreflang на казахскую версию, которой нет, — неверный сигнал.
  const hreflangs = [...home.matchAll(/hreflang="([^"]+)"/g)].map(m => m[1])
  check(!hreflangs.includes('kk'), hreflangs.length ? `hreflang на главной: ${hreflangs.join(', ')}` : 'hreflang нет — сайт на одном языке')

  const header = (await fetch(`${BASE}/brand/lego`)).headers.get('x-robots-tag') ?? ''
  check(/index/.test(header) && !/noindex/.test(header), `заголовок страницы: ${header || 'нет'}`)
}

// ---------- 3. llms.txt со сводом условий ----------
{
  console.log('\n3) llms.txt')
  /*
   * HEAD проверяется отдельно и первым. На бою 15 сентября 2026 `GET`
   * отдавал 200, а `HEAD` — 404: имя маршрута с суффиксом `.get`
   * регистрирует в Nitro только GET. Краулер, который сперва пробует HEAD,
   * решал, что файла нет, и содержимое ниже уже не имело значения.
   */
  const head = await fetch(`${BASE}/llms.txt`, { method: 'HEAD' })
  check(head.status === 200, `HEAD /llms.txt отвечает 200 (${head.status})`)
  const file = await (await fetch(`${BASE}/llms.txt`)).text()
  check(file.includes('## Условия'), 'есть свод условий')
  check(/Доставка:/.test(file) && /рабочих дня/.test(file), 'назван срок доставки')
  check(/Оплата:/.test(file), 'названы способы оплаты')
  check(/Возврат и обмен:/.test(file), 'названы условия возврата')
  check(/1 бонус = 1/.test(file), 'названа бонусная программа')
  check(/## Контакты/.test(file) && /\+7 702 537 94 73/.test(file), 'есть контакты')
  check(/\/brand\/lego\)/.test(file), 'страница LEGO перечислена среди брендов')
}

// ---------- 4. Магазин как сущность ----------
{
  console.log('\n4) разметка магазина')
  const html = await (await fetch(`${BASE}/brand/lego`)).text()
  const nodes = []
  for (const raw of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(raw[1])
      nodes.push(...(data['@graph'] ?? [data]))
    }
    catch {}
  }
  const org = nodes.find(n => String(n['@type']).includes('Organization'))
  check(!!org && String(org['@type']).includes('OnlineStore'), `тип организации: ${org?.['@type']}`)
  check(!!org?.telephone && !!org?.email, `телефон ${org?.telephone}, почта ${org?.email}`)
  check((org?.sameAs ?? []).length >= 3, `профилей в sameAs: ${(org?.sameAs ?? []).length}`)
  check(!!org?.address?.addressLocality, `город в адресе: ${org?.address?.addressLocality}`)

  /*
   * Узел магазина на главной и узел организации описывают ОДИН бизнес, и
   * расходиться им нельзя. 16 сентября 2026 они разошлись: оплату картой
   * убрали с оформления и поправили организацию, а у магазина осталось
   * «Карты». Разметка обещала способ оплаты, которого на сайте нет.
   */
  const home = await (await fetch(`${BASE}/`)).text()
  const homeNodes = []
  for (const raw of home.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const data = JSON.parse(raw[1])
      homeNodes.push(...(data['@graph'] ?? [data]))
    }
    catch {}
  }
  const store = homeNodes.find(n => ['Store', 'ToyStore'].includes(String(n['@type'])))
  const homeOrg = homeNodes.find(n => String(n['@type']).includes('Organization'))
  const asText = v => (Array.isArray(v) ? v.join(', ') : String(v ?? ''))

  check(!!store, 'на главной есть узел магазина')
  check(
    !/карт/i.test(asText(store?.paymentAccepted)),
    `способы оплаты без карты: ${asText(store?.paymentAccepted)}`,
  )
  /*
   * Часы, оплата и валюта — свойства LocalBusiness: у магазина (ToyStore)
   * они к месту, у организации (Organization + OnlineStore) их в schema.org
   * нет — проверка разметки их отбрасывала. До 28 сентября 2026 здесь
   * проверялось, что у обоих узлов они совпадают.
   */
  const localOnly = ['openingHours', 'paymentAccepted', 'currenciesAccepted']
  check(
    localOnly.every(k => asText(store?.[k]) !== ''),
    `у магазина есть часы, оплата и валюта: «${asText(store?.openingHours)}», «${asText(store?.paymentAccepted)}», «${asText(store?.currenciesAccepted)}»`,
  )
  const stray = localOnly.filter(k => homeOrg && k in homeOrg)
  check(!stray.length, `у организации нет свойств LocalBusiness${stray.length ? ` — есть ${stray.join(', ')}` : ''}`)
  check(
    store?.parentOrganization?.['@id'] === homeOrg?.['@id'],
    'магазин связан с организацией через parentOrganization',
  )

  /*
   * Аудит 24 сентября 2026: тип `Store` вместо `ToyStore`, нет
   * `openingHoursSpecification` и `alternateName`.
   */
  check(store?.['@type'] === 'ToyStore', `тип магазина — ToyStore (${store?.['@type']})`)
  const hours = asText(store?.openingHours).match(/(\d\d:\d\d)-(\d\d:\d\d)/)
  const spec = [].concat(store?.openingHoursSpecification ?? [])[0]
  check(
    !!spec && (spec.dayOfWeek ?? []).length === 7 && spec.opens === hours?.[1] && spec.closes === hours?.[2],
    `часы по дням совпадают со строкой часов: ${spec ? `${(spec.dayOfWeek ?? []).length} дн., ${spec.opens}–${spec.closes}` : 'нет'}`,
  )
  const website = homeNodes.find(n => String(n['@type']) === 'WebSite')
  check(
    [homeOrg, website, store].every(n => asText(n?.alternateName).includes('uhti.kz')),
    `другие написания имени у организации, сайта и магазина: ${asText(homeOrg?.alternateName)}`,
  )

  const faq = nodes.find(n => n['@type'] === 'FAQPage')
  check((faq?.mainEntity ?? []).length >= 5, `вопросов в разметке: ${(faq?.mainEntity ?? []).length}`)

  const product = nodes.find(n => n['@type'] === 'ItemList')
  check(!!product, 'список товаров в разметке есть')
  check(
    !!product && product.numberOfItems === (product.itemListElement ?? []).length,
    `numberOfItems равен длине списка: ${product?.numberOfItems} и ${(product?.itemListElement ?? []).length}`,
  )
  const brandNode = nodes.find(n => n['@type'] === 'Brand')
  check(!!brandNode && !('subOrganization' in brandNode), 'у Brand нет subOrganization — у этого типа такого свойства нет')

  // «7 серий» при четырёх с товаром (аудит 24 сентября 2026): в шапке и в
  // подзаголовке мозаики — только серии, где есть товар
  const lego = await (await fetch(`${BASE}/brand/lego`)).text()
  const inStock = Number(lego.match(/(\d+) сери[яий] в наличии/)?.[1] ?? 0)
  const heroSeries = Number(lego.match(/blh__stat-num[^>]*>(\d+)<\/span>\s*<span[^>]*blh__stat-label[^>]*>сери/)?.[1] ?? 0)
  check(inStock > 0 && heroSeries === inStock, `серии LEGO: в шапке ${heroSeries}, в наличии ${inStock}`)
  // То же в «Коротко о бренде»: там до 30 сентября считались все серии («Серий 7»)
  const factSeries = Number(lego.match(/Серий<\/dt>\s*<dd[^>]*>(\d+)/)?.[1] ?? 0)
  check(factSeries === inStock, `серии LEGO: в «Коротко о бренде» ${factSeries}, в наличии ${inStock}`)
}

console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: страница готова для ИИ-поисковиков' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

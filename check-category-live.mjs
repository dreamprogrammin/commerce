/*
 * «Куклы ЛОЛ» и «Толокары»: абзац с цифрами и вопросы о цене и покупке.
 *
 * Почему это проверяется (28 сентября 2026). Это две самые показываемые
 * страницы разделов (Search Console за 28 дней — 315 и 279 показов, места 12
 * и 13), и среди их запросов — «сколько стоит кукла лол», «кукла лол купить»,
 * «купить машинку толокар». Ни цены, ни места покупки страницы не называли.
 * Цифры собираются из товаров раздела при каждой сборке страницы (`live` в
 * `constants/categoryStaticText.ts`) — так же, как у машинок и конструкторов
 * (их проверяет `check-lego-rc-seo.mjs`).
 *
 * Что проверяет, по серверной разметке каждой страницы:
 *  1) абзац «Сейчас в разделе …» — с теми числами, что лежат в базе. Страж
 *     считает их сам, по REST, своим кодом, а не кодом сайта;
 *  2) абзац стоит между первым и вторым абзацем текста раздела из базы;
 *  3) первым идёт вопрос «Сколько стоит …» с ценами, вторым — «Где купить …
 *     в Алматы?» с адресом, часами и ценой курьера;
 *  4) FAQPage совпадает с видимыми вопросами слово в слово;
 *  5) ₸ не отрывается от числа — между ними неразрывный пробел;
 *  6) на связке «раздел + бренд» цифр всего раздела нет;
 *  7) в браузере — без расхождения гидратации и ошибок в консоли.
 *
 *   node check-category-live.mjs --base=http://localhost:3131
 *   node check-category-live.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3131'

const PAGES = [
  {
    path: '/catalog/girls/kukly/kukly-lol',
    slug: 'kukly-lol',
    forms: ['набор', 'набора', 'наборов'],
    card: 'набора',
    priceQ: 'Сколько стоит кукла ЛОЛ в Ухтышке?',
    whereQ: 'Где купить куклу ЛОЛ в Алматы?',
    combo: '/catalog/girls/kukly/kukly-lol/brand/lol-surprise',
  },
  {
    path: '/catalog/kiddy/tolokar',
    slug: 'tolokar',
    forms: ['модель', 'модели', 'моделей'],
    card: 'модели',
    priceQ: 'Сколько стоит толокар в Ухтышке?',
    whereQ: 'Где купить толокар в Алматы?',
  },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
function decode(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, '\'')
    .replace(/&amp;/g, '&')
}
function visibleText(html) {
  return decode(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
}
function faqLd(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data
    try {
      data = JSON.parse(m[1])
    }
    catch {
      continue
    }
    const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
    const found = nodes.find(n => n?.['@type'] === 'FAQPage')
    if (found)
      return found.mainEntity.map(q => [q.name, q.acceptedAnswer?.text?.replace(/\s+/g, ' ')])
  }
  return []
}

const plural = (n, [one, few, many]) =>
  `${n} ${n % 10 === 1 && n % 100 !== 11 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`
const fmt = n => String(n).replace(/\B(?=(?:\d{3})+(?!\d))/g, ' ')
const since = months => months % 12
  ? `с ${months} месяцев`
  : `с ${months / 12} ${(months / 12) % 10 === 1 && months / 12 !== 11 ? 'года' : 'лет'}`

console.log(`сайт ${BASE}`)
const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = home.match(/supabase:\{url:"([^"]+)"/)?.[1]
const anon = home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)?.[0]
async function rest(query) {
  return (await fetch(`${supaUrl}/rest/v1/${query}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
}
const cats = await rest('categories?select=id,slug,parent_id,seo_text')

for (const page of PAGES) {
  console.log(`\n== ${page.path}`)
  const ids = [cats.find(c => c.slug === page.slug).id]
  for (let i = 0; i < ids.length; i++)
    ids.push(...cats.filter(c => c.parent_id === ids[i]).map(c => c.id))
  const rows = await rest(`products?select=price,final_price,stock_quantity,min_age_months&is_active=eq.true&category_id=in.(${ids.join(',')})`)
  const prices = rows.map(p => Number(p.final_price || p.price)).filter(n => n > 0).sort((a, b) => a - b)
  const count = rows.length
  const inStock = rows.filter(p => (p.stock_quantity ?? 0) > 0).length
  const cheap = prices.filter(n => n < 10000).length
  const byAge = new Map()
  for (const p of rows) {
    if (p.min_age_months !== null)
      byAge.set(p.min_age_months, (byAge.get(p.min_age_months) ?? 0) + 1)
  }
  const ages = [...byAge.entries()].sort((a, b) => a[0] - b[0])
  const agesKnown = ages.reduce((sum, [, n]) => sum + n, 0)
  const range = prices[0] === prices.at(-1) ? `за ${fmt(prices[0])} ₸` : `от ${fmt(prices[0])} до ${fmt(prices.at(-1))} ₸`
  console.log(`  по базе: ${plural(count, page.forms)}, в наличии ${inStock}, ${range}, дешевле 10 000 ₸ — ${cheap}, возраст (мес × шт.): ${ages.map(([m, n]) => `${m}×${n}`).join(', ')}`)

  const res = await fetch(`${BASE}${page.path}`)
  const html = await res.text()
  const text = visibleText(html)
  check(res.status === 200, `ответ ${res.status}`)

  // 1) абзац с цифрами
  const stock = inStock === count ? (count === 1 ? 'в наличии' : 'все в наличии') : inStock > 0 ? `в наличии ${inStock} из ${count}` : 'сейчас нет в наличии'
  const lead = `Сейчас в разделе ${plural(count, page.forms)} ${range}, ${stock}.`
  const leadAt = text.indexOf(lead)
  check(leadAt >= 0, `абзац с цифрами: «${lead}»`)
  let ageText = ''
  if (ages.length === 1 && agesKnown === count)
    ageText = `${count === 1 ? 'Для детей' : 'Все — для детей'} ${since(ages[0][0])}.`
  else if (ages.length > 0 && ages.length <= 3)
    ageText = `${ages.map(([m, n], i) => i === 0 ? `С${since(m).slice(1)} — ${n} из них` : `${since(m)} — ${n}`).join(', ')}.`
  if (ageText)
    check(text.slice(leadAt, leadAt + lead.length + 1 + ageText.length).endsWith(ageText), `возраст в абзаце: «${ageText}»`)

  // 2) между первым и вторым абзацем текста из базы
  const dbParas = [...(cats.find(c => c.slug === page.slug).seo_text ?? '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m => visibleText(m[1]).trim().slice(0, 50))
  const firstAt = dbParas[0] ? text.indexOf(dbParas[0]) : -1
  const secondAt = dbParas[1] ? text.indexOf(dbParas[1]) : -1
  check(firstAt >= 0 && secondAt > firstAt && leadAt > firstAt && leadAt < secondAt, 'абзац — между первым и вторым абзацем текста раздела из базы')

  // 5) ₸ и тысячи — через неразрывный пробел
  // Текст абзаца в сырой разметке — до следующего тега; между <p> и текстом Vue ставит <!--[-->
  const leadHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ').match(/Сейчас в разделе[^<]*/)?.[0] ?? ''
  check(!!leadHtml && !/\d ₸|\d \d{3}/.test(leadHtml), 'в абзаце ₸ и тысячи не отрываются: пробелы неразрывные')

  // 3) вопросы
  const qa = [...html.matchAll(/<h3 class="ssb__q"[^>]*>([\s\S]*?)<\/h3>\s*<p class="ssb__a"[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m => [visibleText(m[1]).trim(), visibleText(m[2]).trim()])
  const [priceQa, whereQa] = qa
  check(priceQa?.[0] === page.priceQ, `первый вопрос — «${priceQa?.[0]}»`)
  const priceHead = range.replace(/^от/, 'От').replace(/^за /, '')
  const cheapText = cheap > 0 && cheap < prices.length ? `, ${cheap} из них дешевле 10 000 ₸` : ''
  const priceAnswer = `${priceHead}. Сейчас в разделе ${plural(count, page.forms)}${cheapText}. Точная цена — в карточке ${page.card}, самовывоз в Алматы бесплатный.`
  check(priceQa?.[1] === priceAnswer, `ответ о цене: «${priceQa?.[1]}»`)
  check(whereQa?.[0] === page.whereQ, `второй вопрос — «${whereQa?.[0]}»`)
  check(/Амангельды, 100/.test(whereQa?.[1] ?? '') && /с 9:00 до 22:00/.test(whereQa?.[1] ?? '') && /Курьер по Алматы — 1 000 ₸/.test(whereQa?.[1] ?? ''), `где купить — адрес, часы и курьер: «${whereQa?.[1]?.slice(0, 90)}…»`)

  // 4) FAQPage = видимые вопросы
  const ld = faqLd(html)
  check(qa.length > 0 && JSON.stringify(ld) === JSON.stringify(qa), `FAQPage совпадает с видимыми вопросами слово в слово (${ld.length} / ${qa.length})`)

  // 6) связка с брендом — без цифр всего раздела
  if (page.combo) {
    const comboRes = await fetch(`${BASE}${page.combo}`)
    const comboText = comboRes.status === 200 ? visibleText(await comboRes.text()) : ''
    check(!comboText.includes('Сейчас в разделе') && !comboText.includes(page.priceQ), `на связке ${page.combo} (ответ ${comboRes.status}) цифр и вопроса о цене всего раздела нет`)
  }
}

// 7) браузер
console.log('\n== в браузере')
const browser = await chromium.launch()
try {
  for (const page of PAGES) {
    const tab = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const problems = []
    tab.on('console', (m) => {
      if (/Hydration/i.test(m.text()) || m.type() === 'error')
        problems.push(m.text())
    })
    tab.on('pageerror', e => problems.push(e.message))
    await tab.goto(`${BASE}${page.path}`, { waitUntil: 'load', timeout: 120000 })
    await tab.waitForTimeout(3000)
    const shown = await tab.evaluate(() => document.body.innerText.includes('Сейчас в разделе'))
    check(shown, `${page.path}: абзац виден после гидратации`)
    check(!problems.length, `${page.path}: без расхождений гидратации и ошибок консоли${problems.length ? ` — ${problems[0].slice(0, 120)}` : ''}`)
    await tab.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

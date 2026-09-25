/*
 * LEGO, конструкторы и радиоуправляемые машинки: заголовки, тексты, ссылки.
 *
 * Почему это проверяется (23 сентября 2026). Владелец: «очень важно
 * подвинуть в топ конструкторы и радиоуправляемые машинки». Search Console
 * за 90 дней: LEGO — позиция 25,6, радиоуправляемые машинки — 24 место по
 * главному запросу. На эти страницы со всего сайта вели одна-две ссылки,
 * H1 страницы LEGO был лозунгом без раздела и города, а тексты разделов
 * называли серии LEGO Technic и Friends, которых в магазине нет.
 *
 * Что проверяет:
 *  1) заголовок, H1 и текст каждой страницы — в серверной разметке;
 *  2) ссылки из текстов, записанных в базе, — настоящие <a href> в
 *     серверной разметке, а не сырой HTML и не пропавшие слова;
 *  3) выдуманных серий и старых обещаний нет; вопросы раздела — в FAQPage;
 *  4) подвал, главная и /catalog ведут на LEGO и на машинки;
 *  5) в браузере — гидратация без расхождений, а ссылка из текста раздела
 *     открывает страницу переходом внутри сайта, без перезагрузки;
 *  6) вертолёты, самолёты и квадрокоптер — в «Летающих игрушках», а не в
 *     выдаче машинок (по списку товаров в разметке ItemList);
 *  7) цифры машинок (план аудита, п. 17): абзац и вопросы «сколько стоит»,
 *     «с какого возраста», «где забрать» — с теми числами, что лежат в базе.
 *     Страж считает их сам, по REST, своим кодом, а не кодом сайта;
 *  8) то же у хаба «Конструкторы» и «Конструкторов для мальчиков»: абзац с
 *     брендами и возрастом, вопрос «сколько стоит», у хаба — «где купить»;
 *  9) `/llms.txt`: блок машинок с теми же цифрами, что на странице, и серии
 *     LEGO с числом наборов, ценами и возрастом — только непустые.
 *
 * Тексты в базе меняет `docs/SEO_LEGO_RC_2026_09_23.sql` (запускает
 * владелец). До его запуска пункты про тексты машинок и конструкторов
 * мальчикам краснеют — это ожидаемо, и так видно, запущен ли он. То же с
 * `docs/SEO_FLYING_TOYS_2026_09_24.sql`: до него нет раздела летающих
 * игрушек, ссылки на него, а в выдаче машинок стоят вертолёты.
 *
 *   node check-lego-rc-seo.mjs --base=http://localhost:3129
 *   node check-lego-rc-seo.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import fs from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const RC = '/catalog/boys/mashinki/radioupravlyaemye-mashinki'
const FLY = '/catalog/boys/letayushchie-igrushki'
const BOYS = '/catalog/constructors-root/konstruktory-malchikam'
const HUB = '/catalog/constructors-root'
/** Летающие модели — по названию товара. С 24 сентября 2026 у них свой раздел. */
const FLYING = /вертол[её]т|квадрокоптер|самол[её]т/i

const PAGES = [
  {
    path: RC,
    slug: 'radioupravlyaemye-mashinki',
    title: 'Радиоуправляемые машинки для детей — купить в Алматы | Ухтышка',
    h1: 'Радиоуправляемые машинки для детей',
    text: ['Как выбрать радиоуправляемую машинку', 'Купить радиоуправляемую машинку в Алматы'],
    links: [
      ['/brand/mokatoys', 'MokaToys'],
      ['/brand/hstar', 'Hstar'],
      ['/catalog/boys/mashinki/avtotreki', 'автотреки'],
      ['/catalog/boys/mashinki/parkingi-i-garazhi', 'паркинги и гаражи'],
      ['/catalog/boys/interaktivnye-igrushki/roboty', 'роботы на пульте'],
      [FLY, 'летающие игрушки'],
    ],
    textNot: ['летающие модели'],
    items: { none: FLYING },
  },
  {
    path: FLY,
    title: 'Летающие игрушки для детей — купить в Алматы | Ухтышка',
    h1: 'Летающие игрушки для детей',
    text: ['Как выбрать летающую игрушку', 'Купить летающую игрушку в Алматы'],
    links: [[RC, 'радиоуправляемые машинки']],
    items: { all: FLYING },
  },
  {
    path: BOYS,
    slug: 'konstruktory-malchikam',
    title: 'Конструкторы для мальчиков — LEGO, Sluban, CaDA | Ухтышка',
    h1: 'Конструкторы для мальчиков',
    text: ['Конструкторы для мальчиков: LEGO, Sluban, CaDA', 'Как выбрать конструктор мальчику'],
    // Возраст по коробкам (24 сентября 2026): «Водная полиция» — 6+, а не 4+.
    // Пока не запущен docs/LEGO_BOX_AGES_2026_09_24.sql, здесь красное.
    textNot: ['до водной полиции на 278'],
    links: [
      ['/brand/lego', 'LEGO'],
      ['/brand/lego/lego-city', 'LEGO City'],
      ['/brand/lego/lego-marvel', 'LEGO Marvel'],
      ['/brand/lego/lego-dc', 'LEGO DC'],
      ['/brand/sluban', 'Sluban'],
      ['/brand/cada', 'CaDA'],
      [`${BOYS}/brand/lego`, 'конструкторы LEGO для мальчиков'],
    ],
  },
  {
    path: HUB,
    slug: 'constructors-root',
    title: 'Детские конструкторы — купить в Алматы | Ухтышка',
    h1: 'Конструкторы для детей',
    // Возраст в описании сверяется ниже, с самым младшим набором по базе
    description: 'Детские конструкторы в Алматы — для мальчиков и девочек от',
    text: ['Какие марки здесь есть'],
    links: [
      ['/brand/lego/lego-city', 'City'],
      ['/brand/lego/lego-marvel', 'Marvel'],
      ['/brand/smoneo', 'Smoneo'],
      ['/brand/gudi', 'Gudi'],
      ['/brand/feelo', 'Feelo'],
    ],
  },
  {
    path: '/brand/lego',
    h1: 'Конструкторы LEGO в Алматы',
    text: ['пожарный мотоцикл', 'пожарный вертолёт'],
    // 60411 — пожарно-спасательный вертолёт; «полицейский участок» было
    // названием другого набора, перенесённым в карточку по ошибке. Название
    // карточки в выдаче меняет тот же SQL — до него здесь красное.
    textNot: ['полицейский участок'],
    links: [],
  },
]
// Серий Technic и Friends в магазине нет, военной техники у Sluban и CaDA тоже
// (проверено по базе 23 сентября 2026) — их называли тексты разделов.
const FALSE_CLAIMS = /City, Technic|Technic, Friends|военной и гражданской|военная и гражданская|широкий выбор|огромный выбор|побеждай/i

/** Вопросы раздела из `constants/categoryStaticText.ts` — чтобы проверка не разъезжалась с кодом. */
function staticQuestions(slug) {
  const src = fs.readFileSync(new URL('./constants/categoryStaticText.ts', import.meta.url), 'utf8')
  const start = src.indexOf(`\n  '${slug}': {`)
  if (start < 0)
    return []
  const next = src.slice(start + 1).search(/\n {2}'[\w-]+': \{/)
  const block = next < 0 ? src.slice(start) : src.slice(start, start + 1 + next)
  return [...block.matchAll(/\bq: '([^']+)'/g)].map(m => m[1])
}

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
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/&amp;/g, '&')
}
function visibleText(html) {
  return decode(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
}
/** Ссылки серверной разметки: [href, видимый текст]. */
function anchors(html) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
  return [...body.matchAll(/<a\s(?:[^>]*\s)?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => [decode(m[1]), decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()])
}
function ldNode(html, type) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data
    try {
      data = JSON.parse(m[1])
    }
    catch {
      continue
    }
    const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
    const found = nodes.find(n => n?.['@type'] === type)
    if (found)
      return found
  }
  return null
}
function faqPageQuestions(html) {
  return ldNode(html, 'FAQPage')?.mainEntity?.map(q => q.name) ?? null
}
/** Названия товаров выдачи — из ItemList (первые десять). Видимый текст не годится: его тексты сами называют вертолёты. */
function itemListNames(html) {
  return (ldNode(html, 'ItemList')?.itemListElement ?? []).map(e => e.item?.name ?? '')
}

console.log(`сайт ${BASE}`)
for (const p of PAGES) {
  console.log(`\n== ${p.path}`)
  const res = await fetch(`${BASE}${p.path}`)
  const html = await res.text()
  const text = visibleText(html)
  check(res.status === 200, `ответ ${res.status}`)

  if (p.title) {
    const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')
    check(title === p.title, `заголовок «${title}»`)
  }
  if (p.description) {
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
    check(desc.startsWith(p.description), `описание начинается как надо: «${desc.slice(0, 90)}…»`)
  }
  const h1 = visibleText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '').trim()
  check(h1 === p.h1, `H1 «${h1}»`)
  for (const t of p.text)
    check(text.includes(t), `в тексте «${t}»`)
  for (const t of p.textNot ?? [])
    check(!text.toLowerCase().includes(t.toLowerCase()), `в тексте нет «${t}»`)
  if (p.items) {
    const names = itemListNames(html)
    const stray = p.items.none
      ? names.filter(n => p.items.none.test(n))
      : names.filter(n => !p.items.all.test(n))
    const what = p.items.none ? 'летающих нет' : 'все летающие'
    check(names.length > 0 && !stray.length, `в выдаче ${names.length} товаров, ${what}${stray.length ? ` — «${stray[0].slice(0, 60)}»` : ''}`)
  }
  const bad = text.match(FALSE_CLAIMS)
  check(!bad, `выдуманных серий и старых обещаний нет${bad ? ` — «${bad[0]}»` : ''}`)
  check(!/&lt;a\s|<a\s[^>]*>[^<]*&lt;/.test(html), 'сырого «<a» в тексте нет')

  const links = anchors(html)
  for (const [href, label] of p.links)
    check(links.some(([h, l]) => h === href && l === label), `ссылка «${label}» → ${href}`)

  if (p.slug) {
    const qs = staticQuestions(p.slug)
    const ld = faqPageQuestions(html)
    check(qs.length >= 4 && ld !== null && qs.every(q => ld.includes(q) && text.includes(q)), `вопросы раздела на странице и в FAQPage: ${qs.length} / ${ld?.length ?? 'нет разметки'}`)
  }
}

// ── цифры «Радиоуправляемых машинок» ───────────────────────────────────────
/*
 * План аудита, п. 17 (25 сентября 2026): «нет цифр для цитаты» — число
 * моделей и цены стояли только в описании для выдачи. Страница считает их из
 * товаров раздела; здесь они считаются заново, по REST с публичным ключом, и
 * сверяются с серверной разметкой. На бою страница из ISR (до 30 минут):
 * сразу после смены цены или остатка возможен одиночный красный — повторить.
 */
console.log('\n== цифры «Радиоуправляемых машинок»')
const rcNumbersHome = await (await fetch(`${BASE}/`)).text()
const supaUrl = rcNumbersHome.match(/supabase:\{url:"([^"]+)"/)?.[1]
const anon = rcNumbersHome.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)?.[0]
async function rest(query) {
  return (await fetch(`${supaUrl}/rest/v1/${query}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
}
const cats = await rest('categories?select=id,slug,parent_id')
const rcIds = [cats.find(c => c.slug === 'radioupravlyaemye-mashinki').id]
for (let i = 0; i < rcIds.length; i++)
  rcIds.push(...cats.filter(c => c.parent_id === rcIds[i]).map(c => c.id))
const rcProducts = await rest(`products?select=price,final_price,stock_quantity,min_age_months&is_active=eq.true&category_id=in.(${rcIds.join(',')})`)
const prices = rcProducts.map(p => Number(p.final_price || p.price)).filter(n => n > 0).sort((a, b) => a - b)
const count = rcProducts.length
const inStock = rcProducts.filter(p => (p.stock_quantity ?? 0) > 0).length
const cheap = prices.filter(n => n < 10000).length
const byAge = new Map()
for (const p of rcProducts) {
  if (p.min_age_months !== null)
    byAge.set(p.min_age_months, (byAge.get(p.min_age_months) ?? 0) + 1)
}
const ages = [...byAge.entries()].sort((a, b) => a[0] - b[0])
const agesKnown = ages.reduce((sum, [, n]) => sum + n, 0)
const fmt = n => String(n).replace(/\B(?=(?:\d{3})+(?!\d))/g, ' ')
function models(n) {
  const form = n % 10 === 1 && n % 100 !== 11 ? 'модель' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'модели' : 'моделей'
  return `${n} ${form}`
}
const range = prices[0] === prices.at(-1) ? `за ${fmt(prices[0])} ₸` : `от ${fmt(prices[0])} до ${fmt(prices.at(-1))} ₸`
console.log(`  по базе: ${models(count)}, в наличии ${inStock}, ${range}, дешевле 10 000 ₸ — ${cheap}, возраст (мес × моделей): ${ages.map(([m, n]) => `${m}×${n}`).join(', ')}`)

const rcHtml = await (await fetch(`${BASE}${RC}`)).text()
const rcText = visibleText(rcHtml)
const lead = `Сейчас в разделе ${models(count)} ${range}, ${inStock === count ? 'все в наличии' : `в наличии ${inStock} из ${count}`}.`
const leadAt = rcText.indexOf(lead)
check(leadAt >= 0, `абзац с цифрами: «${lead}»`)
check(leadAt > rcText.indexOf('Из брендов больше всего') && leadAt < rcText.indexOf('Как выбрать радиоуправляемую машинку'), 'абзац — сразу за первым абзацем текста раздела')
const agesLead = ages.length === 1 && agesKnown === count ? 'Все — для детей' : `${ages[0]?.[1]} из них`
check(rcText.slice(leadAt, leadAt + lead.length + 80).includes(agesLead), `в абзаце возраст: «…${agesLead}…»`)

const qa = [...rcHtml.matchAll(/<h3 class="ssb__q"[^>]*>([\s\S]*?)<\/h3>\s*<p class="ssb__a"[^>]*>([\s\S]*?)<\/p>/g)]
  .map(m => [visibleText(m[1]).trim(), visibleText(m[2]).trim()])
const [priceQa, ageQa, pickupQa] = qa
check(priceQa?.[0] === 'Сколько стоит радиоуправляемая машинка в Ухтышке?', `первый вопрос — «${priceQa?.[0]}»`)
const priceHead = range.replace(/^от/, 'От').replace(/^за /, '')
const cheapText = cheap > 0 && cheap < prices.length ? `, ${cheap} из них дешевле 10 000 ₸` : ''
check(!!priceQa?.[1].startsWith(`${priceHead}. Сейчас в разделе ${models(count)}${cheapText}.`), `цена в ответе: «${priceQa?.[1].slice(0, 90)}…»`)
check(ageQa?.[0] === 'С какого возраста радиоуправляемые машинки в Ухтышке?', `второй вопрос — «${ageQa?.[0]}»`)
const ageHead = ages.length === 1 && agesKnown === count ? `Все ${models(count)} раздела` : `${models(ages[0]?.[1] ?? 0)} из ${count}`
check(!!ageQa?.[1].includes(ageHead), `возраст в ответе: «${ageQa?.[1]}»`)
check(pickupQa?.[0] === 'Где забрать радиоуправляемую машинку в Алматы?' && /Амангельды, 100/.test(pickupQa?.[1] ?? '') && /с 9:00 до 22:00/.test(pickupQa?.[1] ?? ''), `третий — где забрать, с адресом и часами: «${pickupQa?.[1].slice(0, 80)}…»`)
const faqLd = ldNode(rcHtml, 'FAQPage')?.mainEntity?.map(q => [q.name, q.acceptedAnswer?.text?.replace(/\s+/g, ' ')]) ?? []
check(qa.length > 0 && JSON.stringify(faqLd) === JSON.stringify(qa), `FAQPage совпадает с видимыми вопросами слово в слово (${faqLd.length} / ${qa.length})`)

// Связка «машинки + бренд» — у неё свои цифры, цифры всего раздела ей чужие.
const mokaText = visibleText(await (await fetch(`${BASE}${RC}/brand/mokatoys`)).text())
check(!mokaText.includes('Сейчас в разделе') && !mokaText.includes('Сколько стоит радиоуправляемая машинка в Ухтышке?'), 'на связке с MokaToys цифр и вопросов всего раздела нет')

// ── цифры конструкторов ─────────────────────────────────────────────────────
/*
 * То же для хаба «Конструкторы» и «Конструкторов для мальчиков» (25 сентября
 * 2026): число наборов, цены, наличие, ведущие бренды с числом («LEGO (14)»),
 * разброс возраста — и первым вопрос «сколько стоит». Считается заново, по
 * REST, со своим склонением.
 */
console.log('\n== цифры конструкторов')
function constructorsWord(n) {
  const form = n % 10 === 1 && n % 100 !== 11 ? 'конструктор' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'конструктора' : 'конструкторов'
  return `${n} ${form}`
}
const yearsGen = n => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'года' : 'лет'}`
async function branchFacts(slug) {
  const ids = [cats.find(c => c.slug === slug).id]
  for (let i = 0; i < ids.length; i++)
    ids.push(...cats.filter(c => c.parent_id === ids[i]).map(c => c.id))
  const rows = await rest(`products?select=price,final_price,stock_quantity,min_age_months,brands(name)&is_active=eq.true&category_id=in.(${ids.join(',')})`)
  const byBrand = new Map()
  const byAgeMonths = new Map()
  for (const p of rows) {
    if (p.brands?.name)
      byBrand.set(p.brands.name, (byBrand.get(p.brands.name) ?? 0) + 1)
    if (p.min_age_months !== null)
      byAgeMonths.set(p.min_age_months, (byAgeMonths.get(p.min_age_months) ?? 0) + 1)
  }
  return {
    count: rows.length,
    inStock: rows.filter(p => (p.stock_quantity ?? 0) > 0).length,
    prices: rows.map(p => Number(p.final_price || p.price)).filter(n => n > 0).sort((a, b) => a - b),
    brands: [...byBrand.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru')).slice(0, 3),
    ages: [...byAgeMonths.entries()].sort((a, b) => a[0] - b[0]),
  }
}
const CONSTRUCTOR_PAGES = [
  { path: HUB, slug: 'constructors-root', after: 'Наборы разложены по тому', before: 'Как выбрать по возрасту', priceQ: 'Сколько стоит детский конструктор в Ухтышке?', whereQ: 'Где купить конструктор в Алматы?', youngestInDescription: true },
  { path: BOYS, slug: 'konstruktory-malchikam', after: 'Конструкторы для мальчиков: LEGO, Sluban, CaDA', before: 'Как выбрать конструктор мальчику', priceQ: 'Сколько стоит конструктор для мальчика в Ухтышке?' },
]
for (const page of CONSTRUCTOR_PAGES) {
  const f = await branchFacts(page.slug)
  const cRange = f.prices[0] === f.prices.at(-1) ? `за ${fmt(f.prices[0])} ₸` : `от ${fmt(f.prices[0])} до ${fmt(f.prices.at(-1))} ₸`
  console.log(`  ${page.path}: по базе ${constructorsWord(f.count)}, в наличии ${f.inStock}, ${cRange}; ${f.brands.map(([b, n]) => `${b} ${n}`).join(', ')}; возраст (мес × наборов): ${f.ages.map(([m, n]) => `${m}×${n}`).join(', ')}`)
  const html = await (await fetch(`${BASE}${page.path}`)).text()
  const text = visibleText(html)
  const head = `Сейчас в разделе ${constructorsWord(f.count)} ${cRange}, ${f.inStock === f.count ? 'все в наличии' : `в наличии ${f.inStock} из ${f.count}`}.`
  const items = f.brands.map(([b, n]) => `${b} (${n})`)
  const brandsText = `Больше всего — ${items.length > 1 ? `${items.slice(0, -1).join(', ')} и ${items.at(-1)}` : items[0]}.`
  const at = text.indexOf(head)
  check(at >= 0, `${page.path}: абзац «${head}»`)
  check(at > text.indexOf(page.after) && at < text.indexOf(page.before), `${page.path}: абзац — за первым абзацем текста раздела`)
  check(text.slice(at + head.length).trimStart().startsWith(brandsText), `${page.path}: «${brandsText}»`)
  if (f.ages.length > 3 && f.ages.every(([m]) => m % 12 === 0)) {
    const [mode, n] = f.ages.reduce((best, g) => g[1] > best[1] ? g : best)
    const agesText = `Возраст — от ${f.ages[0][0] / 12} до ${yearsGen(f.ages.at(-1)[0] / 12)}, чаще всего с ${yearsGen(mode / 12)}: ${n} из ${f.count}.`
    check(text.includes(agesText), `${page.path}: «${agesText}»`)
  }

  const pairs = [...html.matchAll(/<h3 class="ssb__q"[^>]*>([\s\S]*?)<\/h3>\s*<p class="ssb__a"[^>]*>([\s\S]*?)<\/p>/g)]
    .map(m => [visibleText(m[1]).trim(), visibleText(m[2]).trim()])
  const bands = [[10000, '10 000'], [20000, '20 000']]
    .map(([limit, label]) => [label, f.prices.filter(x => x < limit).length])
    .filter(([, n]) => n > 0 && n < f.prices.length)
    .map(([label, n], i) => `${n}${i === 0 ? ' из них' : ' —'} дешевле ${label} ₸`)
  const priceHead = `${cRange.replace(/^от/, 'От').replace(/^за /, '')}. Сейчас в разделе ${constructorsWord(f.count)}${bands.length ? `, ${bands.join(', ')}` : ''}.`
  check(pairs[0]?.[0] === page.priceQ && !!pairs[0]?.[1].startsWith(priceHead), `${page.path}: первый вопрос «${pairs[0]?.[0]}» — «${pairs[0]?.[1].slice(0, 110)}…»`)
  if (page.whereQ)
    check(pairs[1]?.[0] === page.whereQ && /Амангельды, 100/.test(pairs[1]?.[1] ?? '') && /с 9:00 до 22:00/.test(pairs[1]?.[1] ?? ''), `${page.path}: второй — «${pairs[1]?.[0]}», с адресом и часами`)
  const ld = ldNode(html, 'FAQPage')?.mainEntity?.map(q => [q.name, q.acceptedAnswer?.text?.replace(/\s+/g, ' ')]) ?? []
  check(pairs.length > 0 && JSON.stringify(ld) === JSON.stringify(pairs), `${page.path}: FAQPage совпадает с видимыми вопросами (${ld.length} / ${pairs.length})`)

  /*
   * Вступление описания хаба лежит в базе и называет возраст руками. 23
   * сентября там стало «от 2 лет» — тогда у Smoneo 55013 и 55015 было 2+; 24
   * сентября их поправили по коробке на 3+, а описание осталось. Исправление —
   * docs/SEO_CONSTRUCTORS_HUB_AGE_2026_09_25.sql (запускает владелец), до него
   * здесь красное.
   */
  if (page.youngestInDescription && f.ages[0]?.[0] % 12 === 0) {
    const desc = decode(html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '')
    const want = `для мальчиков и девочек от ${yearsGen(f.ages[0][0] / 12)}.`
    check(desc.includes(want), `${page.path}: описание в выдаче — младший возраст по базе, «${want}» (сейчас «${desc.slice(0, 66)}…»)`)
  }
}
const legoBoys = visibleText(await (await fetch(`${BASE}${BOYS}/brand/lego`)).text())
check(!legoBoys.includes('Сейчас в разделе') && !legoBoys.includes('Сколько стоит конструктор для мальчика'), 'на связке «мальчикам + LEGO» цифр и вопросов всего раздела нет')

// ── llms.txt: машинки и серии LEGO ──────────────────────────────────────────
/*
 * План аудита, п. 18 (25 сентября 2026): в `/llms.txt` модели нечего было
 * процитировать про машинки и LEGO, кроме имён. Строка машинок обязана
 * совпадать с абзацем на странице раздела, серии LEGO — с базой; пустые серии
 * (их страницы закрыты noindex) не называются. На бою файл кешируется на час.
 */
console.log('\n== llms.txt: машинки и серии LEGO')
function setsWord(n) {
  const form = n % 10 === 1 && n % 100 !== 11 ? 'набор' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'набора' : 'наборов'
  return `${n} ${form}`
}
const llms = (await (await fetch(`${BASE}/llms.txt`)).text()).replace(/\s+/g, ' ')
check(llms.includes(`## Радиоуправляемые машинки - [Радиоуправляемые машинки для детей](https://uhti.kz${RC}). ${lead}`), `llms.txt: машинки — ссылкой и теми же цифрами, что на странице: «${lead}»`)
check(llms.includes(`(https://uhti.kz${FLY}). Сейчас в разделе`), 'llms.txt: рядом — летающие игрушки, с цифрами')
const [legoBrand] = await rest('brands?select=id&slug=eq.lego')
const legoSeries = await rest(`product_lines?select=id,name,slug&brand_id=eq.${legoBrand.id}`)
const legoSets = await rest(`products?select=product_line_id,price,final_price,min_age_months&is_active=eq.true&brand_id=eq.${legoBrand.id}`)
check(llms.includes('## Серии LEGO'), 'llms.txt: есть блок «Серии LEGO»')
for (const series of legoSeries) {
  const sets = legoSets.filter(p => p.product_line_id === series.id)
  const url = `(https://uhti.kz/brand/lego/${series.slug})`
  if (!sets.length) {
    check(!llms.includes(url), `llms.txt: пустой серии ${series.name} нет`)
    continue
  }
  const pr = sets.map(p => Number(p.final_price || p.price)).sort((a, b) => a - b)
  const seriesRange = pr[0] === pr.at(-1) ? `за ${fmt(pr[0])} ₸` : `от ${fmt(pr[0])} до ${fmt(pr.at(-1))} ₸`
  const youngest = Math.min(...sets.map(p => p.min_age_months ?? Infinity))
  const age = Number.isFinite(youngest) && youngest % 12 === 0 ? `, с ${yearsGen(youngest / 12)}` : ''
  const want = `- [${series.name}]${url} — ${setsWord(sets.length)} ${seriesRange}${age}`
  check(llms.includes(want), `llms.txt: «${want}»`)
}

// ── подвал, главная, /catalog ───────────────────────────────────────────────
console.log('\n== подвал и тексты-хабы')
const homeHtml = await (await fetch(`${BASE}/`)).text()
const home = anchors(homeHtml)
check(home.some(([h, l]) => h === '/brand/lego' && l === 'Конструкторы LEGO'), 'подвал/главная: «Конструкторы LEGO» → /brand/lego')
check(home.filter(([h]) => h === RC).length >= 2, `главная: на машинки ведут и текст, и подвал (${home.filter(([h]) => h === RC).length})`)
check(home.some(([h, l]) => h === HUB && l === 'Конструкторы для детей'), 'главная: «Конструкторы для детей» → хаб')
check(!/огромный выбор/i.test(visibleText(homeHtml)), 'на главной нет «огромного выбора»')
const catalog = anchors(await (await fetch(`${BASE}/catalog`)).text())
check(catalog.some(([h, l]) => h === '/brand/lego' && l === 'конструкторы LEGO'), '/catalog: «конструкторы LEGO» в тексте')
check(catalog.some(([h, l]) => h === RC && l === 'радиоуправляемые машинки'), '/catalog: «радиоуправляемые машинки» в тексте')
const about = anchors(await (await fetch(`${BASE}/about`)).text())
check(about.some(([h]) => h === RC) && about.some(([h]) => h === '/brand/lego'), 'подвал есть и на /about')

// ── браузер ─────────────────────────────────────────────────────────────────
console.log('\n== браузер')
const browser = await chromium.launch()
try {
  for (const path of [RC, FLY, BOYS, HUB, '/brand/lego', '/']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const mismatch = []
    page.on('console', (m) => {
      if (/Hydration/i.test(m.text()))
        mismatch.push(m.text())
    })
    // Недогрузившаяся страница — провал этой страницы, а не падение всего
    // стража: иначе остальные страницы остаются непроверенными.
    const loaded = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
      .then(() => true, (e) => {
        check(false, `${path}: страница не загрузилась — ${e.message.split('\n')[0]}`)
        return false
      })
    if (loaded) {
      await page.waitForTimeout(2500)
      check(!mismatch.length, `${path}: гидратация без расхождений${mismatch.length ? ` — ${mismatch[0].slice(0, 160)}` : ''}`)
    }
    await page.close()
  }

  // Ссылка из текста раздела (он из базы) — переход внутри сайта.
  // Клик ждёт гидратации: до неё любая ссылка — обычный переход с
  // перезагрузкой. На dev-сервере её нет и через 2,5 с — страж краснел
  // там, где на бою всё в порядке (проверено 24 сентября 2026).
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE}${RC}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
    .catch(() => {})
    .then(() => page.waitForTimeout(2500))
  await page.evaluate(() => {
    window.__noReload = true
  })
  const link = page.locator('a[href="/catalog/boys/mashinki/avtotreki"]', { hasText: 'автотреки' }).first()
  await link.scrollIntoViewIfNeeded()
  await link.click()
  await page.waitForURL(/\/avtotreki$/, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const kept = await page.evaluate(() => window.__noReload === true)
  const h1 = (await page.locator('h1').first().textContent())?.trim()
  check(page.url().endsWith('/catalog/boys/mashinki/avtotreki') && kept, `ссылка из текста: переход внутри сайта (${page.url().replace(BASE, '')}, ${kept ? 'без перезагрузки' : 'С ПЕРЕЗАГРУЗКОЙ'})`)
  check(h1 === 'Автотреки для мальчиков', `открылась страница «${h1}»`)
  await page.close()

  // На машинки — переходом внутри сайта: цифры приходят не в серверной
  // разметке, а в данных перехода (_payload.json), и абзац должен быть и там.
  const nav = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  // Расхождения гидратации и исключения страницы. Прочие ошибки консоли —
  // шум стенда: у локальной сборки нет ни ID Google-тега, ни картинок.
  const navErrors = []
  nav.on('console', (m) => {
    if (/Hydration/i.test(m.text()))
      navErrors.push(m.text())
  })
  nav.on('pageerror', e => navErrors.push(e.message))
  await nav.goto(`${BASE}/`, { waitUntil: 'load', timeout: 120000 })
  await nav.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
    .catch(() => {})
    .then(() => nav.waitForTimeout(2500))
  await nav.evaluate(() => {
    window.__noReload = true
  })
  const rcLink = nav.locator(`a[href="${RC}"]`).first()
  await rcLink.scrollIntoViewIfNeeded()
  await rcLink.click()
  await nav.waitForURL(u => u.pathname === RC, { timeout: 20000 }).catch(() => {})
  await nav.waitForTimeout(2500)
  const navState = await nav.evaluate(() => ({
    kept: window.__noReload === true,
    lead: [...document.querySelectorAll('p')].map(p => p.textContent.replace(/\s+/g, ' ').trim()).find(t => t.startsWith('Сейчас в разделе')) ?? null,
    firstQ: document.querySelector('.ssb__q')?.textContent?.trim() ?? null,
  }))
  check(navState.kept && !!navState.lead?.startsWith(lead), `с главной внутри сайта: абзац «${navState.lead}»${navState.kept ? '' : ' — С ПЕРЕЗАГРУЗКОЙ'}`)
  check(navState.firstQ === 'Сколько стоит радиоуправляемая машинка в Ухтышке?', `и вопросы с цифрами первыми: «${navState.firstQ}»`)
  check(!navErrors.length, `без расхождений гидратации и исключений${navErrors.length ? ` — ${navErrors[0].slice(0, 160)}` : ''}`)
  await nav.close()
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

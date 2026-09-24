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
 *     выдаче машинок (по списку товаров в разметке ItemList).
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
    description: 'Детские конструкторы в Алматы — для мальчиков и девочек от 2 лет.',
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
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

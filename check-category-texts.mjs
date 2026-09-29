/*
 * Тексты и вопросы «Толокаров», «Каталок», «Кукол L.O.L» и «Конструкторов для девочек».
 *
 * Почему это проверяется (22 сентября 2026). Три страницы стоят на 12–19
 * месте, и тексты на них обещали то, чего нет: «широкий выбор» при 2–3
 * моделях, «толокары в виде животных и мотоциклов», «большие куклы L.O.L.»,
 * «доставка по всему Казахстану за 1–3 дня». Новые тексты лежат в
 * `docs/SEO_CATEGORY_TEXTS_2026_09_22.sql` (запускает владелец), вопросы —
 * в `constants/categoryStaticText.ts`.
 *
 * 25 сентября 2026 сюда добавлены «Каталки» (план по аудиту, п. 14): два
 * разных раздела, каталку катят или идут за ней, на толокар садятся, и
 * тексты ведут друг на друга. Текст «Каталок» и перенос ходунка-каталки в
 * раздел — `docs/SEO_KATALKI_TOLOKAR_2026_09_25.sql`; до его запуска пункты
 * «Каталок» и ссылка из «Толокаров» краснеют.
 *
 * Что проверяет на каждой странице:
 *  1) текст из базы — новые заголовки на месте, старых обещаний нет, ссылки
 *     на соседний раздел — настоящие <a href>, нужный товар в ItemList;
 *  2) свои вопросы — все из `categoryStaticText.ts` видны и попали в разметку
 *     FAQPage, шаблонных вопросов генератора («Часто задаваемые вопросы») нет;
 *  3) в браузере после гидратации текст и вопросы на месте, в тексте нет
 *     сырого «&nbsp;» и Vue не сообщил о расхождении гидратации.
 *
 *   node check-category-texts.mjs --base=http://localhost:3129
 *   node check-category-texts.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import fs from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'

const PAGES = [
  {
    slug: 'tolokar',
    path: '/catalog/kiddy/tolokar',
    h2: ['Толокар для детей — первая машинка малыша', 'Как выбрать толокар', 'Купить толокар в Алматы'],
    links: [['/catalog/kiddy/katalki', 'каталки']],
  },
  {
    slug: 'katalki',
    path: '/catalog/kiddy/katalki',
    h2: ['Каталки для первых шагов', 'Как выбрать каталку', 'Купить каталку в Алматы'],
    links: [['/catalog/kiddy/tolokar', 'толокары']],
    item: /Ходунок-каталка/,
  },
  {
    slug: 'kukly-lol',
    path: '/catalog/girls/kukly/kukly-lol',
    h2: ['Куклы ЛОЛ — сюрприз, который распаковывают слой за слоем', 'Какие бывают наборы L.O.L.', 'Где купить куклу ЛОЛ в Алматы'],
  },
  {
    slug: 'konstruktory-devochkam',
    path: '/catalog/constructors-root/konstruktory-devochkam',
    h2: ['Конструктор для девочки — собрать и играть', 'Как выбрать конструктор для девочки', 'Купить конструктор для девочки в Алматы'],
  },
]
const OLD_PROMISES = /широкий выбор|огромный выбор|прямо сейчас|по всему Казахстану|животных и мотоциклов|большие куклы/i

/** Вопросы раздела прямо из `constants/categoryStaticText.ts` — чтобы проверка не разъезжалась с кодом. */
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
function visibleText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/\s+/g, ' ')
}
function faqPageQuestions(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data
    try {
      data = JSON.parse(m[1])
    }
    catch {
      continue
    }
    const nodes = Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
    for (const n of nodes) {
      if (n?.['@type'] === 'FAQPage')
        return (n.mainEntity ?? []).map(q => q.name)
    }
  }
  return null
}

console.log(`сайт ${BASE}`)
const browser = await chromium.launch()
for (const p of PAGES) {
  console.log(`\n== ${p.path}`)
  const res = await fetch(`${BASE}${p.path}`)
  const html = await res.text()
  const text = visibleText(html)
  check(res.status === 200, `ответ ${res.status}`)

  // 1) текст из базы
  for (const h of p.h2)
    check(text.includes(h), `заголовок текста «${h}»`)
  const old = text.match(OLD_PROMISES)
  check(!old, `старых обещаний нет${old ? ` — «${old[0]}»` : ''}`)
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
  for (const [href, label] of p.links ?? []) {
    const linked = [...body.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
      .some(m => m[1] === href && m[2].replace(/<[^>]+>/g, '').trim() === label)
    check(linked, `ссылка «${label}» → ${href}`)
  }
  if (p.item) {
    const names = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
      .flatMap((m) => {
        try {
          const data = JSON.parse(m[1])
          return Array.isArray(data['@graph']) ? data['@graph'] : [data]
        }
        catch {
          return []
        }
      })
      .find(n => n?.['@type'] === 'ItemList')
      ?.itemListElement
      ?.map(e => e.item?.name ?? '') ?? []
    check(names.some(n => p.item.test(n)), `в выдаче есть ${p.item.source} (товаров в ItemList: ${names.length})`)
  }

  // 2) свои вопросы
  const qs = staticQuestions(p.slug)
  check(qs.length >= 3, `в categoryStaticText.ts у раздела ${qs.length} вопроса(ов)`)
  const missing = qs.filter(q => !text.includes(q))
  check(!missing.length, `все вопросы видны в серверной разметке${missing.length ? ` — нет: ${missing.join(' | ')}` : ''}`)
  const ld = faqPageQuestions(html)
  check(ld !== null && qs.every(q => ld.includes(q)), `разметка FAQPage: ${ld === null ? 'нет' : `${ld.length} вопроса(ов)`}`)
  check(!text.includes('Часто задаваемые вопросы'), 'шаблонных вопросов генератора нет')

  // 3) браузер
  const page = await browser.newPage()
  const mismatch = []
  page.on('console', (m) => {
    if (/Hydration/i.test(m.text()))
      mismatch.push(m.text())
  })
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(3000)
  const live = await page.evaluate(() => document.body.innerText)
  check(p.h2.every(h => live.includes(h)) && qs.every(q => live.includes(q)), 'после гидратации текст и вопросы на месте')
  check(!live.includes('&nbsp;'), 'в тексте нет сырого «&nbsp;»')
  check(!mismatch.length, `гидратация без расхождений${mismatch.length ? ` — ${mismatch[0]}` : ''}`)
  await page.close()
}
await browser.close()

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

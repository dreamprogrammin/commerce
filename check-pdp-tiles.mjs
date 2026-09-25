/*
 * Плитки «отзывы» и «вопросы» под ценой на карточке товара (телефон).
 *
 * Почему это проверяется (план по аудиту, п. 20, 26 сентября 2026). У 174 из
 * 178 карточек отзывов нет, и плитка показывала «0.0 · 0 отзывов» — читается
 * как оценка ноль. Рядом «3 вопроса» — а это вопросы магазина, которые
 * генератор кладёт в каждую карточку (возраст, доставка, возврат), не
 * вопросы покупателей.
 *
 * Что проверяет в серверной разметке:
 *  1) нет отзывов (в разметке Product нет aggregateRating) — «Отзывов пока
 *     нет», без «0.0»; отзывы есть — рейтинг и «N отзыв…»;
 *  2) плитка вопросов не выдаёт вопросы магазина за вопросы покупателей: у
 *     аккордеона HiH02 только они — «Вопросы и ответы» (если там появится
 *     вопрос покупателя, плитка честно покажет число, а пункт покраснеет —
 *     тогда взять другую карточку);
 *  3) в браузере на ширине телефона — гидратация без расхождений.
 *
 *   node check-pdp-tiles.mjs --base=http://localhost:3129
 *   node check-pdp-tiles.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'

const PRODUCTS = [
  // Отзывов нет, вопросы только магазинные.
  { slug: 'akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let', onlyShopQuestions: true },
  // Два отзыва — рейтинг должен остаться.
  { slug: 'nabor-syurpriz-lol-surprise-birthday-593140-9-syurprizov-prazdnichnyy-naryad-redkie-kukly' },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim()
function tile(html, anchor) {
  const m = html.match(new RegExp(`<a href="#${anchor}" class="pdp-tile"[^>]*>([\\s\\S]*?)</a>`))
  return m ? plain(m[1]) : null
}
function hasAggregateRating(html) {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (/"aggregateRating"/.test(m[1]))
      return true
  }
  return false
}

console.log(`сайт ${BASE}`)
for (const p of PRODUCTS) {
  const path = `/catalog/products/${p.slug}`
  console.log(`\n== ${path.slice(0, 80)}`)
  const res = await fetch(`${BASE}${path}`)
  const html = await res.text()
  check(res.status === 200, `ответ ${res.status}`)

  const reviews = tile(html, 'reviews')
  const questions = tile(html, 'questions')
  check(reviews !== null && questions !== null, `плитки в серверной разметке: «${reviews}» и «${questions}»`)
  if (hasAggregateRating(html))
    check(/^\d[.,]\d \d+ отзыв/.test(reviews ?? ''), `отзывы есть — рейтинг и число: «${reviews}»`)
  else
    check(reviews === 'Отзывов пока нет', `отзывов нет — «Отзывов пока нет», а не «0.0»: «${reviews}»`)
  if (p.onlyShopQuestions)
    check(questions === 'Вопросы и ответы', `вопросы магазина не выдаются за вопросы покупателей: «${questions}»`)
}

console.log('\n== браузер, ширина телефона')
const browser = await chromium.launch()
try {
  for (const p of PRODUCTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()
    const mismatch = []
    page.on('console', (m) => {
      if (/Hydration/i.test(m.text()))
        mismatch.push(m.text())
    })
    await page.goto(`${BASE}/catalog/products/${p.slug}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
      .catch(() => {})
      .then(() => page.waitForTimeout(2500))
    check(!mismatch.length, `${p.slug.slice(0, 40)}: гидратация без расхождений${mismatch.length ? ` — ${mismatch[0].slice(0, 120)}` : ''}`)
    await ctx.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

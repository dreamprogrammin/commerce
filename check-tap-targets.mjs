/*
 * Область нажатия кнопки «В избранное» на карточке товара.
 *
 * Почему это проверяется (план по аудиту, п. 21, 26 сентября 2026). Сердечко
 * на карточке — круг 38×38, и нажатие ловилось только внутри него: при норме
 * 44–48 px палец промахивался и попадал в карточку, открывая товар. Круг
 * оставлен прежним — это дизайн, — а вокруг него невидимый слой на 3 px
 * (`.pc-wish::before` в components/global/ProductCard.vue).
 *
 * Что проверяет на телефоне (390) и компьютере (1280): круг по-прежнему
 * 38×38, а точка в 3 px за его краем с каждой стороны попадает в кнопку.
 * Нажимать не нажимает — только `elementFromPoint`.
 *
 *   node check-tap-targets.mjs --base=http://localhost:3129
 *   node check-tap-targets.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3129'
const PATH = '/catalog/boys/mashinki'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

console.log(`сайт ${BASE}, страница ${PATH}`)
const browser = await chromium.launch()
try {
  for (const [width, height] of [[390, 844], [1280, 900]]) {
    const ctx = await browser.newContext({ viewport: { width, height } })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${PATH}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
      .catch(() => {})
      .then(() => page.waitForTimeout(2500))
    const wish = page.locator('.pc-wish').first()
    await wish.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    const m = await wish.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const hit = (x, y) => !!document.elementFromPoint(x, y)?.closest('.pc-wish')
      return {
        w: Math.round(r.width),
        h: Math.round(r.height),
        ring: [hit(r.left - 3, cy), hit(r.right + 2, cy), hit(cx, r.top - 3), hit(cx, r.bottom + 2)],
      }
    })
    console.log(`\n== ширина ${width}`)
    check(m.w === 38 && m.h === 38, `видимый круг прежний: ${m.w}×${m.h}`)
    check(m.ring.every(Boolean), `нажатие ловится на 3 px за краем со всех сторон (слева, справа, сверху, снизу: ${m.ring.map(v => (v ? 'да' : 'нет')).join(', ')}) — область 44×44`)
    await ctx.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

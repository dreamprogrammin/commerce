/*
 * Фоновая работа карточки товара и главной: вечные анимации и лишний код.
 *
 * Почему это проверяется (28 сентября 2026). Разбор скорости карточки нашёл
 * две вещи, которые телефон делал зря:
 *  1) крутилки и пульсация заглушек `ProgressiveImage` у ленивых картинок ниже
 *     первого экрана — такие картинки не грузятся, пока к ним не долистают, и
 *     анимации работали бесконечно. На карточке их было 14, на главной 4, и
 *     главный поток пересчитывал их стили на каждом кадре: 300–330 мс за 5
 *     секунд простоя при CPU ×4;
 *  2) `browser-image-compression` (53 КБ) — сжатие фото к отзыву — приезжал с
 *     каждой карточкой, хотя фото прикладывают единицы.
 *
 * Что проверяет:
 *  1) через 6 с после загрузки на карточке и главной нет ни одной бесконечной
 *     анимации — и сколько пересчётов стилей за 5 с простоя (для сведения);
 *  2) при открытии карточки не приходит файл с библиотекой сжатия — узнаётся
 *     по строке `browser-image-compression@` (адрес библиотеки, зашитый в неё
 *     саму);
 *  3) без расхождений гидратации и ошибок в консоли.
 *
 *   LD_LIBRARY_PATH=… node check-pdp-background.mjs --base=http://localhost:3131
 *   LD_LIBRARY_PATH=… node check-pdp-background.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium, devices } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3131'
const PAGES = [
  { name: 'карточка', path: '/catalog/products/mashinka-makvin-3506-na-radioupravlenii-so-svetovymi-effektami-dlya-detey-ot-3-let', pdp: true },
  { name: 'главная', path: '/' },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

console.log(`сайт ${BASE}`)
const browser = await chromium.launch()
try {
  for (const page of PAGES) {
    console.log(`\n== ${page.name}: ${page.path}`)
    const ctx = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3, ignoreHTTPSErrors: true })
    const tab = await ctx.newPage()
    const problems = []
    tab.on('console', (m) => {
      if (/Hydration/i.test(m.text()) || m.type() === 'error')
        problems.push(m.text())
    })
    tab.on('pageerror', e => problems.push(e.message))
    const compression = []
    tab.on('response', async (res) => {
      if (!/\.js(\?|$)/.test(res.url()))
        return
      const body = await res.text().catch(() => '')
      if (body.includes('browser-image-compression@'))
        compression.push(res.url().split('/').pop())
    })

    await tab.goto(`${BASE}${page.path}`, { waitUntil: 'load', timeout: 120000 })
    await tab.waitForTimeout(6000)

    const anims = await tab.evaluate(() => document.getAnimations()
      .filter(a => a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity)
      .map((a) => {
        const t = a.effect?.target
        const cls = t ? String(t.className?.baseVal ?? t.className).trim().split(/\s+/).slice(0, 4).join('.') : '?'
        return `${a.animationName || a.constructor.name} на ${t?.tagName?.toLowerCase() ?? '?'}.${cls}`
      }))
    check(anims.length === 0, `бесконечных анимаций через 6 с: ${anims.length}${anims.length ? ` — ${anims.slice(0, 2).join('; ')}` : ''}`)

    // Пересчёты стилей в простое — для сведения: CPU ×4, трасса на 5 с
    const cdp = await ctx.newCDPSession(tab)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const done = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve))
    await cdp.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline'] } })
    await tab.waitForTimeout(5000)
    await cdp.send('Tracing.end')
    const { stream } = await done
    let raw = ''
    for (;;) {
      const r = await cdp.send('IO.read', { handle: stream, size: 1 << 20 })
      raw += r.data
      if (r.eof)
        break
    }
    const parsed = JSON.parse(raw)
    const recalcs = (parsed.traceEvents ?? parsed).filter(e => e.name === 'UpdateLayoutTree' && e.ph === 'X')
    console.log(`  (для сведения) пересчётов стилей за 5 с простоя, CPU ×4: ${recalcs.length}, ${Math.round(recalcs.reduce((a, e) => a + e.dur, 0) / 1000)} мс`)

    if (page.pdp)
      check(compression.length === 0, `библиотека сжатия фото при открытии карточки не приходит${compression.length ? ` — пришла в ${compression.join(', ')}` : ''}`)
    check(!problems.length, `без расхождений гидратации и ошибок консоли${problems.length ? ` — ${problems[0].slice(0, 120)}` : ''}`)
    await ctx.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

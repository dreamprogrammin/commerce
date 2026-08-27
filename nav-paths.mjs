import { chromium } from 'playwright'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  window.__calls = []
  const hook = (name, fn) => function (...a) {
    window.__calls.push({ t: Math.round(performance.now()), name, a: JSON.stringify(a).slice(0, 80), from: Math.round(window.scrollY) })
    return fn.apply(this, a)
  }
  window.scrollTo = hook('scrollTo', window.scrollTo.bind(window))
  window.scroll = hook('scroll', window.scroll.bind(window))
  const de = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  Object.defineProperty(Element.prototype, 'scrollTop', {
    get() { return de.get.call(this) },
    set(v) {
      if (this === document.documentElement || this === document.body)
        window.__calls.push({ t: Math.round(performance.now()), name: `${this.tagName}.scrollTop`, a: String(v), from: Math.round(window.scrollY) })
      return de.set.call(this, v)
    },
  })
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

async function trial(label, startUrl, scrollY, clickSel) {
  await p.goto(`https://localhost:3111${startUrl}`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForTimeout(6500)
  await p.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollY)
  await p.waitForTimeout(700)
  const before = await p.evaluate(() => Math.round(window.scrollY))
  await p.evaluate(() => {
    window.__calls = []; window.__f = []; window.__t0 = performance.now()
    const tick = () => {
      window.__f.push([Math.round(performance.now() - window.__t0), Math.round(window.scrollY), Math.round(document.body.scrollHeight), location.pathname.slice(-24)])
      if (performance.now() - window.__t0 < 4000) requestAnimationFrame(tick)
    }
    tick()
  })
  const target = p.locator(clickSel).first()
  if (!(await target.count())) { console.log(`\n### ${label}: элемент ${clickSel} не найден`); return }
  await target.click({ timeout: 20000 }).catch(e => console.log('клик не прошёл:', String(e).slice(0, 60)))
  await p.waitForTimeout(5000)
  const f = await p.evaluate(() => window.__f)
  const calls = await p.evaluate(() => window.__calls)
  console.log(`\n### ${label} (стартовый y=${before})`)
  let prev = null
  for (const [t, y, h, path] of f) {
    const k = `${y}|${path}`
    if (k === prev) continue
    prev = k
    console.log(`   ${String(t).padStart(4)} мс  y=${String(y).padStart(5)}  высота ${String(h).padStart(5)}  ${path}`)
  }
  console.log('   вызовы скролла:', calls.length ? calls.map(c => `${c.t}мс ${c.name}(${c.a}) из ${c.from}`).join('; ') : 'ни одного')
}

await trial('каталог → ТОВАР', '/catalog/all', 2500, 'a[href*="/catalog/products/"]')
await trial('каталог → КАТЕГОРИЯ (чип)', '/catalog/all', 2500, 'a[href^="/catalog/"]:not([href*="/products/"])')
await trial('товар → ГЛАВНАЯ (нижняя нав)', '/catalog/products/robo-alive-dino-fossil', 2000, 'nav[aria-label="Основная навигация"] a[href="/"]')
await browser.close()

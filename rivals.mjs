// Как устроены соседи: SPA или обычные переходы, чем рисуют, чем платят.
import { chromium } from 'playwright'

const SITES = process.argv.slice(2).filter(a => !a.startsWith('--'))
const browser = await chromium.launch()

for (const site of SITES) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    ignoreHTTPSErrors: true,
  })
  await ctx.addInitScript(() => {
    window.__lt = []
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  })
  const p = await ctx.newPage()
  const docs = []
  p.on('request', r => { if (r.resourceType() === 'document') docs.push(r.url()) })
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  console.log(`\n════ ${site} ════`)
  try {
    await p.goto(site, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await p.waitForTimeout(12000)
  }
  catch (e) { console.log('  не открылся:', String(e).slice(0, 70)); await ctx.close(); continue }

  const info = await p.evaluate(() => ({
    узлов: document.getElementsByTagName('*').length,
    картинок: document.images.length,
    ссылокНаТовар: document.querySelectorAll('a[href*="/product"], a[href*="/tovar"], a[href*="/p/"], a[href*="/catalog/"]').length,
    движок: window.__NUXT__ ? 'Nuxt' : window.__NEXT_DATA__ ? 'Next.js' : window.__remixContext ? 'Remix' : document.querySelector('#__nuxt') ? 'Nuxt' : document.querySelector('#__next') ? 'Next.js' : 'не опознан',
    turbo: !!document.querySelector('meta[name="turbo-visit-control"]') || typeof window.Turbo !== 'undefined',
    speculation: !!document.querySelector('script[type="speculationrules"]'),
    contentVisibility: [...document.querySelectorAll('*')].filter(e => getComputedStyle(e).contentVisibility === 'auto').length,
    ltLoad: window.__lt.filter(d => d > 50).reduce((a, b) => a + b, 0),
  }))
  console.log(`  движок: ${info.движок}${info.turbo ? ' + Turbo' : ''} | speculationrules: ${info.speculation ? 'ЕСТЬ' : 'нет'} | content-visibility: ${info.contentVisibility} элементов`)
  console.log(`  главная: ${info.узлов} узлов, ${info.картинок} картинок | главный поток при загрузке занят ${info.ltLoad} мс`)

  // переход в каталог/товар: SPA или полная перезагрузка
  const href = await p.evaluate(() => {
    const a = [...document.querySelectorAll('a[href]')].find((el) => {
      const h = el.getAttribute('href') || ''
      const r = el.getBoundingClientRect()
      return /\/(catalog|category|c|tovar|product|p)\//.test(h) && r.top >= 0 && r.bottom <= innerHeight && r.width > 30
    })
    return a ? a.getAttribute('href') : null
  })
  if (!href) { console.log('  видимой ссылки в каталог не нашлось'); await ctx.close(); continue }

  docs.length = 0
  await p.evaluate(() => { window.__lt = []; window.__mark = 'до перехода'; const h = document.querySelector('header'); if (h) h.dataset.mark = 'm' })
  const t0 = Date.now()
  await p.evaluate((h) => { const a = [...document.querySelectorAll('a[href]')].find(x => x.getAttribute('href') === h); a?.click() }, href)
  await p.waitForTimeout(9000)
  const after = await p.evaluate(() => ({
    метка: window.__mark || 'ПОТЕРЯНА (перезагрузка)',
    шапка: document.querySelector('header')?.dataset.mark === 'm' ? 'пережила' : 'пересоздана',
    lt: window.__lt.filter(d => d > 50).reduce((a, b) => a + b, 0),
    узлов: document.getElementsByTagName('*').length,
    путь: location.pathname.slice(0, 40),
  }))
  console.log(`  переход по ${href.slice(0, 40)} → ${after.путь}`)
  console.log(`  запросов документа: ${docs.length} (${docs.length ? 'ПОЛНАЯ ПЕРЕЗАГРУЗКА' : 'SPA-переход'}) | окно: ${after.метка} | шапка: ${after.шапка}`)
  console.log(`  главный поток занят при переходе: ${after.lt} мс | стало ${after.узлов} узлов | всего ${Date.now() - t0} мс`)
  await ctx.close()
}
await browser.close()

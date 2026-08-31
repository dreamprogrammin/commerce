// Что даёт отключение предзагрузки — на ЖИВОМ проде, без выкатки.
// Приём: перехватываем и отбрасываем запросы _payload.json чужих маршрутов,
// пока человек не нажал. После нажатия пропускаем — иначе переход сломается.
import { chromium } from 'playwright'

const BLOCK = process.argv.includes('--block')
const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 5)
const B = 'https://uhti.kz'

const browser = await chromium.launch()
const firstLoad = [], navHome = [], navCat = []
let bytes = 0, blocked = 0

for (let i = 0; i < N; i++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  const cdp = await ctx.newCDPSession(p)
  await cdp.send('Network.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  const byId = new Map()
  cdp.on('Network.requestWillBeSent', e => byId.set(e.requestId, true))
  cdp.on('Network.loadingFinished', (e) => { if (byId.has(e.requestId)) bytes += e.encodedDataLength })

  let allow = false
  if (BLOCK) {
    await p.route('**/_payload.json*', async (route) => {
      if (allow) return route.continue()
      // Собственный payload текущей страницы пропускаем всегда: без него
      // замер первой загрузки несравним — страница добирает данные иначе.
      // Блокируем только предзагрузку ЧУЖИХ маршрутов.
      const target = new URL(route.request().url()).pathname.replace(/_payload\.json$/, '')
      const here = new URL(p.url()).pathname.replace(/\/?$/, '/')
      if (target === here) return route.continue()
      blocked++
      await route.abort()
    })
  }

  const t0 = Date.now()
  await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await p.waitForFunction(() => [...document.querySelectorAll('h2')].some(el => el.textContent.includes('Подобрали')), { timeout: 60000 }).catch(() => {})
  firstLoad.push(Date.now() - t0)
  await p.waitForTimeout(12000)
  // прокрутка — именно она и запускает предзагрузку по видимости
  for (let y = 0; y <= 7000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(500) }
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' }))
  await p.waitForTimeout(1500)

  allow = true
  let t = Date.now()
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
  await p.waitForFunction(() => location.pathname === '/catalog' && [...document.querySelectorAll('h1,h2')].some(el => el.textContent.includes('Каталог')), { timeout: 40000 }).catch(() => {})
  navCat.push(Date.now() - t)
  await p.waitForTimeout(3000)

  t = Date.now()
  await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
  await p.waitForFunction(() => location.pathname === '/' && [...document.querySelectorAll('h2')].some(el => el.textContent.includes('Подобрали')), { timeout: 40000 }).catch(() => {})
  navHome.push(Date.now() - t)
  await ctx.close()
  process.stdout.write('.')
}
console.log('')
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
console.log(`\n${BLOCK ? 'БЕЗ предзагрузки' : 'как сейчас'} (N=${N}, прод, Slow 4G, CPU ×4)`)
console.log(`  первая загрузка до содержимого   ${med(firstLoad)} мс   ${[...firstLoad].sort((a,b)=>a-b).join(', ')}`)
console.log(`  переход → /catalog               ${med(navCat)} мс   ${[...navCat].sort((a,b)=>a-b).join(', ')}`)
console.log(`  переход → /                      ${med(navHome)} мс   ${[...navHome].sort((a,b)=>a-b).join(', ')}`)
console.log(`  трафик за сессию (среднее)       ${Math.round(bytes / N / 1024)} КБ${BLOCK ? `, отброшено предзагрузок ${blocked}` : ''}`)
await browser.close()

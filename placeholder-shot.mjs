import { chromium } from 'playwright'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(14000)
await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
await p.evaluate(() => document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click())
await p.waitForTimeout(450)
const есть = await p.evaluate(() => !!document.querySelector('.shell-placeholder'))
const верх = await p.evaluate(() => {
  const цепочка = document.elementsFromPoint(195, 40).slice(0, 6).map(n => n.tagName + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.') : ''))
  const все = [...document.querySelectorAll('nav[aria-label="Основная навигация"], [class*="tabbar" i], [class*="tab-bar" i]')].map((n) => {
    const r = n.getBoundingClientRect()
    return `${n.tagName}.${(n.className || '').toString().slice(0, 22)} top=${Math.round(r.top)}`
  })
  const nav = document.querySelector('nav[aria-label="Основная навигация"]')
  const r = nav ? nav.getBoundingClientRect() : null
  return { путь: location.pathname, слои: цепочка, панели: все, навигация: r ? `top=${Math.round(r.top)} bottom=${Math.round(r.bottom)} z=${getComputedStyle(nav).zIndex} pos=${getComputedStyle(nav).position}` : 'нет' }
})
console.log(JSON.stringify(верх, null, 1))
await p.screenshot({ path: `${SC}/ph.png` })
await p.screenshot({ path: `${SC}/ph-top.png`, clip: { x: 0, y: 0, width: 390, height: 130 } })
const проверка = await p.evaluate(() => {
  const n = document.querySelector('nav[aria-label="Основная навигация"]')
  const r = n.getBoundingClientRect()
  const cs = getComputedStyle(n)
  const p = n.parentElement
  const pcs = p ? getComputedStyle(p) : null
  return { nav: `top=${Math.round(r.top)} ${cs.position} z=${cs.zIndex} transform=${cs.transform.slice(0, 24)}`, родитель: pcs ? `${pcs.position} transform=${pcs.transform.slice(0, 24)}` : '—' }
})
console.log(JSON.stringify(проверка))
console.log(`кадр снят, заглушка на экране: ${есть ? 'да' : 'нет'}`)
await browser.close()

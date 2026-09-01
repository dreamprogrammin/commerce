/**
 * Нижняя навигация: нажатие должно работать как раньше, перетаскивание —
 * как дополнительная возможность.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const SC = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
p.on('console', (m) => { const t = m.text(); if (t.startsWith('[lens]')) console.log('   ' + t) })
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)

const состояние = () => p.evaluate(() => {
  const nav = document.querySelector('nav[aria-label="Основная навигация"]')
  const lens = nav?.querySelector('.mbn-lens')
  const pill = nav?.querySelector('.mbn-lens__pill')
  const активный = [...nav.querySelectorAll('a.mbn-item')].findIndex(a => a.getAttribute('aria-current') === 'page')
  return {
    путь: location.pathname,
    активный,
    линза: lens ? getComputedStyle(lens).transform.slice(0, 30) : '—',
    нажата: lens?.classList.contains('mbn-lens--pressed') ?? false,
    масштабЛинзы: pill ? getComputedStyle(pill).transform.slice(0, 24) : '—',
  }
})

console.log('до касания:      ' + JSON.stringify(await состояние()))

// координаты пунктов
const точки = await p.evaluate(() => [...document.querySelectorAll('nav[aria-label="Основная навигация"] a.mbn-item')].map((a) => {
  const r = a.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), href: a.getAttribute('href') }
}))

// 1) палец опустили на панель — линза должна подрасти
await p.mouse.move(точки[0].x, точки[0].y)
await p.mouse.down()
await p.waitForTimeout(260)
console.log('палец на панели: ' + JSON.stringify(await состояние()))
await p.screenshot({ path: `${SC}/lens-pressed.png`, clip: { x: 0, y: 760, width: 390, height: 84 } })

// 2) ведём к каталогу
await p.mouse.move(точки[1].x, точки[1].y, { steps: 8 })
await p.waitForTimeout(200)
console.log('ведём к каталогу:' + JSON.stringify(await состояние()))
await p.mouse.up()
await p.waitForTimeout(4000)
console.log('отпустили:       ' + JSON.stringify(await состояние()))

// 3) обычное нажатие по корзине
await p.waitForTimeout(1500)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/cart"]').click({ timeout: 20000 })
await p.waitForTimeout(4000)
console.log('обычный клик:    ' + JSON.stringify(await состояние()))
await browser.close()

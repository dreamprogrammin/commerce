// Честная плата за переход: сумма ВСЕХ задач главного потока, а не только
// длинных. Метрика longtask считает задачи от 50 мс — дробление работы на
// мелкие куски убирает её из отчёта, не ускоряя страницу.
import { chromium } from 'playwright'
const N = Number(process.argv.find(a => a.startsWith('--n='))?.slice(4) || 5)
const LABEL = process.argv.find(a => a.startsWith('--label='))?.slice(8) || 'сборка'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)

const nav = async href => {
  await p.locator(`nav[aria-label="Основная навигация"] a.mbn-item[href="${href}"]`).click({ timeout: 20000 })
  await p.waitForFunction(h => location.pathname === h, href, { timeout: 30000 }).catch(() => {})
}

const cpu = [], paint = []
for (let i = 0; i < N; i++) {
  await nav('/catalog'); await p.waitForTimeout(4500)

  const events = []
  const onData = d => events.push(...d.value)
  cdp.on('Tracing.dataCollected', onData)
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })
  const t0 = Date.now()
  await nav('/')
  // ждём, пока поток освободится
  await p.waitForTimeout(4000)
  const done = new Promise(r => cdp.once('Tracing.tracingComplete', r))
  await cdp.send('Tracing.end'); await done
  cdp.off('Tracing.dataCollected', onData)

  // сумма верхнеуровневых задач за окно
  let busy = 0
  for (const e of events) if (e.ph === 'X' && e.name === 'RunTask' && e.dur) busy += e.dur / 1000
  cpu.push(Math.round(busy))
  paint.push(Date.now() - t0)
  process.stdout.write(`${Math.round(busy)} `)
}
console.log('')
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2) }
const s = [...cpu].sort((a, b) => a - b)
console.log(`\n${LABEL}: поток занят всего — медиана ${med(cpu)} мс, разброс ${s[0]}–${s.at(-1)} мс, N=${N}`)
console.log(`отсортировано: ${s.join(', ')}`)
await browser.close()

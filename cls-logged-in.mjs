// Замер CLS главной для залогиненного на стенде h2-proxy (390px, Slow 4G, CPU ×4).
// Два прогона в одном контексте: первый — «холодный» (подсказки о высоте нет),
// второй — повторный визит, ради которого правка и делалась.
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'

const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
  cookieOptions: { name: 'sb-127-auth-token' },
  cookies: { getAll: () => [], setAll: c => jar.push(...c) },
})
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: true,
})
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {}
  window.__cls = 0
  window.__shifts = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue
      window.__cls += e.value
      window.__shifts.push({
        t: Math.round(e.startTime),
        v: +e.value.toFixed(5),
        who: e.sources?.map(s => (s.node?.className || s.node?.tagName || '?').toString().slice(0, 45)) || [],
      })
    }
  }).observe({ type: 'layout-shift', buffered: true })
})

async function run(label) {
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  await page.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.waitForTimeout(16000)

  const r = await page.evaluate(() => ({
    cls: +window.__cls.toFixed(4),
    shifts: window.__shifts,
    hint: localStorage.getItem('uhti:home-reserve'),
    reserve: getComputedStyle(document.documentElement).getPropertyValue('--active-order-reserve'),
  }))
  console.log(`\n### ${label}`)
  console.log(`CLS ${r.cls}   резерв «${r.reserve.trim() || '—'}»   подсказка ${r.hint || '—'}`)
  for (const s of r.shifts) console.log(`  ${String(s.t).padStart(5)} мс  ${String(s.v).padEnd(8)} ${s.who.join(' | ')}`)
  await page.close()
  return r
}

await run('Первый визит (подсказки нет)')
await run('Повторный визит (подсказка записана)')
await browser.close()

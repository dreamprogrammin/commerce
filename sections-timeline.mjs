// Положение секций главной во времени для залогиненного.
// CLS ловит только сдвиги внутри вьюпорта — вставки ниже экрана в него не попадают,
// хотя при скролле человек видит именно их.
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'
const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [], setAll: c => jar.push(...c) } })
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })
const browser = await chromium.launch()
const isDesktop = process.argv.includes('--desktop')
const ctx = await browser.newContext(isDesktop
  ? { viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true }
  : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
console.log(isDesktop ? 'десктоп 1280×900' : 'мобилка 390×844')
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {}
  window.__t = []
  const snap = () => {
    // ТОЛЬКО внутри .home-content: в футере лежат свои одноимённые секции
    const root = document.querySelector('.home-content')
    if (!root) return
    const rows = {}
    for (const h of root.querySelectorAll('h2, h3')) {
      const name = (h.textContent || '').trim().slice(0, 24)
      if (!name || rows[name]) continue
      rows[name] = Math.round(h.getBoundingClientRect().top + window.scrollY)
    }
    window.__t.push({ t: Math.round(performance.now()), h: Math.round(document.body.scrollHeight), rows })
    if (performance.now() < 20000) setTimeout(snap, 250)
  }
  addEventListener('DOMContentLoaded', snap)
})
// Прогревочный визит: он записывает подсказки о высоте персональных секций.
if (process.argv.includes('--warm')) {
  const w = await ctx.newPage()
  await w.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await w.waitForTimeout(14000)
  console.log('подсказки после прогрева:', await w.evaluate(() => localStorage.getItem('uhti:home-reserve')))
  await w.close()
}

const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(21000)
const t = await p.evaluate(() => window.__t)
let prev = ''
for (const s of t) {
  const key = JSON.stringify(s.rows) + s.h
  if (key === prev) continue
  prev = key
  console.log(`\n${String(s.t).padStart(5)} мс   страница ${s.h}px`)
  for (const [k, v] of Object.entries(s.rows)) console.log(`        y=${String(v).padStart(5)}  ${k}`)
}
await browser.close()

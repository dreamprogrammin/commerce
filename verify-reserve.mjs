import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import fs from 'node:fs'
const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const browser = await chromium.launch()

// --- гость ---
const g = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await g.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {}
  window.__cls = 0
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
})
const gp = await g.newPage()
const gc = await g.newCDPSession(gp)
await gc.send('Network.enable')
await gc.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
await gc.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await gp.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await gp.waitForTimeout(15000)
console.log('гость: CLS', await gp.evaluate(() => +window.__cls.toFixed(4)),
  '| слот заказа', await gp.evaluate(() => Math.round(document.querySelector('.active-order-slot')?.getBoundingClientRect().height ?? -1)) + 'px',
  '| слот избранного', await gp.evaluate(() => Math.round(document.querySelector('.wishlist-slot')?.getBoundingClientRect().height ?? -1)) + 'px',
  '| подсказка', await gp.evaluate(() => localStorage.getItem('uhti:home-reserve')))
await g.close()

// --- залогиненный, у которого избранное опустело между визитами ---
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [], setAll: c => jar.push(...c) } })
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })
const w = await ctx.newPage()
await w.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await w.waitForTimeout(13000)
console.log('после визита с избранным:', await w.evaluate(() => localStorage.getItem('uhti:home-reserve')))
await w.close()

// избранное опустошается прямо в базе, дальше — новый визит
const { execSync } = await import('node:child_process')
execSync(`sg docker -c "docker exec supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -d postgres -c \\"delete from wishlist where user_id='653f339a-250a-4e52-ba86-6adcaf6fbfa5';\\"" `, { stdio: 'ignore' })

const p2 = await ctx.newPage()
await p2.goto('https://localhost:3111/?nocache=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 180000 })
await p2.waitForTimeout(13000)
console.log('после визита с пустым избранным:', await p2.evaluate(() => localStorage.getItem('uhti:home-reserve')))
await browser.close()

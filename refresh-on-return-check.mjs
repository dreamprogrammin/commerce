/**
 * Обновляются ли личные данные при возврате на удержанную страницу.
 * Считаем запросы к профилю и заказам отдельно на каждом этапе.
 */
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
// Сессия на ЛОКАЛЬНОЙ базе: проверяем личные данные, а заводить сессию на
// проде нельзя.
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

let phase = 'первый визит'
const hits = []
p.on('console', (m) => { const t = m.text(); if (t.includes('[refresh]')) console.log(`      ${phase} → ${t}`) })
p.on('request', (r) => {
  const u = r.url()
  if (!u.includes('/rest/v1/')) return
  const t = u.includes('/profiles') ? 'профиль' : u.includes('/orders') ? 'заказы' : null
  if (t) hits.push({ phase, t })
})
const report = (name) => {
  const rows = hits.filter(h => h.phase === name)
  const prof = rows.filter(h => h.t === 'профиль').length
  const ord = rows.filter(h => h.t === 'заказы').length
  console.log(`  ${name.padEnd(18)} профиль ${prof}, заказы ${ord}`)
}

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
report('первый визит')

phase = 'уход в каталог'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
report('уход в каталог')

phase = 'ВОЗВРАТ'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(7000)
report('ВОЗВРАТ')
const who = await p.evaluate(() => document.body.innerText.includes('Войти') ? 'гость' : 'залогинен')
console.log(`\nсостояние: ${who}`)
await browser.close()

// Корзина при удержании: обновляется ли счётчик, если товар положен с другой
// страницы, и виден ли он на удержанной главной после возврата.
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [], setAll: c => jar.push(...c) } })
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const badge = () => p.evaluate(() => {
  const el = document.querySelector('nav[aria-label="Основная навигация"] a.mbn-item[href="/cart"]')
  const t = (el?.textContent || '').replace(/\s+/g, '')
  const m = t.match(/(\d+)/)
  return m ? m[1] : '0'
})

await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
console.log(`на главной, в корзине: ${await badge()}`)

// прокручиваем к ленте: кнопки «в корзину» ниже первого экрана
await p.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find(el => el.textContent.includes('Подобрали'))
  if (h) h.scrollIntoView({ block: 'start' })
})
await p.waitForTimeout(1500)
// кладём товар прямо с главной (удержанной страницы)
const i = await p.evaluate(() => [...document.querySelectorAll('button.pc-add')].findIndex((el) => {
  const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
}))
if (i >= 0) { await p.locator('button.pc-add').nth(i).click({ timeout: 20000 }); await p.waitForTimeout(2500) }
else { console.log('  (кнопка «в корзину» в кадре не найдена)') }
console.log(`положили с главной:    ${await badge()}`)

await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' })); await p.waitForTimeout(400)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(1000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)
console.log(`в каталоге:            ${await badge()}`)

await p.waitForTimeout(1500)
// кладём ещё один уже из каталога
const j = await p.evaluate(() => [...document.querySelectorAll('button.pc-add')].findIndex((el) => {
  const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0
}))
if (j >= 0) { await p.locator('button.pc-add').nth(j).click({ timeout: 20000 }); await p.waitForTimeout(2500) }
else { console.log('  (кнопка «в корзину» в кадре не найдена)') }
console.log(`положили из каталога:  ${await badge()}`)

await p.evaluate(() => scrollTo({ top: 1400, behavior: 'instant' })); await p.waitForTimeout(400)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(1000)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
console.log(`вернулись на главную:  ${await badge()}   ← должно совпасть с предыдущим`)
await browser.close()

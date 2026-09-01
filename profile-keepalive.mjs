// Переживает ли оболочка переход в личный кабинет (нужна сессия).
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
await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
await p.evaluate(() => {
  const el = document.querySelector('main')?.parentElement
  if (el) el.dataset.probe = 'оболочка'
  const page = document.querySelector('.home-content')
  if (page) page.dataset.probePage = 'страница'
})
await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/profile"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
const s1 = await p.evaluate(() => ({
  путь: location.pathname,
  оболочка: document.querySelector('main')?.parentElement?.dataset.probe === 'оболочка',
}))
console.log(`после перехода в профиль: путь ${s1.путь}, оболочка ${s1.оболочка ? 'ПЕРЕЖИЛА' : 'пересоздана'}`)
await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(600)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
const s2 = await p.evaluate(() => ({
  путь: location.pathname,
  оболочка: document.querySelector('main')?.parentElement?.dataset.probe === 'оболочка',
  страница: document.querySelector('.home-content')?.dataset.probePage === 'страница',
}))
console.log(`вернулись на главную:     путь ${s2.путь}, оболочка ${s2.оболочка ? 'ПЕРЕЖИЛА' : 'пересоздана'}, страница ${s2.страница ? 'УДЕРЖАНА' : 'пересоздана'}`)
await browser.close()

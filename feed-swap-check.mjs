// Проверка правила подмены ленты «Подобрали для вас».
// Гостевая лента ведёт на /catalog/all?sort_by=newest, персональная — на ?recommended=true.
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())) } catch {} })

async function feedKind(page) {
  return await page.evaluate(() => {
    const links = [...document.querySelectorAll('.home-content a[href*="/catalog/all"]')].map(a => a.getAttribute('href'))
    if (links.some(h => h.includes('recommended=true'))) return 'персональная'
    if (links.some(h => h.includes('sort_by=newest'))) return 'новинки (серверная)'
    return 'ленты нет'
  })
}

async function scenario(label, act) {
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await page.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
  await act(page)
  await page.waitForTimeout(15000)
  console.log(`${label}: ${await feedKind(page)}`)
  await page.close()
}

await scenario('А. Не листал (обычный путь)      ', async () => {})
await scenario('Б. Долистал до ленты и остался   ', async (p) => {
  await p.waitForTimeout(1500)
  await p.evaluate(() => window.scrollTo(0, 700))
})
await scenario('В. Пролистал ленту далеко вниз   ', async (p) => {
  await p.waitForTimeout(1500)
  await p.evaluate(() => window.scrollTo(0, 3000))
})
await browser.close()

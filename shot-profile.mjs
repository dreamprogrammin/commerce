// Снимки страниц профиля залогиненным — для сверки «до/после».
// Только локальная база: на проде сессию заводить нельзя.
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'
const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const TAG = process.argv.find(a => a.startsWith('--tag='))?.slice(6) || 'pr'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [], setAll: c => jar.push(...c) } })
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })

const browser = await chromium.launch()
for (const [w, h, dpr, name] of [[390, 844, 3, 'mob'], [1280, 900, 2, 'desk']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: w < 900, hasTouch: w < 900, ignoreHTTPSErrors: true })
  await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
  await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
  const p = await ctx.newPage()
  for (const [path, slug] of [['/profile', 'index'], ['/profile/wishlist', 'wishlist'], ['/profile/settings', 'settings'], ['/profile/bonuses', 'bonuses'], ['/profile/children', 'children']]) {
    await p.goto('https://localhost:3111' + path, { waitUntil: 'domcontentloaded', timeout: 180000 })
    await p.waitForTimeout(9000)
    const m = await p.evaluate(() => ({
      h: Math.round(document.documentElement.scrollHeight),
      залогинен: !document.body.innerText.includes('Проверка авторизации'),
      main: (() => { const el = document.querySelector('main'); if (!el) return null; const c = getComputedStyle(el); return `pt${c.paddingTop} pb${c.paddingBottom}` })(),
    }))
    await p.screenshot({ path: `${S}/${TAG}-${name}-${slug}.png` })
    console.log(`${name.padEnd(5)} ${path.padEnd(20)} высота ${String(m.h).padStart(5)}  main ${m.main}  ${m.залогинен ? '' : 'НЕ ЗАЛОГИНЕН'}`)
  }
  await ctx.close()
}
await browser.close()

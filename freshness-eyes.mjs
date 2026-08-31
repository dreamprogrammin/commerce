/**
 * Проверка глазами: обновляются ли личные данные при возврате на удержанную
 * страницу — так, как это увидит покупатель.
 *
 * Меняем баланс бонусов В БАЗЕ, пока человек в каталоге, и смотрим, что он
 * увидит вернувшись. Цифры в запросах это уже подтверждали; здесь важно, что
 * значение реально доезжает до экрана.
 *
 * База ЛОКАЛЬНАЯ: на проде такое не делают.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const S = '/tmp/claude-1000/-home-malik-projects-commerce/fce1d09c-dadc-46c6-9c49-deddaabffc17/scratchpad'
const OUT = process.argv.find(a => a.startsWith('--out='))?.slice(6) || `${S}/fresh`
const USER = 'fda67232-767c-48a9-a31a-eb3e22dcdb57'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const KEY = env.SUPABASE_SERVICE_ROLE_KEY.replace(/^["']|["']$/g, '')

const setBalance = (v) => {
  execSync(`curl -s -X PATCH "${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${USER}" -H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" -H "Content-Type: application/json" -H "Prefer: return=minimal" -d '{"active_bonus_balance":${v}}'`)
}

const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, {
  cookieOptions: { name: 'sb-127-auth-token' },
  cookies: { getAll: () => [], setAll: c => jar.push(...c) },
})
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })

setBalance(1234)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const shown = () => p.evaluate(() => {
  const el = document.querySelector('.loyalty')
  const txt = (el?.textContent || '').replace(/\s+/g, ' ')
  const m = txt.match(/([\d\s ]{2,})\s*бонус/i) || txt.match(/(\d[\d\s ]*)/)
  return { баланс: m ? m[1].replace(/[\s ]/g, '') : 'не найден', заказ: !!document.querySelector('.aos-card, [class*="active-order"]') }
})

await p.goto('https://localhost:3111/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(13000)
await p.evaluate(() => { const el = document.querySelector('.loyalty'); if (el) el.scrollIntoView({ block: 'center' }) })
await p.waitForTimeout(1500)
console.log('на главной, баланс в базе 1234: ' + JSON.stringify(await shown()))
await p.screenshot({ path: `${OUT}-1-before.png` })

await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(900)
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(5000)

// пока покупатель в каталоге — баланс изменился
setBalance(7777)
console.log('пока он в каталоге, баланс в базе стал 7777')

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(7000)
await p.evaluate(() => { const el = document.querySelector('.loyalty'); if (el) el.scrollIntoView({ block: 'center' }) })
await p.waitForTimeout(1500)
const after = await shown()
console.log('после возврата:                ' + JSON.stringify(after))
await p.screenshot({ path: `${OUT}-2-after.png` })
console.log(after.баланс === '7777' ? '\nОБНОВИЛОСЬ — покупатель видит свежее значение' : `\nНЕ обновилось: на экране ${after.баланс}`)
setBalance(0)
await browser.close()

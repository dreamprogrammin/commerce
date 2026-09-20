import os from 'node:os'
import process from 'node:process'
import fs from 'node:fs'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

// Куда класть скриншоты и журналы: SC из окружения, иначе системный tmp.
const SCRATCH = process.env.SC || os.tmpdir()

const S = `${SCRATCH}`
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const sess = JSON.parse(fs.readFileSync(`${S}/session.json`, 'utf8'))
const jar = []
const sb = createServerClient(env.SUPABASE_URL, env.SUPABASE_KEY, { cookieOptions: { name: 'sb-127-auth-token' }, cookies: { getAll: () => [], setAll: c => jar.push(...c) } })
await sb.auth.setSession({ access_token: sess.access_token, refresh_token: sess.refresh_token })
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })
await ctx.addCookies(jar.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
const p = await ctx.newPage()
await p.goto('https://localhost:3111/profile/settings', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(9000)
const r = await p.evaluate(() => {
  const box = el => el ? Math.round(el.getBoundingClientRect().height) : null
  const main = document.querySelector('main')
  const shell = document.querySelector('.profile-shell')
  return {
    документ: Math.round(document.documentElement.scrollHeight),
    main: box(main),
    profileShell: box(shell),
    корень: box(document.querySelector('main')?.parentElement),
  }
})
console.log(JSON.stringify(r, null, 0))
await browser.close()

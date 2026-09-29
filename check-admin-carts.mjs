/*
 * Админка «Корзины»: доступ и содержимое — только на ЛОКАЛЬНОЙ базе.
 *
 * Почему это проверяется (29 сентября 2026). Страница показывает имена,
 * телефоны и email покупателей с брошенными корзинами — данные читаются
 * ключом сервиса в обход RLS. Значит, главное — что их не получит никто,
 * кроме администратора. Проверяет:
 *  1) гость — 401 на оба маршрута;
 *  2) вошедший не-администратор — 403;
 *  3) администратор — список корзин с товарами и сводка Google Analytics
 *     (если ключ GA задан на стенде), страница рисуется без ошибок консоли.
 *
 * Вход — рецепт из docs/HANDOFF.md: пароль выдаётся существующему
 * пользователю ключом сервиса, куки собирает @supabase/ssr.
 *
 *   node check-admin-carts.mjs --base=http://localhost:3141
 *
 * Стенд: сборка на локальной базе, NUXT_SUPABASE_SERVICE_ROLE_KEY — локальный
 * ключ сервиса; для блока GA — NUXT_GA_SERVICE_ACCOUNT (JSON ключа).
 */
import process from 'node:process'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж выдаёт пароли пользователям базы')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

async function rest(path) {
  return (await fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).json()
}

/** Куки сессии пользователя с данной ролью. */
async function sessionCookies(role) {
  const [profile] = await rest(`profiles?select=id&role=${role === 'admin' ? 'eq' : 'neq'}.admin&limit=1`)
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profile.id}`, {
    method: 'PUT',
    headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })).json()
  const cookies = []
  // storageKey — как в nuxt.config.ts (supabase.clientOptions.auth): под этим
  // именем сайт хранит сессию в куке, и сервер ищет её там же
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { error } = await ssr.auth.signInWithPassword({ email: user.email, password: PASSWORD })
  if (error)
    throw new Error(`${role}: ${error.message}`)
  return cookies
}

const header = cookies => cookies.map(c => `${c.name}=${c.value}`).join('; ')
async function status(path, cookies) {
  return (await fetch(`${BASE}${path}`, { headers: cookies ? { cookie: header(cookies) } : {} })).status
}

console.log(`стенд ${BASE}`)
console.log('\n== доступ')
for (const path of ['/api/admin/abandoned-carts', '/api/admin/cart-analytics'])
  check(await status(path) === 401, `гость: ${path} — 401`)
const userCookies = await sessionCookies('user')
for (const path of ['/api/admin/abandoned-carts', '/api/admin/cart-analytics'])
  check(await status(path, userCookies) === 403, `не-администратор: ${path} — 403`)

console.log('\n== администратор')
const adminCookies = await sessionCookies('admin')
const carts = await (await fetch(`${BASE}/api/admin/abandoned-carts`, { headers: { cookie: header(adminCookies) } })).json()
const inDb = (await rest('server_carts?select=items')).filter(c => Array.isArray(c.items) && c.items.length).length
check(Array.isArray(carts) && carts.length === inDb, `корзин с товарами: ${carts.length}, в базе ${inDb}`)
check(carts.every(c => c.items.length && c.items.every(i => i.name && i.quantity > 0)), 'у каждой корзины названия товаров и количество')
check(carts.some(c => c.email), `email достаётся из учётной записи: ${carts.filter(c => c.email).length} из ${carts.length}`)
const gaRes = await fetch(`${BASE}/api/admin/cart-analytics?days=90`, { headers: { cookie: header(adminCookies) } })
const ga = await gaRes.json()
check(gaRes.ok, `сводка GA отвечает: ${gaRes.status}${gaRes.ok ? '' : ` — ${ga.message}`}`)
if (ga.configured) {
  check(ga.funnel?.length === 7, `сводка GA: 7 шагов воронки (${ga.funnel?.map(f => `${f.event} ${f.users}`).join(', ')})`)
  check(Array.isArray(ga.items), `товаров, добавленных в корзину, за 90 дней: ${ga.items?.length}`)
}
else if (ga.configured === false) {
  console.log('  —   ключ GA на стенде не задан, сводка не проверялась')
}

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(adminCookies.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
  await page.goto(`${BASE}/admin/carts`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForTimeout(4000)
  const text = await page.evaluate(() => document.body.innerText)
  check(text.includes('Брошенные корзины') && text.includes('Что добавляют в корзину'), 'страница: оба блока на месте')
  check(!carts[0] || text.includes(carts[0].items[0].name), 'страница: товары корзины видны')
  check(!ga.configured || text.includes('Добавили в корзину'), 'страница: воронка GA нарисована')
  check(!errors.length, `страница без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 120)}` : ''}`)
  if (process.env.SHOT)
    await page.screenshot({ path: process.env.SHOT, fullPage: true })
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

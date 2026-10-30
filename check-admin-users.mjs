/*
 * Админка «Пользователи»: доступ и содержимое — только на ЛОКАЛЬНОЙ базе.
 *
 * Страница показывает телефоны, email, заказы и историю бонусов покупателей —
 * данные читаются ключом сервиса в обход RLS. Проверяет:
 *  1) гость — 401, вошедший не-администратор — 403 на оба маршрута;
 *  2) администратор — список совпадает с базой: число профилей, заказов и
 *     сумма выкупленного у каждого; карточка — все заказы и операции бонусов;
 *  3) страницы рисуются без ошибок консоли, поиск по телефону находит человека;
 *  4) ручное начисление бонусов: гость и не-администратор — отказ, неверная
 *     сумма и пустая причина — 400; через окно в карточке баланс растёт сразу,
 *     в истории строка «Начислено вручную» с причиной и тем, кто начислил.
 *     ВНИМАНИЕ: начисляет настоящие бонусы в локальной базе.
 *
 * Вход — рецепт из docs/HANDOFF.md: пароль выдаётся существующему
 * пользователю ключом сервиса, куки собирает @supabase/ssr.
 *
 *   node check-admin-users.mjs --base=http://localhost:3141
 *
 * Стенд: сборка на локальной базе, NUXT_SUPABASE_SERVICE_ROLE_KEY — локальный
 * ключ сервиса.
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

/** Вход пользователем с данной ролью: куки для браузера и токен для маршрутов. */
async function signIn(role) {
  const [profile] = await rest(`profiles?select=id&role=${role === 'admin' ? 'eq' : 'neq'}.admin&limit=1`)
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profile.id}`, {
    method: 'PUT',
    headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })).json()
  const cookies = []
  // storageKey — как в nuxt.config.ts (supabase.clientOptions.auth)
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { data, error } = await ssr.auth.signInWithPassword({ email: user.email, password: PASSWORD })
  if (error)
    throw new Error(`${role}: ${error.message}`)
  return { cookies, token: data.session.access_token }
}

async function api(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  return { status: res.status, body: res.ok ? await res.json() : null }
}

console.log(`стенд ${BASE}`)
const [anyProfile] = await rest('profiles?select=id&limit=1')
const paths = ['/api/admin/users', `/api/admin/users/${anyProfile.id}`]

console.log('\n== доступ')
for (const path of paths)
  check((await api(path)).status === 401, `гость: ${path} — 401`)
const user = await signIn('user')
for (const path of paths)
  check((await api(path, user.token)).status === 403, `не-администратор: ${path} — 403`)

console.log('\n== список')
const admin = await signIn('admin')
const { body: list } = await api('/api/admin/users', admin.token)
const profiles = await rest('profiles?select=id')
const orders = await rest('orders?select=user_id,status,final_amount')
check(list?.length === profiles.length, `пользователей: ${list?.length}, в базе ${profiles.length}`)
let mismatches = 0
for (const u of list ?? []) {
  const own = orders.filter(o => o.user_id === u.id)
  const active = own.filter(o => o.status !== 'cancelled').length
  const spent = own.filter(o => ['delivered', 'completed'].includes(o.status)).reduce((s, o) => s + Number(o.final_amount), 0)
  if (u.orders !== active || u.spent !== spent)
    mismatches++
}
check(mismatches === 0, `заказы и выкуплено совпадают с базой у всех (${mismatches} расхождений)`)
check(list?.some(u => u.email), `email из учётной записи: ${list?.filter(u => u.email).length} из ${list?.length}`)

console.log('\n== карточка')
const richest = [...(list ?? [])].sort((a, b) => (b.orders + b.cancelled) - (a.orders + a.cancelled))[0]
const { body: card } = await api(`/api/admin/users/${richest.id}`, admin.token)
const cardOrders = orders.filter(o => o.user_id === richest.id).length
const cardBonuses = (await rest(`bonus_transactions?select=id&or=(user_id.eq.${richest.id},profile_id.eq.${richest.id})`)).length
check(card?.orders.length === cardOrders, `${richest.name ?? richest.id}: заказов ${card?.orders.length}, в базе ${cardOrders}`)
check(card?.bonuses.length === cardBonuses, `операций бонусов ${card?.bonuses.length}, в базе ${cardBonuses}`)
check(card?.orders.every(o => o.items.every(i => i.name && i.quantity > 0)), 'у заказов есть состав с названиями')
check((await api('/api/admin/users/00000000-0000-0000-0000-000000000000', admin.token)).status === 404, 'несуществующий — 404')

console.log('\n== ручное начисление: доступ и проверки')
async function post(path, token, body) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const bonusPath = `/api/admin/users/${richest.id}/bonus`
check((await post(bonusPath, null, { amount: 10, reason: 'проверка' })).status === 401, 'гость — 401')
check((await post(bonusPath, user.token, { amount: 10, reason: 'проверка' })).status === 403, 'не-администратор — 403')
check((await post(bonusPath, admin.token, { amount: 0, reason: 'проверка' })).status === 400, 'сумма 0 — 400')
check((await post(bonusPath, admin.token, { amount: 10.5, reason: 'проверка' })).status === 400, 'дробная сумма — 400')
check((await post(bonusPath, admin.token, { amount: 10, reason: ' ' })).status === 400, 'без причины — 400')
const [before] = await rest(`profiles?select=active_bonus_balance&id=eq.${richest.id}`)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  // Браузерный клиент читает сессию из `sb-127-auth-token`, сервер — из `supabase-auth-token`
  await ctx.addCookies([
    ...admin.cookies,
    ...admin.cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') })),
  ].map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))

  await page.goto(`${BASE}/admin/users`, { waitUntil: 'load', timeout: 120000 })
  await page.getByText('Покупатель', { exact: true }).waitFor({ timeout: 30000 })
  const rows = await page.locator('tbody tr').count()
  check(rows === list.length, `страница списка: строк ${rows}`)
  const withPhone = list.find(u => u.phone)
  if (withPhone) {
    const digits = withPhone.phone.replace(/\D/g, '').slice(-7)
    await page.getByPlaceholder('Имя, телефон или email').fill(digits)
    await page.waitForTimeout(300)
    const found = await page.locator('tbody tr').allInnerTexts()
    check(found.length >= 1 && found.some(t => t.includes(withPhone.phone)), `поиск по «${digits}»: найдено ${found.length}`)
  }
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-list.png`, fullPage: true })

  await page.goto(`${BASE}/admin/users/${richest.id}`, { waitUntil: 'load', timeout: 120000 })
  await page.getByText('История бонусов').waitFor({ timeout: 30000 })
  const text = await page.evaluate(() => document.body.innerText)
  check(text.includes('Заказы') && text.includes('История бонусов'), 'карточка: оба блока на месте')
  const withItems = card.orders.find(o => o.items.length)
  const flat = t => t.replace(/\s+/g, ' ')
  check(!withItems || flat(text).includes(flat(withItems.items[0].name).slice(0, 40)), 'карточка: состав заказа виден')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-card.png`, fullPage: true })

  // Начисление через окно
  const reason = `Проверка стража ${Date.now()}`
  await page.getByRole('button', { name: 'Начислить бонусы' }).click()
  await page.getByLabel('Сколько бонусов').fill('125')
  await page.getByLabel('Причина').fill(reason)
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-bonus-dialog.png` })
  await page.getByRole('button', { name: 'Начислить', exact: true }).click()
  await page.getByText(reason).waitFor({ timeout: 30000 })
  const [after] = await rest(`profiles?select=active_bonus_balance&id=eq.${richest.id}`)
  check(after.active_bonus_balance === before.active_bonus_balance + 125, `баланс ${before.active_bonus_balance} → ${after.active_bonus_balance}, доступно сразу`)
  const [tx] = await rest(`bonus_transactions?select=transaction_type,amount,balance_after,metadata&description=eq.${encodeURIComponent(reason)}`)
  check(tx?.transaction_type === 'manual' && tx?.amount === 125 && tx?.balance_after === after.active_bonus_balance, `история: ${tx?.transaction_type} ${tx?.amount}, баланс после ${tx?.balance_after}`)
  check(Boolean(tx?.metadata?.admin_id), 'в истории записано, кто начислил')
  const cardAfter = await page.evaluate(() => document.body.innerText)
  check(cardAfter.includes('Начислено вручную') && cardAfter.includes(reason), 'карточка: строка «Начислено вручную» с причиной')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-card-after.png`, fullPage: true })
  check(!errors.length, `страницы без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

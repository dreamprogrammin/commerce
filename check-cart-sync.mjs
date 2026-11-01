/*
 * Корзина вошедшего в разных браузерах (1.11.2026) — только ЛОКАЛЬНЫЙ стенд.
 *
 * Владелец: «с другого браузера добавил товары — в моём браузере их нет в
 * корзине, а в Telegram приходят уведомления, что эти товары есть». Серверную
 * корзину (`server_carts`, по ней напоминает бот) браузер читал только при входе
 * (SIGNED_IN); уже вошедший (INITIAL_SESSION) её не читал, а любая его правка
 * перезаписывала сервер своим содержимым.
 *
 * Три браузера (контекста) под одним аккаунтом проверяют:
 *  1) положил в A — B после перезагрузки видит товар;
 *  2) убрал в A — в B товар не воскресает и на сервер не возвращается;
 *  3) положил в A — B видит его, вернувшись на вкладку (visibilitychange), без перезагрузки;
 *  4) вход в C с гостевой корзиной — объединение с серверной, как и раньше;
 *     A после перезагрузки видит объединённую;
 *  5) без ответов 406 на server_carts (читалась через .single()), без ошибок консоли.
 *
 * Данные: пользователь через GoTrue, товары — первые карточки /catalog/all.
 * В конце удаляются пользователь, его серверная корзина и гостевые корзины прогона.
 *
 *   node check-cart-sync.mjs --base=http://localhost:3141
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартный демо-ключ локального Supabase — публичный
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'ProbaPassword123!'
const CART_KEY = 'uhti-cart-v1'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователя и пишет корзины в базу')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

const serviceHeaders = { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const email = `cart-sync-${Date.now()}@example.test`
const startedAt = new Date().toISOString()
let userId = null

async function serverIds() {
  const res = await fetch(`${SUPA}/rest/v1/server_carts?select=items&user_id=eq.${userId}`, { headers: serviceHeaders })
  const [row] = await res.json()
  return (row?.items ?? []).map(i => i.product_id).sort()
}

const browser = await chromium.launch()
const errors = []
const statuses406 = []
async function newBrowser(name) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  // Окно подписки на Telegram — как будто в нём уже нажали «Не сейчас»
  await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`))
  page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(`${name}: ${m.text()}`))
  page.on('response', r => r.status() === 406 && r.url().includes('/server_carts') && statuses406.push(`${name}: ${r.url()}`))
  return page
}
async function open(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
  await page.waitForTimeout(500)
}
async function login(page) {
  await open(page, '/about')
  const error = await page.evaluate(async ({ email, password }) => {
    const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
    const { error } = await nuxt.$supabase.client.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, { email, password: PASSWORD })
  if (error)
    throw new Error(`вход: ${error}`)
  await page.waitForTimeout(2500)
}
const cartIds = page => page.evaluate(key => (JSON.parse(localStorage.getItem(key) || '{}').items || []).map(i => i.product?.id).filter(Boolean).sort(), CART_KEY)
async function addNth(page, n) {
  await open(page, '/catalog/all')
  const before = await cartIds(page)
  await page.locator('button.pc-add').nth(n).click({ timeout: 30000 })
  await page.waitForTimeout(2000)
  return (await cartIds(page)).find(id => !before.includes(id))
}

try {
  const res = await fetch(`${SUPA}/auth/v1/admin/users`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  userId = (await res.json()).id
  if (!userId)
    throw new Error('пользователь не заведён')

  const A = await newBrowser('A')
  const B = await newBrowser('B')
  await login(A)
  await login(B)

  console.log('\n== положил в A — видно в B')
  const p1 = await addNth(A, 0)
  check(same(await serverIds(), [p1]), 'A положил товар — он на сервере')
  await open(B, '/about')
  await B.waitForTimeout(2000)
  check(same(await cartIds(B), [p1]), 'B после перезагрузки видит товар из A')

  console.log('\n== убрал в A — в B не воскресает')
  await open(A, '/cart')
  await A.getByRole('button', { name: 'Убрать из корзины' }).first().click()
  await A.waitForTimeout(2000)
  check(same(await serverIds(), []), 'A убрал товар — на сервере пусто')
  await open(B, '/about')
  await B.waitForTimeout(2500)
  check(same(await cartIds(B), []), 'B после перезагрузки — корзина пуста')
  check(same(await serverIds(), []), 'B не вернул убранный товар на сервер')

  console.log('\n== вернулся на вкладку — без перезагрузки')
  const p2 = await addNth(A, 1)
  await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await B.waitForTimeout(2500)
  check(same(await cartIds(B), [p2]), 'B, вернувшись на вкладку, видит новый товар из A')

  console.log('\n== вход с гостевой корзиной — объединение')
  const C = await newBrowser('C')
  const p3 = await addNth(C, 2)
  await login(C)
  check(same(await cartIds(C), [p2, p3]), 'C: гостевой товар и товар с сервера — оба в корзине')
  check(same(await serverIds(), [p2, p3]), 'на сервере — объединённая корзина')
  await open(A, '/about')
  await A.waitForTimeout(2500)
  check(same(await cartIds(A), [p2, p3]), 'A после перезагрузки видит объединённую')

  check(!statuses406.length, `без ответов 406 на server_carts${statuses406.length ? ` — ${statuses406[0]}` : ''}`)
  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
}
finally {
  await browser.close()
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', `uid=${userId ?? '00000000-0000-0000-0000-000000000000'}`, '-v', `since=${startedAt}`], {
    input: `DELETE FROM public.server_carts WHERE user_id = :'uid'; DELETE FROM public.guest_carts WHERE created_at >= :'since';`,
    encoding: 'utf8',
  })
  if (userId)
    await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

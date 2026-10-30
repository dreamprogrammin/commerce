/*
 * Карточки магазина: касса заводит карточку по телефону, продаёт на неё,
 * карточка видна в «Пользователях», администратор объединяет её с аккаунтом.
 * Только ЛОКАЛЬНАЯ база с миграцией 20261030150000_offline_customers.
 *
 * Почему это проверяется (30 октября 2026). Покупатель без аккаунта раньше
 * уходил из кассы анонимным: ни истории, ни бонусов. Слияние — кнопкой, не
 * автоматически: телефон в профиле сайта никто не подтверждает. Проверяет:
 *  1) касса: неизвестный номер → «Завести карточку» → продажа на карточку,
 *     чек; в базе заказ без user_id с offline_customer_id, бонусы на карточке;
 *  2) маршрут слияния: гость — 401, не-администратор — 403;
 *  3) «Пользователи»: карточка с пометкой «Магазин»; у аккаунта с тем же
 *     номером — «есть карточка магазина»; «Объединить» переносит покупки и
 *     бонусы, карточка закрыта.
 *
 *   node check-admin-offline-customers.mjs --base=http://localhost:3141
 *
 * ВНИМАНИЕ: оформляет продажу, заводит учётную запись и карточку в локальной базе.
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
  throw new Error('Только локальный стенд: страж оформляет продажу и выдаёт пароли')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const service = { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function rest(path, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { ...service, Prefer: 'return=representation' }, ...init })
  return res.status === 204 ? null : res.json()
}

/** Вход: куки браузера (обе — для клиента и для сервера) и токен для маршрутов. */
async function signIn(profileId) {
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profileId}`, {
    method: 'PUT',
    headers: service,
    body: JSON.stringify({ password: PASSWORD }),
  })).json()
  const cookies = []
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { data, error } = await ssr.auth.signInWithPassword({ email: user.email, password: PASSWORD })
  if (error)
    throw new Error(error.message)
  const browserCookies = [...cookies, ...cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') }))]
    .map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' }))
  return { cookies: browserCookies, token: data.session.access_token }
}

const stamp = Date.now()
// Номер, которого точно нет: 8 (705) + 7 цифр от времени
const phone = `8705${String(stamp).slice(-7)}`
const digits = `7${phone.slice(1)}`
const firstName = `Проверка${String(stamp).slice(-4)}`

const [adminProfile] = await rest('profiles?select=id&role=eq.admin&limit=1')
const admin = await signIn(adminProfile.id)
const [product] = await rest('products?select=id,name,price,final_price,stock_quantity,bonus_points_award&is_active=eq.true&stock_quantity=gt.3&bonus_points_award=gt.0&order=name&limit=1')
console.log(`номер ${phone}, товар: ${product.name.slice(0, 50)}`)

const browser = await chromium.launch()
const errors = []
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await ctx.addCookies(admin.cookies)
  const page = await ctx.newPage()
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
  return page
}

try {
  console.log('\n== касса: новая карточка и продажа на неё')
  const page = await newPage()
  await page.goto(`${BASE}/admin/pos`, { waitUntil: 'load', timeout: 120000 })
  await page.getByPlaceholder('Поиск по названию или штрихкоду...').first().fill(product.name.trim().slice(0, 25))
  const card = page.locator('button', { hasText: product.name.trim().slice(0, 25) }).first()
  await card.waitFor({ timeout: 30000 })
  await card.click()
  await page.getByPlaceholder('+7 (700) 000-00-00').fill(phone)
  await page.getByRole('button', { name: 'Завести карточку' }).waitFor({ timeout: 15000 })
  check(true, 'неизвестный номер — касса предлагает завести карточку')
  await page.getByLabel('Имя покупателя').fill(firstName)
  await page.getByRole('button', { name: 'Завести карточку' }).click()
  await page.getByText('карточка магазина').waitFor({ timeout: 15000 })
  check(true, 'карточка заведена и выбрана покупателем')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-pos.png` })
  await page.getByRole('button', { name: 'Оформить продажу' }).click()
  await page.getByRole('dialog').waitFor({ timeout: 30000 })
  check(true, 'чек открылся')

  const [cardRow] = await rest(`offline_customers?select=id,first_name,phone,phone_digits,active_bonus_balance,pending_bonus_balance&phone_digits=eq.${digits}`)
  check(cardRow?.first_name === firstName && cardRow?.phone_digits === digits, `в базе карточка ${cardRow?.first_name} ${cardRow?.phone}`)
  const [order] = await rest(`orders?select=id,user_id,offline_customer_id,status,source,final_amount&offline_customer_id=eq.${cardRow?.id}`)
  check(order && order.user_id === null && order.status === 'completed' && order.source === 'offline', `заказ на карточке: user_id ${order?.user_id}, ${order?.status}/${order?.source}`)
  check(Number(order?.final_amount) === Number(product.final_price ?? product.price), `сумма ${order?.final_amount} — цена со скидкой`)
  check(cardRow?.active_bonus_balance === 1000 && cardRow?.pending_bonus_balance === product.bonus_points_award, `бонусы карточки: доступно ${cardRow?.active_bonus_balance} (приветственные), ждут ${cardRow?.pending_bonus_balance}`)

  console.log('\n== слияние: доступ')
  // Аккаунт «вошёл через Google» и вписал тот же номер
  const created = await (await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST',
    headers: service,
    body: JSON.stringify({ email: `merge-${stamp}@uhti.local`, password: PASSWORD, email_confirm: true }),
  })).json()
  await rest(`profiles?id=eq.${created.id}`, { method: 'PATCH', body: JSON.stringify({ first_name: 'Аккаунт', phone: `+7 ${digits.slice(1, 4)} ${digits.slice(4)}` }) })
  const account = await signIn(created.id)
  const merge = token => fetch(`${BASE}/api/admin/users/${created.id}/merge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ offlineCustomerId: cardRow.id }),
  }).then(r => r.status)
  check(await merge(null) === 401, 'гость — 401')
  check(await merge(account.token) === 403, 'сам покупатель (не-администратор) — 403')

  console.log('\n== «Пользователи»')
  await page.goto(`${BASE}/admin/users`, { waitUntil: 'load', timeout: 120000 })
  await page.getByPlaceholder('Имя, телефон или email').fill(digits.slice(1))
  const cardLine = page.locator('tr', { hasText: firstName })
  await cardLine.waitFor({ timeout: 30000 })
  check(await cardLine.getByText('Магазин').count() === 1, 'карточка в списке с пометкой «Магазин»')
  const accountLine = page.locator('tr', { hasText: 'Аккаунт' })
  check(await accountLine.getByText('есть карточка магазина').count() === 1, 'у аккаунта — «есть карточка магазина»')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-list.png` })

  await page.goto(`${BASE}/admin/users/${created.id}`, { waitUntil: 'load', timeout: 120000 })
  await page.getByText('Есть карточка магазина с тем же телефоном').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Объединить' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Объединить' }).click()
  await page.getByText('с карточки').waitFor({ timeout: 30000 })
  check(true, 'после объединения заказ в аккаунте с пометкой «с карточки»')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-merged.png`, fullPage: true })

  const [after] = await rest(`profiles?select=active_bonus_balance,pending_bonus_balance&id=eq.${created.id}`)
  const [closed] = await rest(`offline_customers?select=merged_into,merged_by,active_bonus_balance,pending_bonus_balance&id=eq.${cardRow.id}`)
  const [moved] = await rest(`orders?select=user_id&id=eq.${order.id}`)
  check(moved?.user_id === created.id, 'заказ перешёл в аккаунт')
  check(after?.active_bonus_balance === cardRow.active_bonus_balance && after?.pending_bonus_balance === cardRow.pending_bonus_balance, `бонусы в аккаунте: ${after?.active_bonus_balance} + ${after?.pending_bonus_balance} ждут`)
  check(closed?.merged_into === created.id && closed?.merged_by === adminProfile.id && closed?.active_bonus_balance === 0, 'карточка закрыта: куда и кто объединил записано, баланс обнулён')
  check(await merge(admin.token) === 400, 'повторное объединение — 400')
  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

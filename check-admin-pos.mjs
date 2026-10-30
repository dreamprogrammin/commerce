/*
 * Офлайн-касса: продажа покупателю по цене со скидкой — только на ЛОКАЛЬНОЙ
 * базе с применённой миграцией 20261030120000_pos_offline_sale_fix.
 *
 * Почему это проверяется (30 октября 2026). До миграции продажа с привязанным
 * покупателем падала («колонки price_per_item нет»), касса считала без
 * скидки, а бонусы за покупку не активировались бы никогда. Проверяет:
 *  1) поиск показывает цену со скидкой и зачёркнутую полную;
 *  2) продажа покупателю проходит, чек открывается;
 *  3) в базе: заказ `completed` / `offline`, позиция по цене со скидкой,
 *     бонусы в истории, остаток уменьшился.
 *
 *   node check-admin-pos.mjs --base=http://localhost:3141
 *
 * ВНИМАНИЕ: оформляет настоящую продажу в локальной базе.
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

async function rest(path) {
  return (await fetch(`${SUPA}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).json()
}

async function adminCookies() {
  const [profile] = await rest('profiles?select=id&role=eq.admin&limit=1')
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profile.id}`, {
    method: 'PUT',
    headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: PASSWORD }),
  })).json()
  const cookies = []
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { error } = await ssr.auth.signInWithPassword({ email: user.email, password: PASSWORD })
  if (error)
    throw new Error(error.message)
  return cookies
}

// Товар со скидкой и запасом остатка; покупатель с телефоном, не админ
const [product] = await rest('products?select=id,name,price,final_price,stock_quantity&is_active=eq.true&stock_quantity=gt.3&order=name&limit=200')
  .then(list => list.filter(p => Number(p.final_price) < Number(p.price)))
const [customer] = await rest('profiles?select=id,phone,active_bonus_balance,pending_bonus_balance&role=neq.admin&phone=not.is.null&limit=1')
console.log(`товар: ${product.name.slice(0, 60)} — ${product.final_price} вместо ${product.price}`)
console.log(`покупатель: ${customer.phone}`)

const browser = await chromium.launch()
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  // Браузерный клиент читает сессию из `sb-127-auth-token` (имя по адресу
  // локального Supabase), сервер — из `supabase-auth-token`; нужны обе
  const cookies = await adminCookies()
  await ctx.addCookies([
    ...cookies,
    ...cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') })),
  ].map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))

  await page.goto(`${BASE}/admin/pos`, { waitUntil: 'load', timeout: 120000 })
  await page.getByPlaceholder('Поиск по названию или штрихкоду...').first().fill(product.name.slice(0, 25))
  const card = page.locator('button', { hasText: product.name.slice(0, 25) }).first()
  await card.waitFor({ timeout: 30000 })
  const cardText = (await card.innerText()).replace(/\s+/g, ' ')
  const fmt = n => new Intl.NumberFormat('ru-RU').format(Number(n)).replace(/\s/g, ' ')
  check(cardText.replace(/\s/g, ' ').includes(fmt(product.final_price)), `карточка поиска: цена со скидкой ${fmt(product.final_price)}`)
  check(await card.locator('s').count() === 1, 'карточка поиска: полная цена зачёркнута')
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-search.png` })
  await card.click()

  await page.getByPlaceholder('+7 (700) 000-00-00').fill(customer.phone)
  await page.waitForTimeout(2500)
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-before.png` })
  await page.getByRole('button', { name: 'Оформить продажу' }).click()
  await page.getByRole('dialog').waitFor({ timeout: 30000 }).catch(async (e) => {
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-fail.png` })
    console.log('ошибки:', JSON.stringify(errors.slice(0, 3)))
    throw e
  })
  if (process.env.SHOT)
    await page.screenshot({ path: `${process.env.SHOT}-receipt.png` })
  check(true, 'чек открылся')
  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
}
finally {
  await browser.close()
}

const [order] = await rest(`orders?select=id,status,source,final_amount,bonuses_awarded,bonuses_activation_date&user_id=eq.${customer.id}&source=eq.offline&order=created_at.desc&limit=1`)
check(order?.status === 'completed' && order?.source === 'offline', `заказ: ${order?.status} / ${order?.source}`)
check(order && order.bonuses_activation_date, 'дата активации бонусов заполнена')
const items = order ? await rest(`order_items?select=quantity,price_at_purchase&order_id=eq.${order.id}`) : []
check(items.length === 1 && Number(items[0].price_at_purchase) === Number(product.final_price), `позиция по цене ${items[0]?.price_at_purchase}`)
const history = order ? await rest(`bonus_transactions?select=transaction_type,amount&order_id=eq.${order.id}`) : []
check(!order?.bonuses_awarded || history.some(h => h.transaction_type === 'pending' && h.amount === order.bonuses_awarded), `история бонусов: ${history.map(h => `${h.transaction_type} ${h.amount}`).join(', ')}`)
const [after] = await rest(`products?select=stock_quantity&id=eq.${product.id}`)
check(after.stock_quantity === product.stock_quantity - 1, `остаток ${product.stock_quantity} → ${after.stock_quantity}`)

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

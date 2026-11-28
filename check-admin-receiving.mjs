/*
 * «Приёмка товаров» (28.11.2026) — только на ЛОКАЛЬНОЙ базе с миграциями
 * поставок 20261126140000 и 20261127120000.
 *
 * Владелец: «я захожу в раздел „Приёмка товаров“, далее выбираю дату по
 * календарю — на сегодня календарь ставит по умолчанию сегодня, или можно
 * выбрать любую дату, чтобы посмотреть, какие поставки ожидаются; когда
 * выбираю дату, открывается следующая страница, где уже лежит список
 * поставщиков, которые запланированы на этот день».
 *
 * Проверяет:
 *  1) дашборд «Умный закуп» — кнопка «Приёмка товаров» с иконкой;
 *  2) календарь: сегодня выбрано, у дня — сколько поставщиков ждём (как в
 *     данных /api/admin/deliveries), кнопка «Сегодня — ждём N поставщиков»;
 *     нажатие на день открывает его страницу;
 *  3) день: поставщики этого дня по одному, их заказы с номерами;
 *     опоздавшая поставка — сегодня и с пометкой; частично принятый заказ —
 *     «ждём ещё N шт.»; ссылка на заказы поставщика; «Принято в этот день»;
 *     прошедший день без опоздавших; соседние дни стрелками, «Календарь»,
 *     «Сегодня»; несуществующая дата — «Такой даты нет»; «назад» в шапке —
 *     на календарь;
 *  4) 390 и 1366 — без горизонтальной прокрутки; без ошибок консоли.
 *
 * Данные заводит сам — три поставщика, товары, заказы через API, как в
 * работе, — и в конце всё удаляет.
 *
 *   node check-admin-receiving.mjs --base=http://localhost:3142
 *
 * Стенд: сборка на локальной базе. SHOTS=<папка> — скриншоты.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3142'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, товары и заказы')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

function psql(sql, vars = {}) {
  const args = ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1']
  for (const [k, v] of Object.entries(vars))
    args.push('-v', `${k}=${v}`)
  return execFileSync('docker', args, { input: sql, encoding: 'utf8' }).trim()
}

const serviceHeaders = { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function createUser(email) {
  const res = await fetch(`${SUPA}/auth/v1/admin/users`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }) })
  const user = await res.json()
  if (!res.ok)
    throw new Error(`пользователь ${email}: ${user.msg ?? res.status}`)
  return user.id
}
async function tokenFor(email) {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'apikey': ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) })
  return (await res.json()).access_token
}
async function api(path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  }
  catch {}
  return { status: res.status, json }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
const flat = t => (t ?? '').replace(/\s+/g, ' ').trim()

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date())
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dm = day => `${day.slice(8, 10)}.${day.slice(5, 7)}`
const tomorrow = addDays(today, 1)
const word = (n, one, few, many) => {
  const m10 = n % 10
  const m100 = n % 100
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many
}

// --- Данные ---
const stamp = Date.now()
const tail = String(stamp).slice(-9)
const SUP = { a: `Приёмка А ${tail}`, b: `Приёмка Б ${tail}`, c: `Приёмка В ${tail}` }
const emails = { admin: `receiving-admin-${stamp}@example.test` }
const users = []
let d = null

function setup(adminId) {
  const out = psql(`
SELECT tgname AS t FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"t";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"t";
COMMIT;
BEGIN;
INSERT INTO public.suppliers (name) VALUES ('${SUP.a}') RETURNING id AS sa \\gset
INSERT INTO public.suppliers (name) VALUES ('${SUP.b}') RETURNING id AS sb \\gset
INSERT INTO public.suppliers (name) VALUES ('${SUP.c}') RETURNING id AS sc \\gset
INSERT INTO public.products (name, slug, price, sku, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('Кукла приёмки ${tail}', 'probe-receiving-1-${tail}', 3000, 'PRCG-1-${tail}', 2, true, :'sa', 1500) RETURNING id AS a1 \\gset
INSERT INTO public.products (name, slug, price, sku, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('Мяч приёмки ${tail}', 'probe-receiving-2-${tail}', 1500, 'PRCG-2-${tail}', 0, true, :'sa', 700) RETURNING id AS a2 \\gset
INSERT INTO public.products (name, slug, price, sku, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('Пазл приёмки ${tail}', 'probe-receiving-3-${tail}', 2000, 'PRCG-3-${tail}', 1, true, :'sb', 900) RETURNING id AS b1 \\gset
INSERT INTO public.products (name, slug, price, sku, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('Машинка приёмки ${tail}', 'probe-receiving-4-${tail}', 5000, 'PRCG-4-${tail}', 0, true, :'sc', 2500) RETURNING id AS c1 \\gset
COMMIT;
SELECT json_build_object('sa', :'sa', 'sb', :'sb', 'sc', :'sc', 'a1', :'a1', 'a2', :'a2', 'b1', :'b1', 'c1', :'c1');
`, { admin: adminId })
  return JSON.parse(out.split('\n').pop())
}

function cleanup() {
  if (!d)
    return
  psql(`
BEGIN;
DELETE FROM public.stock_receipts WHERE order_id IN (SELECT id FROM public.supplier_orders WHERE supplier_id IN (:'sa', :'sb', :'sc'));
DELETE FROM public.supplier_orders WHERE supplier_id IN (:'sa', :'sb', :'sc');
DELETE FROM public.products WHERE id IN (:'a1', :'a2', :'b1', :'c1');
DELETE FROM public.suppliers WHERE id IN (:'sa', :'sb', :'sc');
COMMIT;
`, d)
}

const browser = await chromium.launch()
const pages = []
const errors = []
const failed = []
try {
  const adminId = await createUser(emails.admin)
  users.push(adminId)
  d = setup(adminId)
  const token = await tokenFor(emails.admin)

  console.log('\n== заказы — через API, как в работе')
  // Поставщик и день поставки: товар ложится в формирующийся заказ своего поставщика
  async function placeOrder(items, expectedAt) {
    let id = null
    for (const [productId, quantity] of items) {
      const added = await api('/api/admin/deliveries/add', token, { productId, quantity, showOnReceipt: false })
      if (added.status !== 200)
        throw new Error(`в заказ: ${added.status} ${added.json?.message}`)
      id = added.json.id
    }
    const placed = await api(`/api/admin/deliveries/${id}/place`, token, { expectedAt })
    if (placed.status !== 200)
      throw new Error(`«Заказано»: ${placed.status} ${placed.json?.message}`)
    return { id, number: placed.json.number ?? null }
  }
  const a1 = await placeOrder([[d.a1, 5], [d.a2, 3]], today)
  const a2 = await placeOrder([[d.a2, 2]], today)
  const b1 = await placeOrder([[d.b1, 4]], today)
  const c1 = await placeOrder([[d.c1, 6]], tomorrow)
  // Б опаздывает: ждали позавчера, ночью ещё не перенесли
  psql(`UPDATE public.supplier_orders SET expected_at = :'day' WHERE id = :'id';`, { day: addDays(today, -2), id: b1.id })
  // По первому заказу А часть уже пришла
  const got = await api(`/api/admin/restock/orders/${a1.id}/receive`, token, { items: [{ productId: d.a1, quantity: 2 }], close: false })
  check(got.status === 200 && got.json.units === 2, `часть заказа А принята: ${got.json?.units} шт.`)

  const all = await api('/api/admin/deliveries', token)
  const orders = all.json.orders
  const num = id => orders.find(o => o.id === id)?.number
  check(all.status === 200 && all.json.ready === true && all.json.today === today, `данные поставок: сегодня ${all.json.today}`)
  // Сколько поставщиков ждём в день — по данным, независимо от страницы
  const open = orders.filter(o => o.status === 'ordered' || o.status === 'in_transit')
  const dayOf = o => !o.expectedAt ? null : o.expectedAt < today ? today : o.expectedAt
  const suppliersOn = day => new Set(open.filter(o => dayOf(o) === day).map(o => o.supplierId)).size
  const nToday = suppliersOn(today)
  const nTomorrow = suppliersOn(tomorrow)

  async function newPage(viewport, path) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    // Окно подписки на Telegram (app.vue) перекрывает кнопки — как будто в нём уже нажали «Не сейчас»
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    pages.push(page)
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      // Известное, не отсюда: предзагрузка данных ссылок шапки на пустой локальной
      // базе (404), серверная корзина вошедшего без корзины (406), фото — бакеты пустые (400)
      if (r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts'))
        && !(r.status() === 400 && r.url().startsWith(`${SUPA}/storage/v1/object/public/`))) {
        failed.push(`${r.status()} ${r.url().replace(BASE, '')}`)
      }
    })
    await page.goto(`${BASE}/about`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
    const loginError = await page.evaluate(async ({ email, password }) => {
      const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      const { error } = await nuxt.$supabase.client.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    }, { email: emails.admin, password: PASSWORD })
    if (loginError)
      throw new Error(`вход: ${loginError}`)
    if (path)
      await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
    return page
  }
  const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  const card = (page, supplierId) => page.locator(`[data-testid=receiving-supplier][data-supplier="${supplierId}"]`)
  const dayLoaded = (page, day) => page.locator(`[data-testid=receiving-day-page][data-day="${day}"] [data-testid=receiving-day-suppliers]`).waitFor({ timeout: 30000 })

  console.log('\n== дашборд «Умный закуп»')
  const desk = await newPage({ width: 1366, height: 900 }, '/admin/purchasing')
  const button = desk.locator('[data-testid=purchasing-pages] a[href="/admin/receiving"]')
  await button.waitFor({ timeout: 30000 })
  check(flat(await button.innerText()) === 'Приёмка товаров' && await button.locator('svg').count() === 1, 'кнопка «Приёмка товаров» с иконкой')
  await button.click()
  await desk.waitForURL(`${BASE}/admin/receiving`, { timeout: 30000 })

  console.log('\n== календарь, 1366')
  await desk.locator('[data-testid=delivery-calendar]').waitFor({ timeout: 30000 })
  const todayCell = desk.locator(`[data-testid=calendar-day][data-day="${today}"]`)
  check(await todayCell.getAttribute('aria-pressed') === 'true', 'сегодня выбрано')
  check(Number(await todayCell.getAttribute('data-count')) === nToday && nToday >= 2, `у сегодня — ${await todayCell.getAttribute('data-count')} поставщиков, по данным ${nToday}`)
  const openToday = flat(await desk.locator('[data-testid=receiving-open-today]').innerText())
  check(openToday.startsWith('Сегодня, ') && openToday.endsWith(`— ждём ${nToday} ${word(nToday, 'поставщика', 'поставщиков', 'поставщиков')}`), `кнопка: «${openToday}»`)
  check(await noHScroll(desk), '1366 — без горизонтальной прокрутки')
  if (SHOTS)
    await desk.screenshot({ path: `${SHOTS}/receiving-calendar-1366.png`, fullPage: true })

  // Завтра может оказаться в следующем месяце — листнуть
  if (tomorrow.slice(0, 7) !== today.slice(0, 7) && !await desk.locator(`[data-testid=calendar-day][data-day="${tomorrow}"]`).count())
    await desk.locator('[data-testid=calendar-next]').click()
  const tomorrowCell = desk.locator(`[data-testid=calendar-day][data-day="${tomorrow}"]`)
  check(Number(await tomorrowCell.getAttribute('data-count')) === nTomorrow && nTomorrow >= 1, `у завтра — ${await tomorrowCell.getAttribute('data-count')}, по данным ${nTomorrow}`)
  await tomorrowCell.click()
  await desk.waitForURL(`${BASE}/admin/receiving/${tomorrow}`, { timeout: 30000 })
  await dayLoaded(desk, tomorrow)
  check(true, `нажатие на день открыло /admin/receiving/${tomorrow}`)

  console.log('\n== завтра')
  check(await card(desk, d.sc).count() === 1 && await card(desk, d.sa).count() === 0 && await card(desk, d.sb).count() === 0, 'завтра — только В')
  check(flat(await desk.locator('[data-testid=receiving-day-title]').innerText()).startsWith(`${Number(tomorrow.slice(8))} `), `заголовок: «${flat(await desk.locator('[data-testid=receiving-day-title]').innerText())}»`)
  check(flat(await card(desk, d.sc).locator('[data-testid=receiving-supplier-order]').innerText()).startsWith(`№${num(c1.id)} · 1 позиция, 6 шт.`), 'заказ В: номер, 1 позиция, 6 шт.')
  check(await desk.locator('[data-testid=receiving-day-today]').count() === 1, 'не сегодня — есть «Сегодня»')
  const backLabel = flat(await desk.locator('[data-testid=admin-back-label]').innerText().catch(() => ''))
  check(backLabel === 'Приёмка товаров', `«назад» в шапке — «${backLabel}»`)

  console.log('\n== стрелкой — сегодня')
  await desk.locator('[data-testid=receiving-day-prev]').click()
  await desk.waitForURL(`${BASE}/admin/receiving/${today}`, { timeout: 30000 })
  await dayLoaded(desk, today)
  check(flat(await desk.locator('[data-testid=receiving-day-title]').innerText()).startsWith('Сегодня, '), `заголовок: «${flat(await desk.locator('[data-testid=receiving-day-title]').innerText())}»`)
  check(await card(desk, d.sa).count() === 1 && await card(desk, d.sb).count() === 1 && await card(desk, d.sc).count() === 0, 'сегодня — А и Б, без В')
  const aOrders = await card(desk, d.sa).locator('[data-testid=receiving-supplier-order]').allInnerTexts()
  check(aOrders.length === 2 && flat(aOrders[0]).startsWith(`№${Math.min(num(a1.id), num(a2.id))} `) && flat(aOrders[1]).startsWith(`№${Math.max(num(a1.id), num(a2.id))} `), `у А два заказа по номерам: ${aOrders.map(flat).join(' | ')}`)
  check(flat(await card(desk, d.sa).locator('[data-testid=receiving-supplier-waiting]').innerText()) === 'часть уже принята — ждём ещё 8 шт.', 'А: часть принята — ждём ещё 8 шт. (10 − 2)')
  check(await card(desk, d.sb).locator('[data-testid=receiving-supplier-late]').count() === 1 && await card(desk, d.sa).locator('[data-testid=receiving-supplier-late]').count() === 0, 'Б опаздывает — пометка; А — без')
  check(await card(desk, d.sb).locator('[data-testid=receiving-supplier-waiting]').count() === 0, 'Б: ничего не принято — без «ждём ещё»')
  check(await card(desk, d.sa).locator('[data-testid=receiving-supplier-link]').getAttribute('href') === `/admin/deliveries/${d.sa}`, 'ссылка на заказы поставщика')
  const rec = desk.locator(`[data-testid=receiving-received][data-supplier="${d.sa}"]`)
  check(await rec.count() === 1 && flat(await rec.innerText()).includes(`№${num(a1.id)} · 1 позиция, 2 шт. · в `), `принято сегодня: «${flat(await rec.innerText().catch(() => ''))}»`)
  check(await desk.locator('[data-testid=receiving-day-today]').count() === 0, 'сегодня — без «Сегодня»')
  if (SHOTS)
    await desk.screenshot({ path: `${SHOTS}/receiving-day-1366.png`, fullPage: true })

  console.log('\n== назад историей — снова завтра, не сегодняшний список')
  await desk.goBack()
  await desk.waitForURL(`${BASE}/admin/receiving/${tomorrow}`, { timeout: 30000 })
  await dayLoaded(desk, tomorrow)
  await sleep(500)
  check(await card(desk, d.sc).count() === 1 && await card(desk, d.sa).count() === 0, 'после «назад» — список завтрашнего дня')

  console.log('\n== прошедший день')
  await desk.goto(`${BASE}/admin/receiving/${addDays(today, -2)}`, { waitUntil: 'load' })
  await dayLoaded(desk, addDays(today, -2))
  check(await card(desk, d.sb).count() === 0, 'опоздавшего Б в его прошедшем дне нет — он в сегодняшнем')
  const empty = flat(await desk.locator('[data-testid=receiving-day-empty]').innerText().catch(() => ''))
  check(empty === 'На этот день поставок не ждём. Опоздавшие поставки — в сегодняшнем дне.' || (await desk.locator('[data-testid=receiving-supplier]').count()) > 0, `пусто: «${empty}»`)
  await desk.locator('[data-testid=receiving-day-calendar]').click()
  await desk.waitForURL(`${BASE}/admin/receiving`, { timeout: 30000 })
  check(true, '«Календарь» — на календарь')
  await desk.locator('[data-testid=receiving-open-today]').click()
  await desk.waitForURL(`${BASE}/admin/receiving/${today}`, { timeout: 30000 })
  await dayLoaded(desk, today)
  check(await card(desk, d.sa).count() === 1, '«Сегодня, …» — на сегодняшний день')

  console.log('\n== несуществующая дата')
  await desk.goto(`${BASE}/admin/receiving/2026-02-30`, { waitUntil: 'load' })
  await desk.locator('[data-testid=receiving-day-invalid]').waitFor({ timeout: 30000 })
  check(flat(await desk.locator('[data-testid=receiving-day-invalid]').innerText()).startsWith('Такой даты нет.'), '30 февраля — «Такой даты нет»')

  console.log('\n== телефон, 390')
  const phone = await newPage({ width: 390, height: 844 }, '/admin/receiving')
  await phone.locator('[data-testid=delivery-calendar]').waitFor({ timeout: 30000 })
  await phone.locator(`[data-testid=calendar-day][data-day="${today}"][data-count="${nToday}"]`).waitFor({ timeout: 30000 })
  check(await noHScroll(phone), 'календарь на 390 — без горизонтальной прокрутки')
  if (SHOTS)
    await phone.screenshot({ path: `${SHOTS}/receiving-calendar-390.png`, fullPage: true })
  await phone.locator(`[data-testid=calendar-day][data-day="${today}"]`).click()
  await phone.waitForURL(`${BASE}/admin/receiving/${today}`, { timeout: 30000 })
  await dayLoaded(phone, today)
  check(await card(phone, d.sa).count() === 1, 'нажатие на сегодня — его страница')
  check(await noHScroll(phone), 'день на 390 — без горизонтальной прокрутки')
  if (SHOTS)
    await phone.screenshot({ path: `${SHOTS}/receiving-day-390.png`, fullPage: true })

  check(errors.length === 0, `без ошибок консоли${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)
  check(failed.length === 0, `без неудачных запросов${failed.length ? `: ${failed.slice(0, 5).join(' | ')}` : ''}`)
}
catch (error) {
  for (const [i, p] of pages.entries())
    console.error(`страница ${i}: ${p.url()}`)
  fails.push(error.message)
  console.error(error)
}
finally {
  await browser.close().catch(() => {})
  try {
    cleanup()
  }
  catch (error) {
    console.error(`данные проверки не удалились — уберите руками: ${error.message}`)
  }
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}
console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

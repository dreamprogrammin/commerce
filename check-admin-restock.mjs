/*
 * «К закупке» — заказы поставщикам (30.10.2026) — только на ЛОКАЛЬНОЙ базе.
 *
 * Владелец: «заказы должны собираться по поставщику», спрос — не только из
 * корзин. Страж проверяет:
 *  1) маршруты: гость — 401, не-администратор — 403, негодное правило — 400;
 *  2) данные: продажи за 30/90 дней совпадают с пересчётом по строкам заказов
 *     (обратным путём — от строк к заказам, не как сервер), корзины — с
 *     маршрутом «В корзинах», подписки и избранное — с подсчётом по таблицам;
 *     закупочная цена 0 приходит как не заполненная, а не как бесплатная;
 *  3) страница: у каждого поставщика «на пороге» — ровно товары с остатком не
 *     выше порога; количество, «Добавить товар», «Убрать» и «Сбросить»;
 *     черновик переживает перезагрузку; текст заказа = скопированный = текст
 *     в ссылке WhatsApp на номер поставщика;
 *  4) правило в окне сохраняется в базу, товар уходит из заказа, если больше
 *     не на пороге; правило возвращается на место;
 *  5) телефон 390px: без горизонтальной прокрутки, окно правила одно.
 * Заказы в базу не пишутся: их триггеры шлют уведомления.
 *
 *   node check-admin-restock.mjs --base=http://localhost:3141
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
const DAY = 86_400_000
const DRAFT_KEY = 'uhti-admin-restock-v1'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж выдаёт пароли пользователям базы')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const serviceHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }

async function rest(path) {
  return (await fetch(`${SUPA}/rest/v1/${path}`, { headers: serviceHeaders })).json()
}

/** Все строки — страницами по 1000 */
async function restAll(path) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPA}/rest/v1/${path}`, { headers: { ...serviceHeaders, Range: `${from}-${from + 999}` } })
    const page = await res.json()
    if (!Array.isArray(page))
      throw new Error(`${path}: ${JSON.stringify(page)}`)
    rows.push(...page)
    if (page.length < 1000)
      return rows
  }
}

async function signIn(role) {
  const [profile] = await rest(`profiles?select=id&role=${role === 'admin' ? 'eq' : 'neq'}.admin&limit=1`)
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profile.id}`, {
    method: 'PUT',
    headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
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

async function api(path, token, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
  })
  return { status: res.status, body: res.ok ? await res.json() : null }
}

function browserCookies(session) {
  return [...session.cookies, ...session.cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') }))]
    .map(c => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' }))
}

console.log(`стенд ${BASE}`)
const admin = await signIn('admin')
const { body: data } = await api('/api/admin/restock', admin.token)
const byId = new Map(data.products.map(p => [p.id, p]))
const supplierName = new Map(data.suppliers.map(s => [s.id, s.name]))
// Для правила — товар на пороге с остатком: порог ниже остатка уводит его из заказа
const ruleTarget = data.products.find(p => p.supplierId && p.stock > 0 && p.stock <= p.minStock)
const ruleSaved = ruleTarget && { min_stock_level: ruleTarget.minStock, restock_quantity: ruleTarget.restockQty }

try {
  console.log('\n== доступ')
  check((await api('/api/admin/restock')).status === 401, 'список: гость — 401')
  const user = await signIn('user')
  check((await api('/api/admin/restock', user.token)).status === 403, 'список: не-администратор — 403')
  const rulePut = (token, body) => api('/api/admin/restock/rule', token, { method: 'PUT', body: JSON.stringify(body) })
  check((await rulePut(null, { productId: ruleTarget.id, minStock: 1, restockQty: 1 })).status === 401, 'правило: гость — 401')
  check((await rulePut(user.token, { productId: ruleTarget.id, minStock: 1, restockQty: 1 })).status === 403, 'правило: не-администратор — 403')
  check((await rulePut(admin.token, { productId: ruleTarget.id, minStock: -1, restockQty: 1 })).status === 400, 'правило: порог −1 — 400')
  check((await rulePut(admin.token, { productId: ruleTarget.id, minStock: 1, restockQty: 0 })).status === 400, 'правило: брать 0 — 400')
  check((await rulePut(admin.token, { productId: 'x', minStock: 1, restockQty: 1 })).status === 400, 'правило: не id — 400')

  console.log('\n== данные')
  check(data.products.length === (await restAll('products?select=id&is_active=eq.true')).length, `товары: все активные (${data.products.length})`)
  const zeroCost = await restAll('products?select=id&is_active=eq.true&cost_price=eq.0')
  check(zeroCost.length > 0 && zeroCost.every(z => byId.get(z.id)?.costPrice === null), `закупка 0 — не заполнена: без цены у всех ${zeroCost.length}`)
  // Продажи — от строк к заказам: другой путь, чем у сервера
  const since = new Date(Date.now() - 90 * DAY).toISOString()
  const lines = [
    ...(await restAll(`order_items?select=product_id,quantity,o:orders!inner(id,status,created_at)&o.status=neq.cancelled&o.created_at=gte.${since}`))
      .map(l => ({ id: l.product_id, q: l.quantity, at: l.o.created_at, order: l.o.id })),
    ...(await restAll(`guest_checkout_items?select=product_id,quantity,g:guest_checkouts!inner(id,status,created_at)&g.status=neq.cancelled&g.created_at=gte.${since}`))
      .map(l => ({ id: l.product_id, q: l.quantity, at: l.g.created_at, order: l.g.id })),
  ]
  const orderAt = new Map(lines.map(l => [l.order, l.at]))
  for (const ret of await restAll(`order_returns?select=id,order_id,guest_checkout_id&created_at=gte.${since}`)) {
    const at = orderAt.get(ret.order_id ?? ret.guest_checkout_id)
    if (at) {
      for (const item of await restAll(`order_return_items?select=product_id,quantity&return_id=eq.${ret.id}`))
        lines.push({ id: item.product_id, q: -item.quantity, at })
    }
  }
  const expected = new Map()
  for (const l of lines) {
    const e = expected.get(l.id) ?? { sold30: 0, sold90: 0 }
    e.sold90 += l.q
    if (Date.now() - new Date(l.at).getTime() <= 30 * DAY)
      e.sold30 += l.q
    expected.set(l.id, e)
  }
  const salesWrong = data.products.filter(p => p.sold30 !== Math.max(expected.get(p.id)?.sold30 ?? 0, 0) || p.sold90 !== Math.max(expected.get(p.id)?.sold90 ?? 0, 0))
  const sold = data.products.filter(p => p.sold90 > 0)
  check(!salesWrong.length && sold.length > 0, `продажи 30/90 дней совпали с пересчётом у всех (с продажами — ${sold.length}, расхождений — ${salesWrong.length})`)

  const { body: demand } = await api('/api/admin/cart-demand', admin.token)
  const cartsWrong = data.products.filter((p) => {
    const row = demand.find(d => d.productId === p.id)
    return (row?.customers.length ?? 0) !== p.cartCustomers || (row?.quantity ?? 0) !== p.cartUnits
  })
  check(!cartsWrong.length, `корзины совпали с «В корзинах у покупателей» (товаров в корзинах — ${demand.length})`)
  const countOf = rows => rows.reduce((m, r) => m.set(r.product_id, (m.get(r.product_id) ?? 0) + 1), new Map())
  const alerts = countOf(await restAll('stock_alerts?select=product_id'))
  const wishes = countOf(await restAll('wishlist?select=product_id'))
  const signalsMatch = data.products.every(p => p.alerts === (alerts.get(p.id) ?? 0) && p.wishlist === (wishes.get(p.id) ?? 0))
  check(signalsMatch, `подписки и избранное совпали с таблицами (избранное у ${[...wishes.keys()].length} товаров)`)

  console.log('\n== страница')
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    await ctx.addCookies(browserCookies(admin))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))

    await page.goto(`${BASE}/admin/restock`, { waitUntil: 'load', timeout: 120000 })
    await page.evaluate(key => localStorage.removeItem(key), DRAFT_KEY)
    await page.reload({ waitUntil: 'load', timeout: 120000 })
    await page.locator('[data-testid=supplier-block]').first().waitFor({ timeout: 30000 })

    // У каждого поставщика «на пороге» — ровно товары с остатком не выше порога
    for (const [id, name] of supplierName) {
      const want = data.products.filter(p => p.supplierId === id && p.stock <= p.minStock).length
      const block = page.locator(`[data-testid=supplier-block][data-supplier="${name}"]`)
      if (!data.products.some(p => p.supplierId === id))
        continue
      const shown = Number((await block.textContent()).match(/на пороге (\d+)/)?.[1])
      check(shown === want, `${name}: на пороге ${shown}, товаров с остатком не выше порога — ${want}`)
    }

    // Ячейка таблицы по умолчанию не переносит строк: длинное название раздувало таблицу
    const wide = await page.locator('[data-testid=supplier-block] [data-slot=table-container]')
      .evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).length)
    check(wide === 0, `таблицы не шире блока при 1366px (шире — ${wide})`)

    // Поставщик для черновика — с телефоном и товарами на пороге
    const supplier = data.suppliers.find(s => s.phone && data.products.some(p => p.supplierId === s.id && p.stock <= p.minStock && p.id !== ruleTarget.id))
    const block = page.locator(`[data-testid=supplier-block][data-supplier="${supplier.name}"]`)
    const rows = block.locator('[data-testid=restock-row]')
    const autoIds = data.products.filter(p => p.supplierId === supplier.id && p.stock <= p.minStock).map(p => p.id)
    check(await rows.count() === autoIds.length, `${supplier.name}: строк в таблице ${await rows.count()} — столько же на пороге`)

    const first = rows.first()
    const firstId = await first.getAttribute('data-product')
    const firstProduct = byId.get(firstId)
    const demandText = (await first.locator('[data-testid=demand]').textContent()).replace(/\s+/g, ' ')
    check(demandText.includes(`продано ${firstProduct.sold30} за 30 дн. · ${firstProduct.sold90} за 90`), `спрос в строке: «${demandText.trim().slice(0, 60)}»`)

    const qty = first.locator('[data-testid=order-qty]')
    await qty.fill('9')
    await qty.press('Tab')
    await block.locator('[data-testid=order-text-toggle]').click()
    const pre = block.locator('[data-testid=order-text]')
    await pre.waitFor()
    check((await pre.textContent()).includes(`${firstProduct.name} — 9 шт.`), 'количество 9 — в тексте заказа')

    await block.locator('[data-testid=order-add]').click()
    const addItem = page.locator('[data-testid=order-add-item]').first()
    await addItem.waitFor()
    const addedName = (await addItem.locator('.truncate').textContent()).trim()
    await addItem.click()
    const manualRow = rows.filter({ hasText: 'добавлен вручную' })
    await manualRow.first().waitFor({ timeout: 5000 })
    check((await manualRow.count()) === 1 && (await manualRow.textContent()).includes(addedName), `«Добавить товар»: ${addedName.slice(0, 40)} — в заказе, «добавлен вручную»`)

    // Черновик переживает перезагрузку
    await page.reload({ waitUntil: 'load', timeout: 120000 })
    await block.locator('[data-testid=restock-row]').first().waitFor({ timeout: 30000 })
    check(await block.locator(`[data-testid=restock-row][data-product="${firstId}"] [data-testid=order-qty]`).inputValue() === '9'
      && await rows.filter({ hasText: 'добавлен вручную' }).count() === 1, 'после перезагрузки: количество 9 и добавленный товар на месте')

    await block.locator('[data-testid=order-text-toggle]').click()
    const text = (await block.locator('[data-testid=order-text]').textContent()).trim()
    await block.locator('[data-testid=order-copy]').click()
    await page.waitForTimeout(300)
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    check(copied.trim() === text, '«Скопировать» — тот же текст, что в «Текст заказа»')
    const href = await block.locator('[data-testid=order-whatsapp]').getAttribute('href')
    const wa = new URL(href)
    const phoneDigits = supplier.phone.replace(/\D/g, '').replace(/^8/, '7')
    const waMatch = wa.hostname === 'wa.me' && wa.pathname === `/${phoneDigits}` && wa.searchParams.get('text').trim() === text
    check(waMatch, `WhatsApp: номер поставщика и тот же текст (${wa.pathname})`)
    const totals = (await block.locator('[data-testid=order-totals]').textContent()).replace(/\s+/g, ' ')
    const units = autoIds.reduce((s, id) => s + (id === firstId ? 9 : byId.get(id).restockQty), 0)
      + data.products.find(p => p.name === addedName && p.supplierId === supplier.id).restockQty
    check(totals.includes(`${units} шт.`), `итог: ${totals.trim().slice(0, 70)}`)

    await rows.filter({ hasText: 'добавлен вручную' }).locator('[data-testid=order-remove]').click()
    check(await rows.filter({ hasText: 'добавлен вручную' }).count() === 0, '«Убрать» — добавленный товар ушёл из заказа')
    await block.locator('[data-testid=order-reset]').click()
    const qtyAfterReset = await block.locator(`[data-testid=restock-row][data-product="${firstId}"] [data-testid=order-qty]`).inputValue()
    const draftAfterReset = await page.evaluate(([key, id]) => JSON.parse(localStorage.getItem(key) ?? '{}').drafts?.[id] ?? null, [DRAFT_KEY, supplier.id])
    check(qtyAfterReset === String(firstProduct.restockQty) && !draftAfterReset, '«Сбросить» — количество снова по правилу, черновик поставщика стёрт')

    console.log('\n== правило')
    const ruleBlock = page.locator(`[data-testid=supplier-block][data-supplier="${supplierName.get(ruleTarget.supplierId)}"]`)
    const ruleRow = ruleBlock.locator(`[data-testid=restock-row][data-product="${ruleTarget.id}"]`)
    await ruleRow.locator('[data-testid=rule-button]').click()
    await page.locator('[data-testid=rule-min]').fill(String(ruleTarget.stock - 1))
    await page.locator('[data-testid=rule-qty]').fill('7')
    await page.locator('[data-testid=rule-save]').click()
    await page.getByText('Правило сохранено').waitFor({ timeout: 10000 })
    const [stored] = await rest(`products?select=min_stock_level,restock_quantity&id=eq.${ruleTarget.id}`)
    check(stored.min_stock_level === ruleTarget.stock - 1 && stored.restock_quantity === 7, `в базе: порог ${stored.min_stock_level}, брать ${stored.restock_quantity}`)
    check(await ruleRow.count() === 0, 'порог ниже остатка — товар ушёл из заказа')

    check(!errors.length, `страница без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-restock.png`, fullPage: true })

    console.log('\n== телефон')
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await phone.addCookies(browserCookies(admin))
    const mobile = await phone.newPage()
    await mobile.goto(`${BASE}/admin/restock`, { waitUntil: 'load', timeout: 120000 })
    await mobile.locator('[data-testid=supplier-block]').first().waitFor({ timeout: 30000 })
    const { scroll, width } = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }))
    check(scroll <= width, `без горизонтальной прокрутки: ${scroll} при ширине ${width}`)
    await mobile.getByRole('button', { name: /^≤\d+ → \+\d+$/ }).filter({ visible: true }).first().click()
    await mobile.waitForTimeout(500)
    check(await mobile.getByText('Правило закупки').filter({ visible: true }).count() === 1, 'окно правила открылось одно')
    if (process.env.SHOT)
      await mobile.screenshot({ path: `${process.env.SHOT}-restock-mobile.png`, fullPage: true })
    await phone.close()
  }
  finally {
    await browser.close()
  }
}
finally {
  if (ruleSaved) {
    await fetch(`${SUPA}/rest/v1/products?id=eq.${ruleTarget.id}`, {
      method: 'PATCH',
      headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(ruleSaved),
    })
  }
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

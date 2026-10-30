/*
 * Корзины покупателей в админке (31.10.2026) — только на ЛОКАЛЬНОЙ базе.
 *
 * Владелец хотел видеть, что покупатели кладут в корзину: в «Пользователях»
 * и в «К закупке». Страж кладёт корзины двум покупателям (один товар — больше,
 * чем на складе) и проверяет:
 *  1) маршрут спроса: гость — 401, не-администратор — 403;
 *  2) спрос: товар, которого не хватит на все корзины, — первым, штуки и
 *     покупатели сложены; список пользователей и карточка показывают корзину;
 *     маршрут страницы «Корзины» отдаёт прежний формат;
 *  3) страницы «К закупке», «Пользователи», карточка и «Корзины» рисуются без
 *     ошибок консоли и показывают корзины;
 *  4) гости (31.10.2026): браузер без входа кладёт товар — на сервере
 *     появляется корзина без имени, в спросе она «гость»; очистил — запись
 *     удалена. Гостевая корзина с подделанной ценой — сумма по каталогу.
 * Прежние корзины этих покупателей возвращаются на место.
 *
 *   node check-admin-carts.mjs --base=http://localhost:3141
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

async function setCart(userId, items) {
  const res = await fetch(`${SUPA}/rest/v1/server_carts?on_conflict=user_id`, {
    method: 'POST',
    headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, items, total_amount: 0, updated_at: new Date().toISOString() }),
  })
  if (!res.ok)
    throw new Error(`корзина: ${res.status} ${await res.text()}`)
}

console.log(`стенд ${BASE}`)
const [a, b] = await rest('profiles?select=id,first_name&role=neq.admin&order=created_at&limit=2')
// Все корзины — до прогона: вход гостя в аккаунт тоже пишет корзину
const saved = await rest('server_carts?select=user_id,items,total_amount,updated_at')
const [p, q] = await rest('products?select=id,name,price,final_price,stock_quantity&is_active=eq.true&stock_quantity=gt.0&stock_quantity=lt.20&order=name&limit=2')
const priceOf = x => Number(x.final_price || x.price)
const guestRpc = (id, items) => fetch(`${SUPA}/rest/v1/rpc/save_guest_cart`, {
  method: 'POST',
  headers: { 'apikey': ANON, 'Authorization': `Bearer ${ANON}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_cart_id: id, p_items: items }),
})
const apiGuest = crypto.randomUUID()

try {
  await setCart(a.id, [{ product_id: p.id, quantity: p.stock_quantity }, { product_id: q.id, quantity: 1 }])
  await setCart(b.id, [{ product_id: p.id, quantity: 1 }])
  // Гость с подделанной ценой: сервер её не берёт
  await guestRpc(apiGuest, [{ product_id: p.id, quantity: 2, price: 1 }])

  console.log('\n== доступ')
  check((await api('/api/admin/cart-demand')).status === 401, 'гость — 401')
  const user = await signIn('user')
  check((await api('/api/admin/cart-demand', user.token)).status === 403, 'не-администратор — 403')

  console.log('\n== данные')
  const admin = await signIn('admin')
  const { body: demand } = await api('/api/admin/cart-demand', admin.token)
  const top = demand?.[0]
  check(top?.productId === p.id, `первым — товар, которого не хватит: ${top?.name?.slice(0, 40)}`)
  check(top?.quantity === p.stock_quantity + 3 && top?.stock === p.stock_quantity, `в корзинах ${top?.quantity} (с гостем), на складе ${top?.stock}`)
  check(top?.customers.length === 3 && top?.customers.filter(c => c.guest && !c.id && !c.name).length === 1, `покупателей у товара: ${top?.customers.length}, из них гость без имени`)
  const [guestRow] = await rest(`guest_carts?select=total_amount,item_count&id=eq.${apiGuest}`)
  check(Number(guestRow?.total_amount) === priceOf(p) * 2, `гость: сумма по каталогу ${guestRow?.total_amount}, а не присланная`)
  const { body: users } = await api('/api/admin/users', admin.token)
  const rowA = users?.find(u => u.id === a.id)
  const totalA = priceOf(p) * p.stock_quantity + priceOf(q)
  check(rowA?.cart?.quantity === p.stock_quantity + 1 && rowA?.cart?.total === totalA, `список: корзина ${rowA?.cart?.quantity} шт. на ${rowA?.cart?.total}, ожидается ${totalA}`)
  const { body: cardA } = await api(`/api/admin/users/${a.id}`, admin.token)
  check(cardA?.cart?.items.length === 2, `карточка: позиций в корзине ${cardA?.cart?.items.length}`)
  const { body: carts } = await api('/api/admin/abandoned-carts', admin.token)
  const cartA = carts?.find(c => c.items.some(i => i.name === p.name.trim()) && c.items.length === 2)
  check(Boolean(cartA) && 'phone' in cartA && 'email' in cartA && typeof cartA.items[0].inStock === 'boolean', 'маршрут «Корзин»: прежний формат')
  const guestCart = carts?.find(c => c.guest)
  check(Boolean(guestCart) && !guestCart.name && !guestCart.phone && !guestCart.email, '«Корзины»: гость без имени и контактов')

  console.log('\n== страницы')
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    await ctx.addCookies([...admin.cookies, ...admin.cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') }))]
      .map(c => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' })))
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))

    await page.goto(`${BASE}/admin/restock`, { waitUntil: 'load', timeout: 120000 })
    await page.getByText('В корзинах у покупателей').waitFor({ timeout: 30000 })
    await page.getByText(`в корзинах ${p.stock_quantity + 3} шт.`).waitFor({ timeout: 10000 })
    check(true, '«К закупке»: блок корзин с товаром')
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-restock.png`, fullPage: true })

    await page.goto(`${BASE}/admin/users`, { waitUntil: 'load', timeout: 120000 })
    await page.getByRole('button', { name: /С корзиной: \d+/ }).click()
    const rows = await page.locator('tbody tr').count()
    check(rows === users.filter(u => u.cart).length, `«Пользователи»: фильтр «С корзиной» — ${rows} строк`)
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-users.png` })

    await page.goto(`${BASE}/admin/users/${a.id}`, { waitUntil: 'load', timeout: 120000 })
    await page.getByText('В корзине сейчас').waitFor({ timeout: 30000 })
    check(await page.getByText(`на складе ${p.stock_quantity}`).count() === 0, 'карточка: у товара в пределах склада нет пометки')
    check(true, 'карточка: блок «В корзине сейчас»')
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-card.png`, fullPage: true })

    await page.goto(`${BASE}/admin/carts`, { waitUntil: 'load', timeout: 120000 })
    await page.getByText(p.name.trim().slice(0, 30)).first().waitFor({ timeout: 30000 })
    check(true, '«Корзины»: страница показывает корзину')
    check(await page.getByText('без входа').count() >= 1, '«Корзины»: гость подписан «без входа»')
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-carts.png`, fullPage: true })
    check(!errors.length, `страницы без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)

    console.log('\n== гость в браузере')
    const guestCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    const guest = await guestCtx.newPage()
    const guestErrors = []
    guest.on('pageerror', e => guestErrors.push(e.message))
    await guest.goto(`${BASE}/catalog/all`, { waitUntil: 'load', timeout: 120000 })
    const add = guest.locator('button.pc-add').first()
    await add.waitFor({ timeout: 30000 })
    await add.scrollIntoViewIfNeeded()
    await add.click()
    await guest.waitForTimeout(4000)
    const stored = await guest.evaluate(() => JSON.parse(localStorage.getItem('uhti-cart-v1') ?? '{}'))
    const browserGuest = stored.guestCartId
    const [row] = browserGuest ? await rest(`guest_carts?select=items&id=eq.${browserGuest}`) : []
    check(Boolean(browserGuest) && row?.items?.length === stored.items?.length && row.items[0].product_id === stored.items[0].product.id,
      `гость положил товар — корзина на сервере (${browserGuest?.slice(0, 8)}…)`)
    check(row && !JSON.stringify(row).match(/@|\+7/), 'в записи гостя нет контактов')
    await guest.goto(`${BASE}/cart`, { waitUntil: 'load', timeout: 120000 })
    await guest.getByRole('button', { name: /Очистить/ }).first().click()
    const confirmBtn = guest.getByRole('button', { name: /^(Очистить|Да)/ }).last()
    if (await confirmBtn.isVisible().catch(() => false))
      await confirmBtn.click().catch(() => {})
    await guest.waitForTimeout(4000)
    const left = await rest(`guest_carts?select=id&id=eq.${browserGuest}`)
    check(left.length === 0, 'гость очистил корзину — запись удалена')

    // Вошёл — гостевая запись удаляется: корзина переезжает в аккаунт
    const userB = await signIn('user')
    await guest.goto(`${BASE}/catalog/all`, { waitUntil: 'load', timeout: 120000 })
    await guest.locator('button.pc-add').nth(1).click()
    await guest.waitForTimeout(4000)
    const beforeLogin = (await guest.evaluate(() => JSON.parse(localStorage.getItem('uhti-cart-v1') ?? '{}'))).guestCartId
    const existed = beforeLogin ? (await rest(`guest_carts?select=id&id=eq.${beforeLogin}`)).length : 0
    await guestCtx.addCookies([...userB.cookies, ...userB.cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') }))]
      .map(c => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' })))
    await guest.reload({ waitUntil: 'load', timeout: 120000 })
    await guest.waitForTimeout(5000)
    const afterLogin = beforeLogin ? await rest(`guest_carts?select=id&id=eq.${beforeLogin}`) : [1]
    check(existed === 1 && afterLogin.length === 0, `вошёл — гостевая запись удалена (была ${existed}, осталось ${afterLogin.length})`)
    check(!guestErrors.length, `гостевые страницы без ошибок${guestErrors.length ? ` — ${guestErrors[0].slice(0, 160)}` : ''}`)
    await guestCtx.close()
  }
  finally {
    await browser.close()
  }
}
finally {
  await guestRpc(apiGuest, [])
  // Вернуть прежние корзины, лишние — убрать
  const now = await rest('server_carts?select=user_id')
  for (const { user_id: id } of now) {
    if (!saved.some(c => c.user_id === id))
      await fetch(`${SUPA}/rest/v1/server_carts?user_id=eq.${id}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  }
  for (const old of saved)
    await fetch(`${SUPA}/rest/v1/server_carts?on_conflict=user_id`, { method: 'POST', headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(old) })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

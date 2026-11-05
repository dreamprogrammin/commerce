/*
 * «К закупке», шаг 2 — заказы поставщикам и приёмка (31.10.2026) — только на
 * ЛОКАЛЬНОЙ базе с миграцией 20261031160000_supplier_orders.
 *
 * Проверяет:
 *  1) маршруты заказов: гость — 401, не-администратор — 403, пустой заказ и
 *     чужой товар — 400 с понятной причиной;
 *  2) «Заказал»: черновик уходит в базу (количество из строки, кто заказал),
 *     черновик в браузере сбрасывается, заказанное больше не просится «на порог»,
 *     в строках — «уже заказано»;
 *  3) «В пути»; «Принять» частями: окно предупреждает, кто получит «Товар снова в
 *     наличии»; остаток прибавлен, журнал приёмки, уведомление ждавшему, подписка
 *     снята; кеш карточек сбрасывается сразу (запрос /api/admin/revalidate);
 *  4) «Закрыть» частично принятый и «Отменить» — через подтверждение; закрытые —
 *     в списке за 30 дней; «Текст» сохранённого заказа — с номером;
 *  5) телефон 390px: заказ и окно приёмки без горизонтальной прокрутки;
 *     без ошибок консоли.
 *
 * Данные заводит сам — поставщик, три товара на нём, ждущий покупатель,
 * администратор — и в конце всё возвращает. Пользователи — через GoTrue, роль
 * администратора — psql с выключенным на время транзакции триггером роли.
 *
 *   node check-admin-supplier-orders.mjs --base=http://localhost:3141
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные). SHOTS=<папка> — скриншоты.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import ExcelJS from 'exceljs'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SUPPLIER = 'Поставщик проверки заказов'
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей и меняет остатки')

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
async function rest(path) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, { headers: serviceHeaders })
  if (!res.ok)
    throw new Error(`REST ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
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

const stamp = Date.now()
const emails = { admin: `restock-admin-${stamp}@example.test`, buyer: `restock-buyer-${stamp}@example.test` }
const users = []
let d = null

function setup(adminId, buyerId) {
  const out = psql(`
SELECT tgname AS t FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"t";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"t";
COMMIT;
BEGIN;
INSERT INTO public.suppliers (name, phone) VALUES ('${SUPPLIER}', '+7 701 000 00 11') RETURNING id AS sup \\gset
SELECT (array_agg(id ORDER BY name, id))[1] AS pa, (array_agg(id ORDER BY name, id))[2] AS pb, (array_agg(id ORDER BY name, id))[3] AS pc
FROM public.products WHERE is_active \\gset
SELECT json_agg(json_build_object('id', id, 'supplier_id', supplier_id, 'stock_quantity', stock_quantity,
  'min_stock_level', min_stock_level, 'restock_quantity', restock_quantity, 'cost_price', cost_price))::text AS saved
FROM public.products WHERE id IN (:'pa', :'pb', :'pc') \\gset
UPDATE public.products SET supplier_id = :'sup', min_stock_level = 2, restock_quantity = 5 WHERE id IN (:'pa', :'pb', :'pc');
UPDATE public.products SET stock_quantity = 0, cost_price = 1000 WHERE id = :'pa';
UPDATE public.products SET cost_price = 0 WHERE id = :'pb';
UPDATE public.products SET stock_quantity = 1 WHERE id = :'pb';
UPDATE public.products SET stock_quantity = 9 WHERE id = :'pc';
INSERT INTO public.stock_alerts (user_id, product_id) VALUES (:'buyer', :'pa');
COMMIT;
SELECT json_build_object('sup', :'sup', 'pa', :'pa', 'pb', :'pb', 'pc', :'pc', 'saved', :'saved'::json,
  'names', (SELECT json_object_agg(id, btrim(name)) FROM public.products WHERE id IN (:'pa', :'pb', :'pc')),
  'sale', (SELECT json_object_agg(id, coalesce(nullif(final_price, 0), price, 0)) FROM public.products WHERE id IN (:'pa', :'pb', :'pc')));
`, { admin: adminId, buyer: buyerId })
  return JSON.parse(out.split('\n').pop())
}

// Фото товаров для таблицы: локально бакеты пустые — кладём своё, после — убираем
const photoPaths = []
async function putPhotos(productId) {
  const images = await rest(`product_images?select=image_url&product_id=eq.${productId}`)
  const page = await browser.newPage()
  await page.setContent('<div id="p" style="width:120px;height:120px;background:#e33"></div>')
  const png = await page.locator('#p').screenshot()
  await page.close()
  for (const { image_url: url } of images) {
    const path = /\.\w+$/.test(url) ? url : `${url}_sm.webp`
    const res = await fetch(`${SUPA}/storage/v1/object/product-images/${path}`, { method: 'POST', headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'content-type': 'image/png', 'x-upsert': 'true' }, body: png })
    if (!res.ok)
      throw new Error(`фото в хранилище: ${res.status} ${await res.text()}`)
    photoPaths.push(path)
  }
  return images.length
}
async function cleanup() {
  for (const path of photoPaths)
    await fetch(`${SUPA}/storage/v1/object/product-images/${path}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).catch(() => {})
  if (!d)
    return
  psql(`
BEGIN;
DELETE FROM public.stock_receipts WHERE product_id IN (:'pa', :'pb', :'pc');
DELETE FROM public.supplier_orders WHERE supplier_id = :'sup';
UPDATE public.products p SET supplier_id = s.supplier_id, stock_quantity = s.stock_quantity,
  min_stock_level = s.min_stock_level, restock_quantity = s.restock_quantity, cost_price = s.cost_price
FROM json_to_recordset(:'saved'::json) AS s(id uuid, supplier_id uuid, stock_quantity integer, min_stock_level integer, restock_quantity integer, cost_price numeric)
WHERE p.id = s.id;
DELETE FROM public.stock_alerts WHERE product_id = :'pa' AND user_id IN (SELECT id FROM auth.users WHERE email LIKE 'restock-%@example.test');
DELETE FROM public.suppliers WHERE id = :'sup';
COMMIT;
`, { sup: d.sup, pa: d.pa, pb: d.pb, pc: d.pc, saved: JSON.stringify(d.saved) })
}

const browser = await chromium.launch()
try {
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  d = setup(adminId, buyerId)
  const name = id => d.names[id]
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}; товары: A «${name(d.pa)}» (0, ждёт 1), B «${name(d.pb)}» (1), C «${name(d.pc)}» (9)`)

  console.log('\n== маршруты')
  const body = { supplierId: d.sup, items: [{ productId: d.pa, quantity: 1 }] }
  check((await api('/api/admin/restock/orders', null, body)).status === 401, 'заказ: гость — 401')
  check((await api('/api/admin/restock/orders', buyerToken, body)).status === 403, 'заказ: не-администратор — 403')
  const empty = await api('/api/admin/restock/orders', adminToken, { supplierId: d.sup, items: [] })
  check(empty.status === 400 && /пуст/.test(empty.json?.message), `пустой заказ — 400 «${empty.json?.message}»`)
  const [foreign] = await rest('products?select=id&is_active=eq.true&supplier_id=is.null&limit=1')
  const wrong = await api('/api/admin/restock/orders', adminToken, { supplierId: d.sup, items: [{ productId: foreign.id, quantity: 1 }] })
  check(wrong.status === 400 && /Не товары этого поставщика/.test(wrong.json?.message), `чужой товар — 400 «${wrong.json?.message}»`)
  check((await api(`/api/admin/restock/orders/${d.sup}/receive`, buyerToken, { items: [] })).status === 403, 'приёмка: не-администратор — 403')
  const restock = await api('/api/admin/restock', adminToken)
  check(Array.isArray(restock.json?.orders) && restock.json.orders.length === 0, 'список: заказы приходят массивом (миграция применена)')
  check((await rest(`supplier_orders?select=id&supplier_id=eq.${d.sup}`)).length === 0, 'после отказов заказов в базе нет')

  const errors = []
  const failed = []
  const revalidate = []
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, acceptDownloads: true })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    // Окно подписки на Telegram (app.vue) всплывает и в админке и перекрывает
    // кнопки — как будто человек уже нажал в нём «Не сейчас»
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/revalidate'))
        revalidate.push(r.status())
      // Известное, не отсюда: предзагрузка данных ссылок шапки на пустой
      // локальной базе (404) и серверная корзина вошедшего без корзины —
      // cartStore читает её через .single(), PostgREST отвечает 406
      else if (r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts')))
        failed.push(`${r.status()} ${r.url().replace(BASE, '')}`)
    })
    await page.goto(`${BASE}/about`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
    // Вход браузерным клиентом самого сайта — им же ходит adminFetch
    const loginError = await page.evaluate(async ({ email, password }) => {
      const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      const { error } = await nuxt.$supabase.client.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    }, { email: emails.admin, password: PASSWORD })
    if (loginError)
      throw new Error(`вход: ${loginError}`)
    await page.goto(`${BASE}/admin/restock`, { waitUntil: 'load', timeout: 120000 })
    await page.locator(`[data-testid=supplier-block][data-supplier="${SUPPLIER}"]`).waitFor({ timeout: 30000 })
    return page
  }
  const block = page => page.locator(`[data-testid=supplier-block][data-supplier="${SUPPLIER}"]`)
  async function expand(page) {
    if (!(await block(page).locator('[data-testid=order-panel]').isVisible()))
      await block(page).locator('[data-slot=card-header], .cursor-pointer').first().click()
  }
  const dbOrders = () => rest(`supplier_orders?select=id,number,status,created_by,closed_at,supplier_order_items(product_id,quantity,received_quantity)&supplier_id=eq.${d.sup}&order=number`)
  const stock = async id => (await rest(`products?select=stock_quantity&id=eq.${id}`))[0].stock_quantity

  console.log('\n== «Заказал», 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  const rowIds = await block(page).locator('[data-testid=restock-row]').evaluateAll(rows => rows.map(r => r.dataset.product))
  check(rowIds.length === 2 && rowIds.includes(d.pa) && rowIds.includes(d.pb), 'на пороге A и B, C с остатком 9 — нет')
  await block(page).locator(`[data-testid=restock-row][data-product="${d.pa}"] [data-testid=order-qty]`).fill('4')
  await block(page).locator(`[data-testid=restock-row][data-product="${d.pa}"] [data-testid=order-qty]`).press('Tab')
  const flat = t => t.replace(/\s+/g, ' ').trim()
  const tg = n => flat(`${new Intl.NumberFormat('ru-RU').format(Math.round(n))} ₸`)
  const saleA = Number(d.sale[d.pa])
  const saleB = Number(d.sale[d.pb])
  const draftMoney = flat(await block(page).locator('[data-testid=order-money]').innerText())
  check(draftMoney.includes(`закупка ${tg(4000)}`) && draftMoney.includes(`в продаже ${tg(4 * saleA + 5 * saleB)}`) && draftMoney.includes(`наценка ${tg(4 * (saleA - 1000))}`) && draftMoney.includes('без цены закупки — 1'), `черновик: закупка A 4 × 1 000, продажа A и B, наценка — только у A, у B нет закупки: «${draftMoney}»`)
  const rowPrices = flat(await block(page).locator(`[data-testid=restock-row][data-product="${d.pa}"]`).innerText())
  check(rowPrices.includes(`по ${tg(1000)}`) && rowPrices.includes(`продажа ${tg(saleA)}`) && rowPrices.includes(tg(4000)), `строка A: цена за штуку, сумма и цена продажи: «${rowPrices}»`)
  async function sheetOf(button) {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), button.click()])
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(await download.path())
    const ws = book.worksheets[0]
    const rows = []
    ws.eachRow((r, n) => n > 3 && rows.push(r.values.slice(1).map(v => (v && typeof v === 'object' && 'result' in v) ? v.result : v)))
    return { name: download.suggestedFilename(), title: String(ws.getCell('A1').value), rows, images: ws.getImages().length }
  }
  const photosA = await putPhotos(d.pa)
  await putPhotos(d.pb)
  const draftSheet = await sheetOf(block(page).locator('[data-testid=order-sheet]'))
  check(photosA > 0 && draftSheet.images >= 1, `в таблице — фото товара: ${draftSheet.images} (у A фото в базе: ${photosA})`)
  const rowA = draftSheet.rows.find(r => r[2] === name(d.pa))
  const rowB = draftSheet.rows.find(r => r[2] === name(d.pb))
  const sheetTotal = draftSheet.rows.find(r => r[2] === 'Итого')
  check(/^zakaz-.+-\d{4}-\d{2}-\d{2}\.xlsx$/.test(draftSheet.name) && draftSheet.title.includes(SUPPLIER), `таблица черновика: ${draftSheet.name}, «${draftSheet.title}»`)
  check(rowA?.[4] === 1000 && rowA?.[5] === 4 && rowA?.[6] === 4000 && (rowB?.[4] ?? '') === '' && rowB?.[5] === 5 && sheetTotal?.[5] === 9 && sheetTotal?.[6] === 4000, `в таблице: A 1 000 × 4 = 4 000, B без цены × 5, итого 9 шт. на 4 000: ${JSON.stringify([rowA?.slice(2, 7), rowB?.slice(2, 7), sheetTotal?.slice(5, 7)])}`)
  check(draftSheet.rows.every(r => !r.includes(saleA) || saleA === 1000 || saleA === 4000), 'цены продажи в таблице поставщику нет')
  await block(page).locator('[data-testid=order-place]').click()
  await block(page).locator('[data-testid=supplier-order]').first().waitFor({ timeout: 15000 })
  let [o1] = await dbOrders()
  const line = (o, id) => o?.supplier_order_items.find(i => i.product_id === id)
  check(o1?.status === 'ordered' && o1.created_by === adminId && line(o1, d.pa)?.quantity === 4 && line(o1, d.pb)?.quantity === 5 && o1.supplier_order_items.length === 2, `заказ №${o1?.number} в базе: «Заказан», A 4 (правка), B 5 (по правилу), кто заказал`)
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('uhti-admin-restock-v1') || '{}'))
  check(!draft.drafts?.[d.sup], 'черновик поставщика в браузере сброшен')
  const savedMoney = flat(await block(page).locator('[data-testid=order-saved-money]').innerText())
  check(savedMoney.includes(`закупка ${tg(4000)}`) && savedMoney.includes(`в продаже ${tg(4 * saleA + 5 * saleB)}`), `сохранённый заказ — те же деньги: «${savedMoney}»`)
  const savedLineA = flat(await block(page).locator('[data-testid=supplier-order-line]', { hasText: name(d.pa) }).innerText())
  check(savedLineA.includes(`4 шт. × ${tg(1000)} = ${tg(4000)}`) && savedLineA.includes(`продажа ${tg(saleA)}`), `строка заказа: «${savedLineA}»`)
  const savedSheet = await sheetOf(block(page).locator('[data-testid=order-saved-sheet]'))
  check(savedSheet.name.startsWith(`zakaz-${o1.number}-`) && savedSheet.title.startsWith(`Заказ №${o1.number} `) && savedSheet.rows.find(r => r[2] === 'Итого')?.[5] === 9, `таблица сохранённого заказа — с номером: ${savedSheet.name}, «${savedSheet.title}»`)
  check(await block(page).locator('[data-testid=restock-row]').count() === 0, 'A и B больше не просятся в заказ: заказанное учтено')
  check((await block(page).locator('[data-testid=open-orders-badge]').innerText()).includes('1 заказ'), 'в заголовке поставщика — «1 заказ»')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/restock-order-1366.png`, fullPage: true })

  console.log('\n== телефон 390 px')
  const mobile = await newPage({ width: 390, height: 844 })
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'страница с открытым заказом — без горизонтальной прокрутки')
  const card = await block(mobile).boundingBox()
  const badge = await block(mobile).locator('[data-testid=open-orders-badge]').boundingBox()
  check(badge && badge.x + badge.width <= card.x + card.width, 'длинное имя поставщика не выталкивает бейджи за край карточки')
  if (SHOTS)
    await block(mobile).screenshot({ path: `${SHOTS}/restock-order-390.png` })
  await block(mobile).locator('[data-testid=order-receive]').click()
  await mobile.locator('[data-testid=receive-dialog]').waitFor()
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'окно приёмки — без горизонтальной прокрутки')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/restock-receive-390.png` })
  await mobile.keyboard.press('Escape')
  await mobile.context().close()

  console.log('\n== «В пути» и приёмка частями')
  await block(page).locator('[data-testid=order-shipped]').click()
  await block(page).locator('[data-testid=supplier-order][data-status=in_transit]').waitFor({ timeout: 15000 })
  ;[o1] = await dbOrders()
  check(o1.status === 'in_transit', '«В пути» — в базе')
  await block(page).locator('[data-testid=order-receive]').click()
  const dialog = page.locator('[data-testid=receive-dialog]')
  await dialog.waitFor()
  check(await dialog.getByLabel(`Пришло: ${name(d.pa)}`, { exact: true }).inputValue() === '4' && await dialog.getByLabel(`Пришло: ${name(d.pb)}`, { exact: true }).inputValue() === '5', 'по умолчанию — всё, что ждём: A 4, B 5')
  check((await dialog.locator('[data-testid=receive-waiting]').innerText()).includes('ждёт 1 — получит'), 'у A (остаток 0) — «ждёт 1 — получит „Товар снова в наличии“»')
  check(/Будет принято 9 шт\.[\s\S]*уйдёт 1 покупателю/.test(await dialog.locator('[data-testid=receive-summary]').innerText()), 'итог: 9 шт., уведомление уйдёт 1 покупателю')
  const receiveText = flat(await dialog.locator('[data-testid=receive-summary]').innerText())
  check(receiveText.includes(`на ${tg(4000)} по закупке`) && receiveText.includes(`в продаже ${tg(4 * saleA + 5 * saleB)}`), `приёмка — на сколько по закупке и в продаже: «${receiveText}»`)
  check(flat(await dialog.locator('[data-testid=receive-line]', { hasText: name(d.pa) }).innerText()).includes(`закупка ${tg(1000)}`), 'в строке приёмки — цена закупки')
  await dialog.getByLabel(`Пришло: ${name(d.pb)}`, { exact: true }).fill('2')
  await dialog.getByLabel(`Пришло: ${name(d.pb)}`, { exact: true }).press('Tab')
  check(await dialog.locator('[data-testid=receive-close]').isVisible(), 'пришло меньше — предлагается «остального не будет»')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/restock-receive-1366.png` })
  await dialog.locator('[data-testid=receive-submit]').click()
  await dialog.waitFor({ state: 'hidden', timeout: 15000 })
  await page.waitForTimeout(1500)
  ;[o1] = await dbOrders()
  check(o1.status === 'in_transit' && line(o1, d.pa).received_quantity === 4 && line(o1, d.pb).received_quantity === 2, 'принято A 4 из 4, B 2 из 5 — заказ ждёт остальное')
  check(await stock(d.pa) === 4 && await stock(d.pb) === 3, 'остатки: A 0 + 4, B 1 + 2')
  const receipts = await rest(`stock_receipts?select=product_id,quantity,stock_before,stock_after,received_by&order_id=eq.${o1.id}`)
  check(receipts.length === 2 && receipts.every(r => r.received_by === adminId) && receipts.some(r => r.product_id === d.pa && r.stock_before === 0 && r.stock_after === 4), 'журнал приёмки: две записи, остаток до и после, кто принял')
  const notes = await rest(`notifications?select=type&user_id=eq.${buyerId}&type=eq.back_in_stock`)
  check(notes.length === 1 && (await rest(`stock_alerts?select=user_id&user_id=eq.${buyerId}`)).length === 0, 'ждавшему — «Товар снова в наличии», подписка снята')
  check(revalidate.length > 0 && revalidate.every(s => s === 200), `кеш карточек сброшен сразу: /api/admin/revalidate ${revalidate.join(', ') || 'не вызывался'}`)
  check((await block(page).locator('[data-testid=supplier-order]').innerText()).includes('принято 6'), 'в заказе — «принято 6»')

  console.log('\n== «Закрыть», «Отменить», «Текст»')
  await block(page).locator('[data-testid=order-close]').click()
  await page.locator('[data-testid=confirm-order-action]').click()
  await page.waitForTimeout(1500)
  ;[o1] = await dbOrders()
  check(o1.status === 'received' && o1.closed_at, 'частично принятый закрыт после подтверждения')

  await expand(page)
  await block(page).locator('[data-testid=order-add]').click()
  await page.locator('[data-testid=order-add-item]', { hasText: name(d.pc) }).click()
  await block(page).locator('[data-testid=order-place]').click()
  await block(page).locator('[data-testid=supplier-order]').first().waitFor({ timeout: 15000 })
  const o2 = (await dbOrders()).at(-1)
  check(o2.status === 'ordered' && line(o2, d.pc)?.quantity === 5, `заказ №${o2.number}: C добавлен вручную, 5 шт.`)
  await block(page).locator('[data-testid=order-saved-copy]').click()
  await page.waitForTimeout(500)
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  check(copied.includes(`Заказ №${o2.number} от магазина «Ухтышка»`) && copied.includes(`${name(d.pc)} — 5 шт.`), '«Текст» сохранённого заказа — с номером и строкой')
  await block(page).locator('[data-testid=order-cancel]').click()
  await page.locator('[data-testid=confirm-order-action]').click()
  await page.waitForTimeout(1500)
  check((await dbOrders()).at(-1).status === 'cancelled', 'отменён после подтверждения')
  await expand(page)
  await block(page).locator('[data-testid=closed-orders-toggle]').click()
  const closed = await block(page).locator('[data-testid=closed-orders]').innerText()
  check(closed.includes(`№${o1.number}`) && closed.includes('принято 6 из 9 шт.') && closed.includes(`№${o2.number}`) && closed.includes('отменён'), 'закрытые за 30 дней: принятый 6 из 9 и отменённый')

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
finally {
  await browser.close()
  await cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

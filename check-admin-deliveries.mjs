/*
 * «Поставки» (26.11.2026) — только на ЛОКАЛЬНОЙ базе с миграцией
 * 20261126140000_supplier_deliveries.
 *
 * Владелец: «товар, который добавляется на сайт, автоматически должен
 * добавляться в заказ к поставщику … раздел поставки от поставщиков … с
 * примерной датой ожидания, и там должна происходить сверка товаров: сколько
 * пришло и сколько нет, как в SAP-портале. Как только я поставку оприходую,
 * она уже появляется в основном складе; пока поставка не принята, товары не
 * добавляются, а если тот же товар — остатки увеличиваются».
 *
 * Проверяет:
 *  1) маршруты: гость — 401, не-администратор — 403, негодное тело — 400,
 *     товар без поставщика — 400 с причиной;
 *  2) «На сайт» → заказ поставщику: поле «В заказ поставщику» берёт
 *     количество из «В заказ» (3), товар создаётся скрытым и ложится в
 *     формирующийся заказ своего поставщика, отметка «В заказ» снята,
 *     поисковикам о скрытом не сказано;
 *  3) тот же поставщик — тот же заказ (копится), остаток до приёмки не
 *     меняется; количество правится; таблица и текст для поставщика; шаг и
 *     кнопка «Поставки» на дашборде;
 *  4) «Заказано» — дата через 3 дня по умолчанию; правка даты; опаздывает;
 *     следующий товар — уже новый заказ; формирующийся удаляется;
 *  5) приёмка частями: окно говорит, что новый товар появится на сайте, и
 *     сверку строки; остатки прибавлены, новый товар на сайте, поисковикам
 *     сказано; сверка по строкам; «Закрыть» — недостача в закрытых;
 *  6) телефон 390 px: без горизонтальной прокрутки, окно даты в ширину экрана;
 *  7) база без миграции (колонки поставок и функция добавления спрятаны):
 *     раздел говорит, что ждёт миграции, открытые заказы видны и
 *     принимаются; «На сайт» создаёт товар видимым, а не скрытым навсегда;
 *     шаг дашборда — «позже»; «К закупке» работает;
 *  без ошибок консоли.
 *
 * Данные заводит сам — поставщик с каналом и двумя постами, товар с остатком
 * на нём, администратор и покупатель — и в конце всё возвращает.
 *
 *   node check-admin-deliveries.mjs --base=http://localhost:3142
 *
 * Стенд: сборка на локальной базе. SHOTS=<папка> — скриншоты.
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import ExcelJS from 'exceljs'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3142'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SUPPLIER = 'Поставщик проверки поставок'
const NEW_NAME = 'Машинка проверки поставок'
const NEW_SKU = 'PD-NEW-1'
const OFF_NAME = 'Кукла проверки поставок'
const OFF_SKU = 'PD-NEW-2'
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, товары и меняет остатки')

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
// Функции миграции созданы supabase_admin — переименовать их может он
function psqlSuper(sql) {
  return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', DB_CONTAINER, 'psql', '-w', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }).trim()
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
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function until(fn, ms = 15000) {
  const end = Date.now() + ms
  for (;;) {
    const value = await fn()
    if (value || Date.now() > end)
      return value
    await sleep(300)
  }
}

const flat = t => (t ?? '').replace(/\s+/g, ' ').trim()
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date())
function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const dm = day => `${day.slice(8, 10)}.${day.slice(5, 7)}`
const todayRu = `${dm(today)}.${today.slice(0, 4)}`

const stamp = Date.now()
const emails = { admin: `deliveries-admin-${stamp}@example.test`, buyer: `deliveries-buyer-${stamp}@example.test` }
const users = []
let d = null
let hidden = false

const ITEM = (name, sku, price) => JSON.stringify([{ name, article: sku, brand: null, price_text: price, price_image: null, price_note: null, age: null, confidence: 'high', doubt: null }])

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
INSERT INTO public.suppliers (name, phone) VALUES ('${SUPPLIER}', '+7 701 000 00 22') RETURNING id AS sup \\gset
INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview)
VALUES (:'sup', 'probe_deliveries', 'Проверка поставок', 'channel', true) RETURNING id AS ch \\gset
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, caption, post_url, read_items)
VALUES (:'ch', 1, now(), '${NEW_NAME}, арт. ${NEW_SKU}', 'https://t.me/probe_deliveries/1', '${ITEM(NEW_NAME, NEW_SKU, 1200)}'::jsonb) RETURNING id AS o1 \\gset
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, caption, post_url, read_items)
VALUES (:'ch', 2, now(), '${OFF_NAME}, арт. ${OFF_SKU}', 'https://t.me/probe_deliveries/2', '${ITEM(OFF_NAME, OFF_SKU, 800)}'::jsonb) RETURNING id AS o2 \\gset
SELECT id AS old FROM public.products WHERE is_active AND stock_quantity BETWEEN 1 AND 50 ORDER BY name, id LIMIT 1 \\gset
SELECT json_build_object('id', id, 'supplier_id', supplier_id, 'stock_quantity', stock_quantity, 'cost_price', cost_price, 'is_active', is_active)::text AS saved
FROM public.products WHERE id = :'old' \\gset
UPDATE public.products SET supplier_id = :'sup', cost_price = 700 WHERE id = :'old';
SELECT coalesce((SELECT id::text FROM public.products WHERE supplier_id IS NULL ORDER BY id LIMIT 1), '') AS nosup \\gset
COMMIT;
SELECT json_build_object('sup', :'sup', 'ch', :'ch', 'o1', :'o1', 'o2', :'o2', 'old', :'old', 'nosup', :'nosup', 'saved', :'saved'::json,
  'oldName', (SELECT btrim(name) FROM public.products WHERE id = :'old'));
`, { admin: adminId })
  return JSON.parse(out.split('\n').pop())
}

function cleanup() {
  if (!d)
    return
  psql(`
BEGIN;
DELETE FROM public.stock_receipts WHERE order_id IN (SELECT id FROM public.supplier_orders WHERE supplier_id = :'sup');
DELETE FROM public.supplier_orders WHERE supplier_id = :'sup';
UPDATE public.products p SET supplier_id = s.supplier_id, stock_quantity = s.stock_quantity, cost_price = s.cost_price, is_active = s.is_active
FROM json_to_recordset(:'saved'::json) AS s(id uuid, supplier_id uuid, stock_quantity integer, cost_price numeric, is_active boolean)
WHERE p.id = s.id;
DELETE FROM public.products WHERE sku IN ('${NEW_SKU}', '${OFF_SKU}') AND name IN ('${NEW_NAME}', '${OFF_NAME}');
DELETE FROM public.supplier_channels WHERE id = :'ch';
DELETE FROM public.suppliers WHERE id = :'sup';
COMMIT;
`, { sup: d.sup, ch: d.ch, saved: JSON.stringify([d.saved]) })
}

// База «до 20261126140000»: без колонок поставок (выборки с ними — 42703) и без функции добавления (PGRST202)
function hide(off) {
  const [from, to] = off ? ['', '_check_off'] : ['_check_off', '']
  psqlSuper(`BEGIN;
ALTER TABLE public.supplier_orders RENAME COLUMN ordered_at${from} TO ordered_at${to};
ALTER TABLE public.supplier_orders RENAME COLUMN expected_at${from} TO expected_at${to};
ALTER TABLE public.supplier_order_items RENAME COLUMN show_on_receipt${from} TO show_on_receipt${to};
ALTER FUNCTION public.admin_add_to_supplier_draft${from}(uuid, integer, uuid, boolean) RENAME TO admin_add_to_supplier_draft${to};
COMMIT;
NOTIFY pgrst, 'reload schema';`)
}

const browser = await chromium.launch()
const pages = []
const errors = []
const failed = []
try {
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  d = setup(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  const oldStock = d.saved.stock_quantity
  console.log(`стенд ${BASE}; товар с остатком: «${d.oldName}» (${oldStock}); сегодня по Алматы ${today}`)

  console.log('\n== маршруты')
  const addBody = { productId: d.old, quantity: 1, showOnReceipt: false }
  for (const [path, body] of [['/api/admin/deliveries', null], ['/api/admin/deliveries/add', addBody], [`/api/admin/deliveries/${d.sup}/place`, { expectedAt: null }], [`/api/admin/deliveries/${d.sup}/lines`, { items: [] }]]) {
    const guest = await api(path, null, body)
    const buyer = await api(path, buyerToken, body)
    check(guest.status === 401 && buyer.status === 403, `${path}: гость — ${guest.status}, не-администратор — ${buyer.status}`)
  }
  const zero = await api('/api/admin/deliveries/add', adminToken, { ...addBody, quantity: 0 })
  check(zero.status === 400 && /от 1 до 9999/.test(zero.json?.message), `0 штук — 400 «${zero.json?.message}»`)
  const badDate = await api(`/api/admin/deliveries/${d.sup}/place`, adminToken, { expectedAt: '26.11.2026' })
  check(badDate.status === 400 && /ГГГГ-ММ-ДД/.test(badDate.json?.message), `дата не в том виде — 400 «${badDate.json?.message}»`)
  if (d.nosup) {
    const nosup = await api('/api/admin/deliveries/add', adminToken, { productId: d.nosup, quantity: 1, showOnReceipt: false })
    check(nosup.status === 400 && /не указан поставщик/.test(nosup.json?.message), `товар без поставщика — 400 «${nosup.json?.message}»`)
  }
  const first = await api('/api/admin/deliveries', adminToken)
  check(first.status === 200 && first.json?.ready === true && first.json.today === today, `список: миграция применена, сегодня ${first.json?.today}`)
  check((await rest(`supplier_orders?select=id&supplier_id=eq.${d.sup}`)).length === 0, 'после отказов заказов в базе нет')

  const seo = []
  const allowFailed = []
  async function newPage(viewport, path) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, acceptDownloads: true })
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
    // Окно подписки на Telegram (app.vue) перекрывает кнопки — как будто в нём уже нажали «Не сейчас»
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    // Поисковики — заглушкой: считаем, о каких адресах им сказали
    await ctx.route('**/api/seo/notify-indexing', async (r) => {
      seo.push(JSON.parse(r.request().postData() || '{}').urls ?? [])
      await r.fulfill({ json: { success: true, indexnow: { submitted: false, urls_count: 0 }, yandex_ping: { submitted: false }, bing_ping: { submitted: false } } })
    })
    const page = await ctx.newPage()
    pages.push(page)
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      // Известное, не отсюда: предзагрузка данных ссылок шапки на пустой локальной
      // базе (404), серверная корзина вошедшего без корзины (406) и фото
      // готового товара — локальные бакеты пустые (400)
      if (r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts'))
        && !(r.status() === 400 && r.url().startsWith(`${SUPA}/storage/v1/object/public/`))
        && !allowFailed.some(a => r.status() === a.status && r.url().includes(a.path))) {
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
  const dbOrders = () => rest(`supplier_orders?select=id,number,status,ordered_at,expected_at,closed_at,supplier_order_items(id,product_id,quantity,received_quantity,show_on_receipt)&supplier_id=eq.${d.sup}&order=number`)
  const productBy = async sku => (await rest(`products?select=id,slug,is_active,stock_quantity&sku=eq.${sku}`))[0] ?? null
  const stock = async id => (await rest(`products?select=stock_quantity&id=eq.${id}`))[0].stock_quantity
  const lineOf = (o, id) => o?.supplier_order_items.find(i => i.product_id === id)

  console.log('\n== «На сайт» → заказ поставщику')
  const page = await newPage({ width: 1366, height: 900 })
  // Отметка «В заказ» на «Товарах поставщиков» — 3 штуки этого товара
  await page.evaluate(({ key, sku, name }) => localStorage.setItem('admin-supplier-order', JSON.stringify({ [key]: { key, supplier: 'x', name, article: sku, price: 1200, quantity: 3, photoUrl: null, link: null } })), { key: `${d.o1}:0`, sku: NEW_SKU, name: NEW_NAME })
  await page.goto(`${BASE}/admin/products/new?offer=${d.o1}&item=0`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=supplier-order]').waitFor({ timeout: 30000 })
  await until(async () => await page.locator('#name').inputValue() === NEW_NAME)
  check(await page.locator('[data-testid=supplier-order-qty]').inputValue() === '3' && await page.locator('[data-testid=supplier-order-picked]').isVisible(), '«В заказ поставщику» — 3 шт. из отметки «В заказ»')
  check(flat(await page.locator('[data-testid=supplier-order-hint]').innerText()).includes('До приёмки он скрыт с сайта'), 'под полем — что товар скрыт до приёмки')
  check(await page.getByRole('combobox').filter({ hasText: SUPPLIER }).count() === 1, 'в форме выбран поставщик поста')
  if (SHOTS)
    await page.locator('[data-testid=supplier-order]').screenshot({ path: `${SHOTS}/deliveries-new-product-1366.png` })
  await page.locator('#price').fill('2490')
  await page.getByRole('button', { name: 'Создать товар' }).click()
  await page.waitForURL(u => u.pathname === '/admin/products', { timeout: 60000 })
  const created = await until(() => productBy(NEW_SKU))
  let [o1] = await dbOrders()
  check(created && created.is_active === false && created.stock_quantity === 0, `товар создан скрытым, остаток 0: ${JSON.stringify(created && { active: created.is_active, stock: created.stock_quantity })}`)
  check(o1?.status === 'draft' && o1.ordered_at === null && o1.supplier_order_items.length === 1 && lineOf(o1, created?.id)?.quantity === 3 && lineOf(o1, created?.id)?.show_on_receipt === true, `в формирующемся заказе №${o1?.number}: 3 шт., «показать при приёмке»`)
  const picksLeft = await page.evaluate(() => JSON.parse(localStorage.getItem('admin-supplier-order') || '{}'))
  check(!picksLeft[`${d.o1}:0`], 'отметка «В заказ» снята — поставщику не уйдёт дважды')
  check(!seo.length, `о скрытом товаре поисковикам не сказано: ${JSON.stringify(seo)}`)
  check(psql(`SELECT status FROM public.supplier_offers WHERE id = :'o';`, { o: d.o1 }) === 'added', 'у поставщика пост отмечен «Добавлен»')

  console.log('\n== тот же поставщик — тот же заказ')
  const again = await api('/api/admin/deliveries/add', adminToken, { productId: d.old, quantity: 2, showOnReceipt: false })
  check(again.status === 200 && again.json.created === false && again.json.number === o1.number && again.json.positions === 2, `товар с остатком — в тот же №${again.json?.number}: ${again.json?.positions} позиции`)
  check(await stock(d.old) === oldStock && (await rest(`products?select=is_active&id=eq.${d.old}`))[0].is_active === true, 'до приёмки остаток не меняется, видимый товар не скрыт')

  await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=step-deliveries]').waitFor({ timeout: 30000 })
  const stepState = await page.locator('[data-testid=step-deliveries]').getAttribute('data-state')
  const stepFacts = flat(await page.locator('[data-testid=step-deliveries] [data-testid=step-facts]').textContent().catch(() => ''))
  check(stepState === 'action' && stepFacts.includes('формируется 1 заказ: 2 позиции'), `дашборд: шаг «Поставки» ждёт «Заказано» — «${stepFacts}»`)
  check(await page.locator('[data-testid=purchasing-pages] a[href="/admin/deliveries"]').count() === 1, 'дашборд: кнопка «Поставки»')

  console.log('\n== формируется, 1366 px')
  await page.goto(`${BASE}/admin/deliveries`, { waitUntil: 'load', timeout: 120000 })
  const draftCard = page.locator(`[data-testid=deliveries-forming] [data-testid=delivery-order][data-number="${o1.number}"]`)
  await draftCard.waitFor({ timeout: 30000 })
  check(flat(await draftCard.locator('[data-testid=delivery-totals]').innerText()).startsWith('2 позиции, 5 шт.'), `«${flat(await draftCard.locator('[data-testid=delivery-totals]').innerText())}»`)
  check(flat(await draftCard.locator(`[data-testid=delivery-line][data-product="${created.id}"] [data-testid=line-hidden]`).innerText()) === 'скрыт с сайта — появится после приёмки', 'новый товар — «скрыт с сайта — появится после приёмки»')
  await draftCard.locator(`[data-testid=delivery-line][data-product="${d.old}"] [data-testid=draft-qty]`).fill('4')
  await draftCard.locator(`[data-testid=delivery-line][data-product="${d.old}"] [data-testid=draft-qty]`).press('Tab')
  check(await until(async () => lineOf((await dbOrders())[0], d.old)?.quantity === 4), 'количество в формирующемся поправлено: 4')
  await until(async () => flat(await draftCard.locator('[data-testid=delivery-totals]').innerText()).includes('7 шт.'))
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), draftCard.locator('[data-testid=draft-sheet]').click()])
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(await download.path())
  const rows = []
  book.worksheets[0].eachRow((r, n) => n > 3 && rows.push(r.values.slice(1).map(v => (v && typeof v === 'object' && 'result' in v) ? v.result : v)))
  const sheetNew = rows.find(r => r[2] === NEW_NAME)
  const sheetOld = rows.find(r => r[2] === d.oldName)
  check(download.suggestedFilename().startsWith(`zakaz-${o1.number}-`) && sheetNew?.[5] === 3 && sheetOld?.[5] === 4 && sheetOld?.[4] === 700, `таблица поставщику: ${download.suggestedFilename()}, новый 3, с остатком 4 по 700`)
  await draftCard.locator('[data-testid=draft-copy]').click()
  await sleep(400)
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  check(copied.includes(`Заказ №${o1.number} от магазина «Ухтышка», ${todayRu}`) && copied.includes(`${NEW_SKU} — ${NEW_NAME} — 3 шт.`), `текст поставщику — с номером, сегодняшней датой и строками`)
  check(await draftCard.locator('[data-testid=draft-whatsapp]').count() === 1, 'у поставщика с телефоном — WhatsApp')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/deliveries-forming-1366.png`, fullPage: true })

  console.log('\n== телефон 390 px — формируется')
  const mobile = await newPage({ width: 390, height: 844 }, '/admin/deliveries')
  await mobile.locator(`[data-testid=delivery-order][data-number="${o1.number}"]`).waitFor({ timeout: 30000 })
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'формирующийся заказ на телефоне — без горизонтальной прокрутки')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/deliveries-forming-390.png`, fullPage: true })

  console.log('\n== «Заказано»')
  await draftCard.locator('[data-testid=draft-place]').click()
  const dateDialog = page.locator('[data-testid=date-dialog]')
  await dateDialog.waitFor()
  check(await dateDialog.locator('[data-testid=date-input]').inputValue() === addDays(today, 3) && flat(await dateDialog.locator('[data-testid=date-hint]').innerText()) === 'через 3 дня', `дата по умолчанию — через 3 дня: ${await dateDialog.locator('[data-testid=date-input]').inputValue()}`)
  await dateDialog.locator('[data-testid=date-submit]').click()
  const waitCard = page.locator(`[data-testid=deliveries-waiting] [data-testid=delivery-order][data-number="${o1.number}"]`)
  await waitCard.waitFor({ timeout: 15000 })
  ;[o1] = await dbOrders()
  check(o1.status === 'ordered' && o1.ordered_at && o1.expected_at === addDays(today, 3), `в базе: «Заказан», дата заказа, ждём ${o1.expected_at}`)
  const expected = waitCard.locator('[data-testid=delivery-expected]')
  check(await expected.getAttribute('data-kind') === 'ahead' && flat(await expected.innerText()) === `ждём ${dm(addDays(today, 3))} — через 3 дня`, `«${flat(await expected.innerText())}»`)
  const states = await waitCard.locator('[data-testid=delivery-line]').evaluateAll(ls => ls.map(l => l.dataset.state))
  check(states.length === 2 && states.every(s => s === 'waiting'), `сверка до приёмки — обе строки «ждём»: ${states.join(', ')}`)
  const before = flat(await waitCard.locator('[data-testid=delivery-check]').innerText())
  check(before === 'пока ничего не пришло — ждём 7 шт.', `сверка заказа до приёмки: «${before}»`)

  await mobile.reload({ waitUntil: 'load' })
  const mobileCard = mobile.locator(`[data-testid=deliveries-waiting] [data-testid=delivery-order][data-number="${o1.number}"]`)
  await mobileCard.waitFor({ timeout: 30000 })
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'заказ со сверкой на телефоне — без горизонтальной прокрутки')
  await mobileCard.locator('[data-testid=order-expected]').click()
  await mobile.locator('[data-testid=date-dialog]').waitFor()
  // Окно открывается с анимацией — снимок и размеры после неё
  await mobile.waitForTimeout(400)
  const dialogFits = await mobile.locator('[data-testid=date-dialog]').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth && el.getBoundingClientRect().left >= 0)
  check(dialogFits && await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'окно даты на телефоне — в ширину экрана')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/deliveries-date-390.png` })
  await mobile.keyboard.press('Escape')
  if (SHOTS) {
    await mobile.waitForTimeout(300)
    await mobileCard.screenshot({ path: `${SHOTS}/deliveries-waiting-390.png` })
  }

  await waitCard.locator('[data-testid=order-expected]').click()
  await dateDialog.waitFor()
  await dateDialog.locator('[data-testid=date-input]').fill(today)
  check(flat(await dateDialog.locator('[data-testid=date-hint]').innerText()) === 'сегодня', 'подсказка у даты — «сегодня»')
  await dateDialog.locator('[data-testid=date-submit]').click()
  await until(async () => await expected.getAttribute('data-kind') === 'today')
  check(await expected.getAttribute('data-kind') === 'today' && (await dbOrders())[0].expected_at === today, `дату поправили на сегодня: «${flat(await expected.innerText())}»`)
  psql(`UPDATE public.supplier_orders SET expected_at = :'day' WHERE id = :'id';`, { day: addDays(today, -2), id: o1.id })
  await page.reload({ waitUntil: 'load' })
  await waitCard.waitFor({ timeout: 30000 })
  check(await expected.getAttribute('data-kind') === 'late' && flat(await expected.innerText()) === `ждали ${dm(addDays(today, -2))} — опаздывает на 2 дня`, `прошла — опаздывает: «${flat(await expected.innerText())}»`)
  check(flat(await page.locator('[data-testid=deliveries-summary]').innerText()).includes('опаздывает 1'), 'сверху — «опаздывает 1»')

  const next = await api('/api/admin/deliveries/add', adminToken, { productId: d.old, quantity: 1, showOnReceipt: false })
  check(next.status === 200 && next.json.created === true && next.json.number !== o1.number, `после «Заказано» товар этого поставщика — в новый заказ №${next.json?.number}`)
  await page.reload({ waitUntil: 'load' })
  const draft2 = page.locator(`[data-testid=deliveries-forming] [data-testid=delivery-order][data-number="${next.json.number}"]`)
  await draft2.waitFor({ timeout: 30000 })
  await draft2.locator('[data-testid=draft-delete]').click()
  await page.locator('[data-testid=confirm-order-action]').click()
  await draft2.waitFor({ state: 'detached', timeout: 15000 })
  check((await dbOrders()).length === 1, `формирующийся №${next.json.number} удалён`)

  console.log('\n== приёмка частями')
  await waitCard.locator('[data-testid=order-receive]').click()
  const dialog = page.locator('[data-testid=receive-dialog]')
  await dialog.waitFor()
  const newLine = dialog.locator('[data-testid=receive-line]', { hasText: NEW_NAME })
  const oldLine = dialog.locator('[data-testid=receive-line]', { hasText: d.oldName })
  check(flat(await newLine.locator('[data-testid=receive-shows]').innerText()) === 'скрыт с сайта — после приёмки появится на сайте', 'в окне: новый товар появится на сайте после приёмки')
  check(await dialog.getByLabel(`Пришло: ${NEW_NAME}`, { exact: true }).inputValue() === '3' && await dialog.getByLabel(`Пришло: ${d.oldName}`, { exact: true }).inputValue() === '4', 'по умолчанию — всё, что ждём: 3 и 4')
  await dialog.getByLabel(`Пришло: ${d.oldName}`, { exact: true }).fill('2')
  await dialog.getByLabel(`Пришло: ${d.oldName}`, { exact: true }).press('Tab')
  check(await oldLine.locator('[data-testid=receive-check]').getAttribute('data-check') === 'short' && flat(await oldLine.locator('[data-testid=receive-check]').innerText()) === 'после приёмки: не хватит 2 шт.', `сверка строки в окне: «${flat(await oldLine.locator('[data-testid=receive-check]').innerText())}»`)
  check(await newLine.locator('[data-testid=receive-check]').getAttribute('data-check') === 'ok', 'новый товар — «сойдётся с заказом»')
  const summary = flat(await dialog.locator('[data-testid=receive-summary]').innerText())
  check(summary.startsWith('Будет принято 5 шт.') && summary.includes('На сайте появится 1 новый товар'), `итог: «${summary}»`)
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/deliveries-receive-1366.png` })
  await dialog.locator('[data-testid=receive-submit]').click()
  await dialog.waitFor({ state: 'hidden', timeout: 15000 })
  await until(async () => (await dbOrders())[0]?.status === 'in_transit')
  ;[o1] = await dbOrders()
  const shown = await productBy(NEW_SKU)
  check(shown.is_active === true && shown.stock_quantity === 3, `новый товар: остаток 0 → 3, на сайте: ${JSON.stringify({ active: shown.is_active, stock: shown.stock_quantity })}`)
  check(await stock(d.old) === oldStock + 2, `тот же товар — остаток ${oldStock} → ${oldStock + 2}`)
  check(o1.status === 'in_transit' && lineOf(o1, created.id).received_quantity === 3 && lineOf(o1, created.id).show_on_receipt === false && lineOf(o1, d.old).received_quantity === 2, 'заказ ждёт остальное; флаг «показать при приёмке» снят')
  check((await rest(`stock_receipts?select=id&order_id=eq.${o1.id}`)).length === 2, 'журнал приёмки — 2 строки')
  check(await until(() => seo.some(urls => urls.some(u => u.endsWith(`/catalog/products/${shown.slug}`)))), `поисковикам — о появившемся товаре: ${JSON.stringify(seo)}`)
  await until(async () => await waitCard.locator(`[data-testid=delivery-line][data-product="${d.old}"]`).getAttribute('data-state') === 'short')
  const lineState = async id => ({ kind: await waitCard.locator(`[data-testid=delivery-line][data-product="${id}"]`).getAttribute('data-state'), text: flat(await waitCard.locator(`[data-testid=delivery-line][data-product="${id}"] [data-testid=line-state]`).innerText()) })
  const sNew = await lineState(created.id)
  const sOld = await lineState(d.old)
  check(sNew.kind === 'ok' && sNew.text === 'сошлось' && sOld.kind === 'short' && sOld.text === 'ждём ещё 2 шт.', `сверка по строкам: ${sNew.text} · ${sOld.text}`)
  const checkLine = flat(await waitCard.locator('[data-testid=delivery-check]').innerText())
  check(checkLine === 'пришло 5 из 7 шт. · ждём ещё 2 — позиции: сошлось 1, частично 1', `сверка заказа: «${checkLine}»`)
  check(/— 5 шт\. \(2 позиции\)$/.test(flat(await waitCard.locator('[data-testid=delivery-receipts]').innerText())), `приёмки: «${flat(await waitCard.locator('[data-testid=delivery-receipts]').innerText())}»`)
  if (SHOTS)
    await waitCard.screenshot({ path: `${SHOTS}/deliveries-check-1366.png` })

  console.log('\n== «Закрыть» — недостача')
  await waitCard.locator('[data-testid=order-close]').click()
  await page.locator('[data-testid=confirm-order-action]').click()
  await until(async () => (await dbOrders())[0]?.status === 'received')
  check((await dbOrders())[0].status === 'received', 'остального не будет — заказ закрыт')
  await page.locator('[data-testid=closed-toggle]').click()
  const closedCard = page.locator(`[data-testid=deliveries-closed] [data-testid=delivery-order][data-number="${o1.number}"]`)
  await closedCard.waitFor({ timeout: 15000 })
  const closedOld = flat(await closedCard.locator(`[data-testid=delivery-line][data-product="${d.old}"] [data-testid=line-state]`).innerText())
  const closedCheck = flat(await closedCard.locator('[data-testid=delivery-check]').innerText())
  check(closedOld === 'недостача 2 шт.' && closedCheck === 'пришло 5 из 7 шт. · не пришло 2 — позиции: сошлось 1, недостача 1', `в закрытых: «${closedOld}», «${closedCheck}»`)

  console.log('\n== база без миграции поставок')
  const open = await api('/api/admin/restock/orders', adminToken, { supplierId: d.sup, items: [{ productId: d.old, quantity: 1 }] })
  check(open.status === 200, `заказ из «К закупке» — №${open.json?.number}`)
  hide(true)
  hidden = true
  const off = await until(async () => {
    const r = await api('/api/admin/deliveries', adminToken)
    return r.json?.ready === false ? r : null
  })
  const offOrder = off?.json?.orders.find(o => o.number === open.json.number)
  check(off?.json?.ordersReady === true && offOrder && offOrder.orderedAt === offOrder.createdAt && offOrder.expectedAt === null, `без миграции: ready false, заказ №${open.json.number} виден — без даты поставки`)
  const restockOff = await api('/api/admin/restock', adminToken)
  check(restockOff.status === 200 && restockOff.json.orders?.some(o => o.number === open.json.number), '«К закупке» без миграции — заказы на месте')
  await page.goto(`${BASE}/admin/deliveries`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=deliveries-no-migration]').waitFor({ timeout: 30000 })
  const offCard = page.locator(`[data-testid=deliveries-waiting] [data-testid=delivery-order][data-number="${open.json.number}"]`)
  check(await page.locator('[data-testid=deliveries-forming]').count() === 0 && await offCard.locator('[data-testid=order-receive]').count() === 1 && await offCard.locator('[data-testid=order-expected]').count() === 0, 'раздел ждёт миграции: формирующихся нет, заказ принимается, даты нет')
  await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=step-deliveries]').waitFor({ timeout: 30000 })
  check(await page.locator('[data-testid=step-deliveries]').getAttribute('data-state') === 'later', 'дашборд: шаг «Поставки» — «позже»')

  allowFailed.push({ status: 409, path: '/api/admin/deliveries/add' })
  await page.goto(`${BASE}/admin/products/new?offer=${d.o2}&item=0`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=supplier-order]').waitFor({ timeout: 30000 })
  await until(async () => await page.locator('#name').inputValue() === OFF_NAME)
  check(await page.locator('[data-testid=supplier-order-qty]').inputValue() === '5' && await page.locator('[data-testid=supplier-order-picked]').count() === 0, 'без отметки «В заказ» — 5 шт.')
  const seoBefore = seo.length
  await page.locator('#price').fill('1490')
  await page.getByRole('button', { name: 'Создать товар' }).click()
  await page.waitForURL(u => u.pathname === '/admin/products', { timeout: 60000 })
  const offProduct = await until(async () => {
    const p = await productBy(OFF_SKU)
    return p?.is_active ? p : null
  })
  check(offProduct?.is_active === true, `в заказ не попал (миграции нет) — товар не остался скрытым: ${JSON.stringify(offProduct && { active: offProduct.is_active })}`)
  check(psql(`SELECT count(*) FROM public.supplier_order_items WHERE product_id = :'p';`, { p: offProduct?.id ?? '00000000-0000-0000-0000-000000000000' }) === '0', 'строк заказа у него нет')
  check(await until(() => seo.length > seoBefore), 'видимый — поисковикам сказано')
  const warned = flat(await page.locator('[data-sonner-toast]', { hasText: 'в заказ поставщику не попал' }).first().innerText().catch(() => ''))
  check(warned.includes('нужна миграция 20261126140000') && warned.includes('Он на сайте'), `предупреждение: «${warned.slice(0, 200)}»`)

  hide(false)
  hidden = false
  check(await until(async () => (await api('/api/admin/deliveries', adminToken)).json?.ready === true), 'миграция вернулась — раздел снова в работе')

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
catch (e) {
  // Что было на экране, когда упало
  for (const [i, p] of pages.entries()) {
    console.error(`страница ${i}: ${p.url()}`)
    if (SHOTS)
      await p.screenshot({ path: `${SHOTS}/deliveries-fail-${i}.png` }).catch(() => {})
  }
  console.error(`ошибки консоли: ${JSON.stringify(errors.slice(0, 5))}\nответы с ошибкой: ${JSON.stringify(failed.slice(0, 5))}`)
  throw e
}
finally {
  await browser.close()
  if (hidden) {
    try {
      hide(false)
    }
    catch (e) {
      console.error(`колонки поставок и функция добавления не вернулись (суффикс _check_off) — верните руками: ${e.message}`)
    }
  }
  cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

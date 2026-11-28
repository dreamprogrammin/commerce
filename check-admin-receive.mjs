/*
 * «Приёмка по факту» (27.11.2026) — только на ЛОКАЛЬНОЙ базе с миграцией
 * 20261126140000_supplier_deliveries.
 *
 * Владелец: «я же не буду бегать с товарами к ноутбуку… я должен принимать
 * товар по факту, а не по списку». Экран на телефоне: камера или сканер
 * считают коробки, счёт с нуля, сверка с заказом, «Принять».
 *
 * Проверяет:
 *  1) маршруты: GET /api/admin/deliveries/[id]/receive и POST
 *     /api/admin/products/[id]/barcode — гость 401, не-администратор 403,
 *     негодный id 400, нет заказа или товара 404; штрихкод: короткий и
 *     кириллица — 400, код другого товара — 409 с его названием, свой другой
 *     код без replace — 409, тот же код с нулём впереди — без изменений;
 *  2) вход: «Принять по факту» у заказа на странице поставщика ведёт на
 *     экран; та же ссылка — в «К закупке»;
 *  3) телефон 390: шапка «ждём 8 шт. по 3 позициям»; код в поле, печать в
 *     пустоту (сканер-клавиатура), артикул в любом регистре, код с нулём
 *     впереди — +1 своей строке; код товара не из заказа — «нет в заказе», не
 *     считается; незнакомый код — «Чей это штрихкод?»: товар без кода первым,
 *     выбор — код в базе и +1; поверх другого кода — только после
 *     «Заменить»; «пропустить»; «−», «+», число руками; «Начать заново»;
 *  4) перезагрузка — счёт на месте; без горизонтальной прокрутки, панель над
 *     нижним меню, последняя строка не уходит под панель; 1366 — панель
 *     справа от бокового меню; по заказу приняли где-то ещё (окном
 *     «Принять») — сохранённый счёт не возвращается, «Принять» перечитывает
 *     заказ и сбрасывает счёт, а не принимает второй раз;
 *  5) камера (Chromium с поддельной камерой, в кадре — штрихкод): код держат
 *     в кадре — одна штука, а не по штуке на кадр; UPC-A с камеры = EAN-13 с
 *     нулём в базе; распознаватель — файл самого сайта, не CDN; свернули
 *     приложение или ушли со страницы — камера гаснет, вернулись — счёт тот
 *     же; код пропал и вернулся — ещё штука; камера не разрешена — понятный
 *     текст;
 *  6) «Принять»: в подтверждении недостача и лишнее, остатки +посчитанное,
 *     новый товар показан и сказан поисковикам, заказ «В пути»; «Принять
 *     ещё» — по остатку, «закрыть» — заказ закрыт; закрытый — «уже принят»;
 *  7) заголовок Permissions-Policy: camera=(self);
 *  без ошибок консоли.
 *
 * Данные заводит сам — поставщик, четыре товара, заказ через API, как в
 * работе, администратор и покупатель — и в конце всё удаляет.
 *
 *   node check-admin-receive.mjs --base=http://localhost:3142
 *
 * Стенд: сборка на локальной базе. SHOTS=<папка> — скриншоты.
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    await sleep(200)
  }
}
const flat = t => (t ?? '').replace(/\s+/g, ' ').trim()

// --- Штрихкоды: EAN-13 с контрольной цифрой и его рисунок для поддельной камеры ---
function withCheck(body12) {
  let sum = 0
  for (let i = 0; i < 12; i++)
    sum += Number(body12[i]) * (i % 2 ? 3 : 1)
  return body12 + String((10 - sum % 10) % 10)
}
const stamp = Date.now()
const tail = String(stamp).slice(-9)
// Префикс 2 — коды «для своего магазина»: настоящему товару не принадлежат
const C1 = withCheck(`21${tail}0`)
const C4 = withCheck(`24${tail}0`)
const C5 = withCheck(`25${tail}0`)
const C6 = withCheck(`26${tail}0`)
// С нулём впереди: в базе EAN-13, камера читает его как UPC-A (12 цифр), руками — GTIN-14
const C3 = withCheck(`03${tail}0`)

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']
function eanBits(code) {
  const digit = [...code].map(Number)
  let bits = '101'
  for (let i = 1; i <= 6; i++)
    bits += (PARITY[digit[0]][i - 1] === 'L' ? L : G)[digit[i]]
  bits += '01010'
  for (let i = 7; i <= 12; i++)
    bits += R[digit[i]]
  return `${bits}101`
}
// Кадр YUV 4:2:0: белый фон, штрихкод по центру, модуль 4 пикселя
const VW = 640
const VH = 360
function y4mFrame(code) {
  const luma = Buffer.alloc(VW * VH, 235)
  if (code) {
    const bits = eanBits(code)
    const x0 = Math.floor((VW - bits.length * 4) / 2)
    for (let row = 70; row < 290; row++) {
      for (let i = 0; i < bits.length; i++) {
        if (bits[i] === '1')
          luma.fill(16, row * VW + x0 + i * 4, row * VW + x0 + (i + 1) * 4)
      }
    }
  }
  const chroma = Buffer.alloc((VW / 2) * (VH / 2), 128)
  return Buffer.concat([Buffer.from('FRAME\n'), luma, chroma, chroma])
}
function writeY4m(path, frames) {
  writeFileSync(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${VW} H${VH} F10:1 Ip A1:1 C420jpeg\n`), ...frames]))
}
const camDir = mkdtempSync(join(tmpdir(), 'receive-cam-'))
const STILL = join(camDir, 'still.y4m')
const BLINK = join(camDir, 'blink.y4m')
const shownFrame = y4mFrame(C3)
const emptyFrame = y4mFrame(null)
// Код всё время в кадре
writeY4m(STILL, Array.from({ length: 10 }, () => shownFrame))
// 1,5 с код, 1,5 с пусто — по кругу
writeY4m(BLINK, [...Array.from({ length: 15 }, () => shownFrame), ...Array.from({ length: 15 }, () => emptyFrame)])

// --- Данные ---
const SUPPLIER = 'Поставщик проверки приёмки'
const NAMES = { p1: 'Кукла проверки приёмки', p2: 'Машинка проверки приёмки', p3: 'Пазл проверки приёмки', p4: 'Мяч проверки приёмки' }
const SKU = k => `PRCV-${k}-${tail}`
const emails = { admin: `receive-admin-${stamp}@example.test`, buyer: `receive-buyer-${stamp}@example.test` }
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
INSERT INTO public.suppliers (name, phone) VALUES ('${SUPPLIER}', '+7 701 000 00 33') RETURNING id AS sup \\gset
INSERT INTO public.products (name, slug, price, sku, barcode, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('${NAMES.p1}', 'probe-receive-1-${tail}', 3000, '${SKU(1)}', '${C1}', 2, true, :'sup', 1500) RETURNING id AS p1 \\gset
INSERT INTO public.products (name, slug, price, sku, barcode, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('${NAMES.p2}', 'probe-receive-2-${tail}', 5000, '${SKU(2)}', NULL, 0, false, :'sup', 2500) RETURNING id AS p2 \\gset
INSERT INTO public.products (name, slug, price, sku, barcode, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('${NAMES.p3}', 'probe-receive-3-${tail}', 2000, '${SKU(3)}', '${C3}', 5, true, :'sup', 900) RETURNING id AS p3 \\gset
INSERT INTO public.products (name, slug, price, sku, barcode, stock_quantity, is_active, supplier_id, cost_price)
VALUES ('${NAMES.p4}', 'probe-receive-4-${tail}', 1500, '${SKU(4)}', '${C4}', 1, true, NULL, 700) RETURNING id AS p4 \\gset
COMMIT;
SELECT json_build_object('sup', :'sup', 'p1', :'p1', 'p2', :'p2', 'p3', :'p3', 'p4', :'p4');
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
DELETE FROM public.products WHERE id IN (:'p1', :'p2', :'p3', :'p4');
DELETE FROM public.suppliers WHERE id = :'sup';
COMMIT;
`, d)
}

const browser = await chromium.launch()
const browsers = [browser]
const pages = []
const errors = []
const failed = []
const seo = []
// Придержанное перечитывание заказа после «Принять» — отпускается и в finally, иначе страница висит
let releaseReload = () => {}
try {
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  d = setup(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)

  console.log('\n== заказ поставщику — через API, как в работе')
  const added = []
  for (const [id, quantity, showOnReceipt] of [[d.p1, 3, false], [d.p2, 2, true], [d.p3, 4, false]])
    added.push(await api('/api/admin/deliveries/add', adminToken, { productId: id, quantity, showOnReceipt }))
  const orderId = added[0].json?.id
  const number = added[0].json?.number
  check(added.every(a => a.status === 200 && a.json.id === orderId), `формирующийся заказ №${number}: 3 позиции`)
  const placed = await api(`/api/admin/deliveries/${orderId}/place`, adminToken, { expectedAt: null })
  check(placed.status === 200 && placed.json.status === 'ordered', `«Заказано»: ${placed.json?.status}`)
  const KEY = `admin-receive:${orderId}`
  const PAGE = `/admin/deliveries/receive/${orderId}`

  console.log('\n== маршруты')
  const R1 = `/api/admin/deliveries/${orderId}/receive`
  const guest = await api(R1, null)
  const buyer = await api(R1, buyerToken)
  check(guest.status === 401 && buyer.status === 403, `данные приёмки: гость — ${guest.status}, не-администратор — ${buyer.status}`)
  const badId = await api('/api/admin/deliveries/not-a-uuid/receive', adminToken)
  const noOrder = await api(`/api/admin/deliveries/${randomUUID()}/receive`, adminToken)
  check(badId.status === 400 && noOrder.status === 404, `негодный id — ${badId.status}, нет заказа — ${noOrder.status} «${noOrder.json?.message}»`)
  const got = await api(R1, adminToken)
  const gp = got.json?.products ?? {}
  check(got.status === 200 && got.json.order.number === number && Object.keys(gp).length === 3 && gp[d.p3]?.barcode === C3 && gp[d.p2]?.barcode === null && gp[d.p1]?.sku === SKU(1), 'данные: строки заказа со штрихкодом и артикулом')
  check(got.json?.otherBarcodes.some(o => o.productId === d.p4 && o.barcode === C4 && o.name === NAMES.p4) && !got.json.otherBarcodes.some(o => [d.p1, d.p3].includes(o.productId)), 'коды товаров не из заказа — отдельно, со своими названиями')
  check(got.json?.supplier?.name === SUPPLIER && !('phone' in got.json.supplier), 'поставщик — только имя, без телефона')

  const B = id => `/api/admin/products/${id}/barcode`
  const bGuest = await api(B(d.p2), null, { code: C5 })
  const bBuyer = await api(B(d.p2), buyerToken, { code: C5 })
  check(bGuest.status === 401 && bBuyer.status === 403, `штрихкод товару: гость — ${bGuest.status}, не-администратор — ${bBuyer.status}`)
  const short = await api(B(d.p2), adminToken, { code: '12' })
  const cyr = await api(B(d.p2), adminToken, { code: 'АРТ1234' })
  check(short.status === 400 && cyr.status === 400 && /от 4 до 64/.test(cyr.json?.message), `короткий и кириллица — 400 «${cyr.json?.message}»`)
  const holder = await api(B(d.p2), adminToken, { code: C4 })
  check(holder.status === 409 && holder.json?.message.includes(NAMES.p4), `код другого товара — 409 «${holder.json?.message}»`)
  const own = await api(B(d.p1), adminToken, { code: C5 })
  check(own.status === 409 && /уже есть штрихкод/.test(own.json?.message), `у товара свой другой код — 409 «${own.json?.message}»`)
  const same = await api(B(d.p3), adminToken, { code: `0${C3}` })
  check(same.status === 200 && same.json.changed === false && same.json.barcode === C3, 'тот же код с нулём впереди — без изменений')
  const noProduct = await api(B(randomUUID()), adminToken, { code: C5 })
  check(noProduct.status === 404, `нет товара — ${noProduct.status}`)
  const codes = await rest(`products?select=id,barcode&id=in.(${d.p1},${d.p2},${d.p3})`)
  check(codes.find(p => p.id === d.p1).barcode === C1 && codes.find(p => p.id === d.p2).barcode === null, 'после отказов коды в базе прежние')

  async function newPage(on, viewport, path, { camera = false } = {}) {
    const ctx = await on.newContext({ viewport, deviceScaleFactor: 2 })
    if (camera)
      await ctx.grantPermissions(['camera'], { origin: BASE })
    // Окно подписки на Telegram (app.vue) перекрывает кнопки — как будто в нём уже нажали «Не сейчас»
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    // Потоки камеры — на виду: погасла ли она, когда ушли со страницы
    await ctx.addInitScript(() => {
      const media = navigator.mediaDevices
      if (media?.getUserMedia) {
        const original = media.getUserMedia.bind(media)
        window.__streams = []
        media.getUserMedia = async (constraints) => {
          const stream = await original(constraints)
          window.__streams.push(stream)
          return stream
        }
      }
    })
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
    if (path) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
      if (path === PAGE)
        await page.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
    }
    return page
  }
  const lineEl = (page, id) => page.locator(`[data-testid=receive-scan-line][data-product="${id}"]`)
  const countOf = async (page, id) => Number(await lineEl(page, id).locator('[data-testid=receive-count]').inputValue())
  const countsOf = async page => `${await countOf(page, d.p1)},${await countOf(page, d.p2)},${await countOf(page, d.p3)}`
  const statesOf = page => page.locator('[data-testid=receive-scan-line]').evaluateAll(els => els.map(e => e.dataset.state).join(','))
  const stateText = async (page, id) => flat(await lineEl(page, id).locator('[data-testid=receive-line-state]').innerText())
  const last = page => page.locator('[data-testid=receive-last]')
  const lastKind = async page => await last(page).count() ? last(page).getAttribute('data-kind') : null
  const cameraState = page => page.locator('[data-testid=receive-camera]').getAttribute('data-state')
  async function typeCode(page, code) {
    const input = page.locator('[data-testid=receive-code]')
    await input.fill(code)
    await input.press('Enter')
  }
  const draftOf = page => page.evaluate(k => localStorage.getItem(k), KEY)

  console.log('\n== счёт устарел: заказ приняли где-то ещё (1366)')
  const desk = await newPage(browser, { width: 1366, height: 900 }, PAGE)
  check(flat(await desk.locator('[data-testid=receive-subtitle]').innerText()).endsWith('ждём 9 шт. по 3 позициям'), 'до прежней приёмки — ждём 9 шт.')
  // Сохранённый счёт с другой отметкой «сколько было принято» — после перезагрузки не возвращается
  await desk.evaluate(({ key, p1 }) => localStorage.setItem(key, JSON.stringify({ counts: { [p1]: 1 }, savedAt: new Date().toISOString(), base: 5 })), { key: KEY, p1: d.p1 })
  await desk.reload({ waitUntil: 'load', timeout: 120000 })
  await desk.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
  check(await desk.locator('[data-testid=receive-stale]').isVisible() && await countsOf(desk) === '0,0,0' && await draftOf(desk) === null && await desk.locator('[data-testid=receive-restored]').count() === 0, 'устаревший сохранённый счёт — сброшен с объяснением')
  await lineEl(desk, d.p3).locator('[data-testid=receive-plus]').click()
  check(await desk.locator('[data-testid=receive-stale]').count() === 0 && JSON.parse(await draftOf(desk) || '{}').base === 0, 'новый счёт — объяснение ушло, отметка «принято 0»')
  // Тем временем заказ приняли окном «Принять» на ноутбуке: 1 пазл — дальше по нему ждём 3, а не 4
  const partial = await api(`/api/admin/restock/orders/${orderId}/receive`, adminToken, { items: [{ productId: d.p3, quantity: 1 }], close: false })
  check(partial.status === 200 && partial.json.status === 'in_transit', `приёмка окном: 1 пазл, заказ ${partial.json?.status}`)
  await desk.locator('[data-testid=receive-open-confirm]').click()
  await desk.locator('[data-testid=receive-stale]').waitFor({ timeout: 15000 })
  check(await countsOf(desk) === '0,0,0' && await desk.locator('[data-testid=receive-confirm]').count() === 0 && await draftOf(desk) === null, '«Принять» перечитал заказ: счёт сброшен, подтверждение не открылось — дважды не примем')
  check(await last(desk).count() === 0 && await desk.locator('[data-testid=receive-scan-line].ring-2').count() === 0, 'над обнулённым счётом нет «Пазл: 1 из 4» и подсветки строки')
  check(flat(await lineEl(desk, d.p3).innerText()).includes('заказано 4, принято раньше 1'), 'строка уже знает о принятом')
  const deskBar = await desk.locator('[data-testid=receive-bar]').boundingBox()
  check(deskBar && deskBar.x === 272 && Math.abs(deskBar.y + deskBar.height - 900) <= 1, `1366: панель справа от бокового меню, x ${deskBar?.x}`)
  check(await desk.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '1366 — без горизонтальной прокрутки')
  if (SHOTS)
    await desk.screenshot({ path: `${SHOTS}/receive-1366.png` })
  await desk.goto(`${BASE}/admin/restock`, { waitUntil: 'load', timeout: 120000 })
  const restockLink = desk.locator(`a[data-testid=order-receive-scan][href="${PAGE}"]`)
  check(await until(async () => await restockLink.count() === 1, 30000), '«К закупке»: у заказа та же ссылка «Принять по факту»')

  console.log('\n== вход: «Принять по факту» у заказа')
  const phone = await newPage(browser, { width: 390, height: 844 }, `/admin/deliveries/${d.sup}`)
  const card = phone.locator(`[data-testid=delivery-order][data-number="${number}"]`)
  await card.waitFor({ timeout: 30000 })
  const entry = card.locator('[data-testid=order-receive-scan]')
  check(await entry.getAttribute('href') === PAGE && await card.locator('[data-testid=order-receive]').count() === 1, 'у заказа — «Принять» списком и «Принять по факту»')
  await entry.click()
  await phone.waitForURL(u => u.pathname === PAGE, { timeout: 30000 })
  await phone.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
  check(flat(await phone.locator('[data-testid=receive-subtitle]').innerText()) === `Заказ №${number} · ${SUPPLIER} · ждём 8 шт. по 3 позициям`, `шапка: «${flat(await phone.locator('[data-testid=receive-subtitle]').innerText())}»`)
  check(await statesOf(phone) === 'none,none,none' && await countsOf(phone) === '0,0,0', 'счёт с нуля, а не с заказанного')
  check(flat(await lineEl(phone, d.p3).innerText()).includes('заказано 4, принято раньше 1') && await stateText(phone, d.p3) === 'ждём 3', 'пазл: заказано 4, принято раньше 1 — ждём 3')

  console.log('\n== код в поле, сканер-клавиатура')
  await typeCode(phone, C1)
  check(await countsOf(phone) === '1,0,0' && await lastKind(phone) === 'counted' && flat(await last(phone).innerText()).includes(`${NAMES.p1}: 1 из 3`), `код в поле — +1: «${flat(await last(phone).innerText())}»`)
  check(await phone.locator('[data-testid=receive-code]').inputValue() === '', 'поле очищено для следующего кода')
  await phone.locator('h1').click()
  await phone.keyboard.type(C1, { delay: 10 })
  await phone.keyboard.press('Enter')
  check(await countsOf(phone) === '2,0,0', 'печать в пустоту (сканер-клавиатура) — в поле, +1')
  check(JSON.parse(await draftOf(phone) || '{}').counts?.[d.p1] === 2, 'счёт сохранён в браузере')

  console.log('\n== «Начать заново»')
  await phone.locator('[data-testid=receive-reset]').click()
  await phone.locator('[data-testid=receive-reset-yes]').click()
  check(await countsOf(phone) === '0,0,0' && await draftOf(phone) === null && await last(phone).count() === 0, 'счёт сброшен и стёрт из браузера')

  console.log('\n== артикул, код с нулём, товар не из заказа')
  await typeCode(phone, C1)
  await typeCode(phone, C1)
  await typeCode(phone, SKU(2).toLowerCase())
  check(await countsOf(phone) === '2,1,0', 'артикул строчными — +1 своей строке')
  await typeCode(phone, `0${C3}`)
  check(await countsOf(phone) === '2,1,1', 'код с нулём впереди (GTIN-14) — тот же товар')
  await typeCode(phone, C4)
  check(await lastKind(phone) === 'other' && flat(await last(phone).innerText()) === `«${NAMES.p4}» — этого товара нет в заказе №${number}` && await countsOf(phone) === '2,1,1', `чужой товар: «${flat(await last(phone).innerText())}», не считается`)

  console.log('\n== незнакомый код — «Чей это штрихкод?»')
  const sheet = phone.locator('[data-testid=receive-bind]')
  await typeCode(phone, C5)
  await sheet.waitFor({ timeout: 10000 })
  // Окно выезжает снизу — снимок и замер после анимации
  await phone.waitForFunction(() => {
    const dialog = document.querySelector('[role=dialog]')
    return dialog && dialog.getAnimations({ subtree: true }).every(a => a.playState !== 'running')
  }, null, { timeout: 10000 })
  await sleep(300)
  check(await phone.locator('[data-testid=receive-bind-line]').first().getAttribute('data-product') === d.p2, 'первым — товар без штрихкода')
  check(flat(await phone.getByRole('dialog').innerText()).includes(C5), 'в окне — сам код')
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'окно на 390 — без горизонтальной прокрутки')
  if (SHOTS)
    await phone.screenshot({ path: `${SHOTS}/receive-bind-390.png` })
  await phone.locator(`[data-testid=receive-bind-line][data-product="${d.p2}"]`).click()
  const bound = await until(async () => (await rest(`products?select=barcode&id=eq.${d.p2}`))[0].barcode === C5)
  await sheet.waitFor({ state: 'hidden', timeout: 10000 })
  check(bound && await countsOf(phone) === '2,2,1', 'выбран товар — код запомнен в базе и +1')
  check(flat(await lineEl(phone, d.p2).innerText()).includes(C5), 'у строки — запомненный код')
  check(await phone.locator('[data-sonner-toast]').filter({ hasText: 'Штрихкод запомнен' }).count() > 0, 'тост «Штрихкод запомнен»')
  await typeCode(phone, C5)
  check(await countsOf(phone) === '2,3,1' && await lastKind(phone) === 'over' && flat(await last(phone).innerText()).includes('сверх заказа на 1') && await stateText(phone, d.p2) === 'сверх заказа 1', 'тот же код дальше — сканом; сверх заказа — предупреждение')
  await lineEl(phone, d.p2).locator('[data-testid=receive-minus]').click()
  check(await countsOf(phone) === '2,2,1' && await stateText(phone, d.p2) === 'сходится', '«−» — сходится')

  console.log('\n== код поверх другого — только «Заменить»')
  await typeCode(phone, C6)
  await sheet.waitFor({ timeout: 10000 })
  await phone.locator(`[data-testid=receive-bind-line][data-product="${d.p1}"]`).click()
  const replace = phone.locator('[data-testid=receive-bind-replace]')
  await replace.waitFor({ timeout: 10000 })
  check(flat(await replace.innerText()).includes(`уже есть штрихкод ${C1}. Заменить на ${C6}?`), 'спрашивает, заменить ли прежний код')
  check((await rest(`products?select=barcode&id=eq.${d.p1}`))[0].barcode === C1 && await countsOf(phone) === '2,2,1', 'до «Заменить» код и счёт не тронуты')
  await phone.locator('[data-testid=receive-bind-replace-yes]').click()
  const replaced = await until(async () => (await rest(`products?select=barcode&id=eq.${d.p1}`))[0].barcode === C6)
  await sheet.waitFor({ state: 'hidden', timeout: 10000 })
  check(replaced && await countsOf(phone) === '3,2,1', '«Заменить» — новый код в базе и +1')
  await typeCode(phone, C1)
  await sheet.waitFor({ timeout: 10000 })
  await phone.locator('[data-testid=receive-bind-skip]').click()
  await sheet.waitFor({ state: 'hidden', timeout: 10000 })
  check(await countsOf(phone) === '3,2,1' && await lastKind(phone) === 'unknown', 'прежний код теперь ничей; «пропустить» — без счёта')

  console.log('\n== «+» и число руками')
  for (let i = 0; i < 3; i++)
    await lineEl(phone, d.p3).locator('[data-testid=receive-plus]').click()
  const p1Count = lineEl(phone, d.p1).locator('[data-testid=receive-count]')
  await p1Count.fill('2')
  await p1Count.press('Tab')
  check(await countsOf(phone) === '2,2,4' && await statesOf(phone) === 'short,ok,over', `кукла 2 из 3, машинка 2 из 2, пазл 4 при 3: ${await statesOf(phone)}`)
  check(flat(await phone.locator('[data-testid=receive-totals]').innerText()) === 'Посчитано 8 из 8 шт. не хватает 1 · сверх заказа 1', `панель: «${flat(await phone.locator('[data-testid=receive-totals]').innerText())}»`)

  console.log('\n== перезагрузка — счёт на месте')
  await phone.reload({ waitUntil: 'load', timeout: 120000 })
  await phone.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
  check(await until(async () => await countsOf(phone) === '2,2,4', 10000) && await phone.locator('[data-testid=receive-restored]').isVisible(), 'после перезагрузки — тот же счёт и «Продолжаем счёт»')

  console.log('\n== телефон 390 — вёрстка')
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальной прокрутки')
  const bar = await phone.locator('[data-testid=receive-bar]').boundingBox()
  check(bar && Math.abs(bar.y + bar.height - (844 - 64)) <= 1 && bar.x === 0 && bar.width === 390, `панель над нижним меню: низ ${bar && bar.y + bar.height}, меню с 780`)
  check(await phone.evaluate(() => {
    const bar = document.querySelector('[data-testid=receive-bar]').getBoundingClientRect()
    const hit = document.elementFromPoint(bar.x + bar.width / 2, bar.y + bar.height / 2)
    return Boolean(hit?.closest('[data-testid=receive-bar]'))
  }), 'панель не перекрыта')
  await phone.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await sleep(300)
  check(await phone.evaluate(() => {
    const lines = document.querySelectorAll('[data-testid=receive-scan-line]')
    const lastLine = lines[lines.length - 1].getBoundingClientRect()
    return lastLine.bottom <= document.querySelector('[data-testid=receive-bar]').getBoundingClientRect().top
  }), 'внизу последняя строка не уходит под панель')
  if (SHOTS) {
    await phone.screenshot({ path: `${SHOTS}/receive-bottom-390.png` })
    await phone.evaluate(() => window.scrollTo(0, 0))
    await sleep(300)
    await phone.screenshot({ path: `${SHOTS}/receive-top-390.png` })
  }

  console.log('\n== камера: код держат в кадре — одна штука')
  // Полный Chromium (channel), а не урезанный headless shell: тот на getUserMedia отвечает NotSupportedError
  const stillBrowser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${STILL}`] })
  browsers.push(stillBrowser)
  const cam = await newPage(stillBrowser, { width: 390, height: 844 }, PAGE, { camera: true })
  const wasm = []
  const cdn = []
  cam.on('response', r => /\.wasm(?:\?|$)/.test(r.url()) && wasm.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] }))
  cam.on('request', r => /jsdelivr|unpkg/.test(r.url()) && cdn.push(r.url()))
  check(await cam.locator('[data-testid=receive-video]').isHidden() && await cameraState(cam) === 'off', 'до «Камера» видео нет')
  await cam.locator('[data-testid=receive-camera]').click()
  const camOn = await until(async () => await cameraState(cam) === 'on', 20000)
  const problemOf = async page => await page.locator('[data-testid=receive-camera-problem]').count() ? flat(await page.locator('[data-testid=receive-camera-problem]').innerText()) : ''
  check(camOn, `камера включилась${camOn ? '' : `: ${await cameraState(cam)} «${await problemOf(cam)}», потоков ${await cam.evaluate(() => window.__streams?.length)}, wasm ${JSON.stringify(wasm)}, ошибки ${JSON.stringify(errors.slice(-3))}`}`)
  check(await until(async () => await countOf(cam, d.p3) >= 1, 20000), 'код в кадре — пазл посчитан (UPC-A камеры = EAN-13 с нулём в базе)')
  await sleep(3000)
  check(await countOf(cam, d.p3) === 1 && await countsOf(cam) === '0,0,1', `держали в кадре 3 с — всё ещё одна штука: ${await countsOf(cam)}`)
  check(await lastKind(cam) === 'counted' && flat(await last(cam).innerText()) === `${NAMES.p3}: 1 из 3`, `последний скан: «${flat(await last(cam).innerText())}»`)
  check(wasm.length >= 1 && wasm.every(w => w.status === 200 && w.url.startsWith(`${BASE}/_nuxt/`) && /application\/wasm/.test(w.type ?? '')) && !cdn.length, `распознаватель — файл сайта: ${JSON.stringify(wasm.map(w => [w.url.replace(BASE, ''), w.status, w.type]))}, CDN: ${cdn.length}`)
  if (SHOTS)
    await cam.screenshot({ path: `${SHOTS}/receive-camera-390.png` })
  const allEnded = page => page.evaluate(() => window.__streams.length > 0 && window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended')))
  // Свернули приложение
  await cam.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  check(await until(async () => await cameraState(cam) === 'off' && await allEnded(cam), 5000), 'свернули приложение — камера погасла')
  await cam.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }))
  await cam.locator('[data-testid=receive-camera]').click()
  check(await until(async () => await cameraState(cam) === 'on', 20000), 'снова «Камера» — включилась')
  // Коробка так и стоит перед камерой: включили снова — это не новая штука
  await sleep(2000)
  check(await countOf(cam, d.p3) === 1, `снова включили — коробка в кадре второй раз не посчитана: пазл ${await countOf(cam, d.p3)}`)
  // Пока открыто подтверждение, кадры не читаются; вернулись к счёту — коробка всё та же
  await cam.locator('[data-testid=receive-open-confirm]').click()
  await cam.locator('[data-testid=receive-confirm]').waitFor({ timeout: 10000 })
  await sleep(1500)
  await cam.getByRole('button', { name: 'Вернуться к счёту' }).click()
  await cam.locator('[data-testid=receive-confirm]').waitFor({ state: 'detached', timeout: 10000 })
  await sleep(2000)
  check(await cameraState(cam) === 'on' && await countOf(cam, d.p3) === 1, `подтверждение закрыли — коробка в кадре второй раз не посчитана: пазл ${await countOf(cam, d.p3)}, камера ${await cameraState(cam)}`)
  // Ушли со страницы: удержанная страница живёт в фоне, камера — нет
  await cam.evaluate(() => document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/admin/deliveries'))
  await cam.waitForURL(u => u.pathname === '/admin/deliveries', { timeout: 30000 })
  check(await until(() => allEnded(cam), 5000) && await cam.evaluate(() => window.__streams.length) === 2, 'ушли на «Поставки» — камера погасла')
  await cam.goBack()
  await cam.waitForURL(u => u.pathname === PAGE, { timeout: 30000 })
  await cam.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
  check(await cameraState(cam) === 'off' && await countOf(cam, d.p3) === 1, `вернулись — счёт тот же, камера ждёт нажатия: пазл ${await countOf(cam, d.p3)}, камера ${await cameraState(cam)}`)
  // Перезагрузка — так бывает, когда iPhone выгружает вкладку в фоне: счёт и «что было в кадре» — из телефона
  await cam.reload({ waitUntil: 'load', timeout: 120000 })
  await cam.locator('[data-testid=receive-scan-line]').first().waitFor({ timeout: 30000 })
  const held = JSON.parse(await draftOf(cam) || '{}').held ?? []
  check(await countOf(cam, d.p3) === 1 && held.length === 1, `после перезагрузки — счёт и код «в кадре» из телефона: пазл ${await countOf(cam, d.p3)}, коды ${JSON.stringify(held)}`)
  await cam.locator('[data-testid=receive-camera]').click()
  check(await until(async () => await cameraState(cam) === 'on', 20000), 'после перезагрузки «Камера» — включилась')
  await sleep(2000)
  check(await countOf(cam, d.p3) === 1, `после перезагрузки коробка в кадре второй раз не посчитана: пазл ${await countOf(cam, d.p3)}`)
  await cam.locator('[data-testid=receive-camera]').click()
  await until(async () => await cameraState(cam) === 'off', 5000)

  console.log('\n== камера: код пропал и вернулся — ещё штука')
  const blinkBrowser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${BLINK}`] })
  browsers.push(blinkBrowser)
  const blink = await newPage(blinkBrowser, { width: 390, height: 844 }, PAGE, { camera: true })
  await blink.evaluate((id) => {
    window.__hits = []
    let prev = '0'
    setInterval(() => {
      const value = document.querySelector(`[data-testid=receive-scan-line][data-product="${id}"] [data-testid=receive-count]`)?.value
      if (value && value !== prev) {
        window.__hits.push({ at: performance.now(), value })
        prev = value
      }
    }, 50)
  }, d.p3)
  await blink.locator('[data-testid=receive-camera]').click()
  check(await until(async () => await cameraState(blink) === 'on', 20000), 'камера включилась')
  await until(async () => (await blink.evaluate(() => window.__hits.length)) >= 3, 12000)
  const hits = await blink.evaluate(() => window.__hits)
  const gaps = hits.slice(1).map((h, i) => Math.round(h.at - hits[i].at))
  check(hits.length >= 2 && hits.every((h, i) => Number(h.value) === i + 1) && gaps.every(g => g > 2000), `1,5 с код, 1,5 с пусто: штук ${hits.length}, промежутки ${gaps.join(', ')} мс`)

  console.log('\n== камера не разрешена')
  const deniedBrowser = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${STILL}`] })
  browsers.push(deniedBrowser)
  const denied = await newPage(deniedBrowser, { width: 390, height: 844 }, PAGE)
  await denied.locator('[data-testid=receive-camera]').click()
  const problem = await until(async () => await denied.locator('[data-testid=receive-camera-problem]').count() > 0 && flat(await denied.locator('[data-testid=receive-camera-problem]').innerText()), 15000)
  check(/Камера не разрешена/.test(problem || '') && await cameraState(denied) === 'error', `понятный текст: «${problem}»`)

  console.log('\n== «Принять»: сверка и остатки')
  await phone.locator('[data-testid=receive-open-confirm]').click()
  await phone.locator('[data-testid=receive-confirm]').waitFor({ timeout: 10000 })
  const issues = await phone.locator('[data-testid=receive-confirm-issue]').evaluateAll(els => els.map(e => `${e.dataset.state}:${[...e.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')}`))
  check(issues.join(' | ') === `short:${NAMES.p1} не хватает 1 | over:${NAMES.p3} +1 сверх заказа`, `в подтверждении: ${issues.join(' | ')}`)
  check(await phone.locator('[data-testid=receive-confirm-close]').isVisible(), 'недостача — можно закрыть заказ')
  check(flat(await phone.locator('[data-testid=receive-confirm-summary]').innerText()).includes('На сайте появится 1 новый товар'), 'новый товар появится на сайте')
  if (SHOTS)
    await phone.screenshot({ path: `${SHOTS}/receive-confirm-390.png` })
  const seoBefore = seo.length
  // Заказ, перечитанный после «Принять», придержан: «Принять ещё» нажмут, пока он в пути
  const heldUrl = `**/api/admin/deliveries/${orderId}/receive`
  const reloadHeld = new Promise((resolve) => {
    releaseReload = resolve
  })
  await phone.route(heldUrl, async (r) => {
    if (r.request().method() === 'GET')
      await reloadHeld
    await r.continue().catch(() => {})
  })
  await phone.locator('[data-testid=receive-confirm-submit]').click()
  await phone.locator('[data-testid=receive-result]').waitFor({ timeout: 30000 })
  check(await phone.locator('[data-testid=receive-result]').getAttribute('data-status') === 'in_transit' && flat(await phone.locator('[data-testid=receive-result]').innerText()).includes('Принято 8 шт.'), 'принято 8 шт., заказ открыт — ждём остальное')
  check(await phone.locator('[data-sonner-toast]').filter({ hasText: `Принято 8 шт. по заказу №${number}` }).count() > 0, 'тост о приёмке')
  const after = Object.fromEntries((await rest(`products?select=id,slug,stock_quantity,is_active&id=in.(${d.p1},${d.p2},${d.p3})`)).map(p => [p.id, p]))
  check(after[d.p1].stock_quantity === 4 && after[d.p2].stock_quantity === 2 && after[d.p3].stock_quantity === 10, `остатки: кукла 2→${after[d.p1].stock_quantity}, машинка 0→${after[d.p2].stock_quantity}, пазл 6→${after[d.p3].stock_quantity}`)
  check(after[d.p2].is_active === true, 'новый товар показан на сайте')
  const [order1] = await rest(`supplier_orders?select=status,supplier_order_items(product_id,received_quantity)&id=eq.${orderId}`)
  const received = Object.fromEntries(order1.supplier_order_items.map(i => [i.product_id, i.received_quantity]))
  check(order1.status === 'in_transit' && received[d.p1] === 2 && received[d.p2] === 2 && received[d.p3] === 5, `заказ «${order1.status}», принято: ${received[d.p1]}, ${received[d.p2]}, ${received[d.p3]}`)
  check((await rest(`stock_receipts?select=id&order_id=eq.${orderId}`)).length === 4, 'журнал приёмки: прежняя строка и три новых')
  check(await draftOf(phone) === null, 'сохранённый счёт стёрт')
  check(await until(() => seo.slice(seoBefore).some(urls => urls.some(u => u.includes(after[d.p2].slug))), 5000), 'о показанном товаре сказано поисковикам')

  console.log('\n== «Принять ещё», пока заказ перечитывается')
  await phone.locator('[data-testid=receive-again]').click()
  await sleep(1500)
  // Счёт, открытый по старому заказу, берёт отметку «принято 0» вместо 9 — свежий заказ его сбросит
  const early = await phone.locator('[data-testid=receive-code]').isVisible()
  check(!early && await phone.locator('[data-testid=receive-result]').isVisible(), '«Принять ещё» ждёт свежий заказ — счёт по старому не открылся')
  if (early)
    await lineEl(phone, d.p2).locator('[data-testid=receive-plus]').click()
  releaseReload()
  await phone.unroute(heldUrl)

  console.log('\n== «Принять ещё» и «закрыть»')
  check(await until(async () => flat(await phone.locator('[data-testid=receive-subtitle]').innerText()).endsWith('ждём 1 шт. по 3 позициям'), 10000), 'шапка: ждём 1 шт.')
  await sleep(1000)
  check(await countOf(phone, d.p2) === (early ? 1 : 0) && await phone.locator('[data-testid=receive-stale]').count() === 0, `пришёл свежий заказ — счёт не стёрт и «приняли в другом месте» нет: машинка ${await countOf(phone, d.p2)}, плашка ${await phone.locator('[data-testid=receive-stale]').count()}`)
  if (await countOf(phone, d.p2) === 0) {
    check(await countsOf(phone) === '0,0,0' && await stateText(phone, d.p1) === 'ждём 1' && await stateText(phone, d.p2) === 'принято раньше' && await stateText(phone, d.p3) === 'принято раньше', 'строки — по остатку')
    await lineEl(phone, d.p2).locator('[data-testid=receive-plus]').click()
  }
  check(JSON.parse(await draftOf(phone) || '{}').base === 9, `отметка нового счёта — принятые 9 шт.: ${JSON.parse(await draftOf(phone) || '{}').base}`)
  await phone.locator('[data-testid=receive-open-confirm]').click()
  await phone.locator('[data-testid=receive-confirm]').waitFor({ timeout: 10000 })
  const issues2 = await phone.locator('[data-testid=receive-confirm-issue]').evaluateAll(els => els.map(e => `${e.dataset.state}:${[...e.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')}`))
  check(issues2.join(' | ') === `none:${NAMES.p1} не пришло 1 | over:${NAMES.p2} +1 сверх заказа`, `в подтверждении: ${issues2.join(' | ')}`)
  await phone.locator('[data-testid=receive-confirm-close]').click()
  await phone.locator('[data-testid=receive-confirm-submit]').click()
  await phone.locator('[data-testid=receive-result][data-status=received]').waitFor({ timeout: 30000 })
  const [order2] = await rest(`supplier_orders?select=status,closed_at&id=eq.${orderId}`)
  check(order2.status === 'received' && order2.closed_at && (await rest(`products?select=stock_quantity&id=eq.${d.p2}`))[0].stock_quantity === 3, `«закрыть» — заказ ${order2.status}, машинка 3`)
  await phone.reload({ waitUntil: 'load', timeout: 120000 })
  await phone.locator('[data-testid=receive-closed]').waitFor({ timeout: 30000 })
  check(flat(await phone.locator('[data-testid=receive-closed]').innerText()).includes(`Заказ №${number} уже принят и закрыт.`) && await phone.locator('[data-testid=receive-bar]').count() === 0, 'закрытый заказ — «уже принят», без панели')

  console.log('\n== заголовок камеры')
  const head = await fetch(`${BASE}/`)
  check(head.headers.get('permissions-policy') === 'camera=(self), microphone=(), geolocation=()', `Permissions-Policy: ${head.headers.get('permissions-policy')}`)

  console.log('\n== консоль')
  check(!errors.length && !failed.length, `ошибок консоли нет: ${errors.length}, ответов с ошибкой: ${failed.length}`)
  if (errors.length || failed.length)
    console.error(`ошибки консоли: ${JSON.stringify(errors.slice(0, 5))}\nответы с ошибкой: ${JSON.stringify(failed.slice(0, 5))}`)
}
catch (error) {
  for (const [i, p] of pages.entries())
    console.error(`страница ${i}: ${p.url()}`)
  fails.push(error.message)
  console.error(error)
}
finally {
  releaseReload()
  for (const b of browsers)
    await b.close().catch(() => {})
  try {
    cleanup()
  }
  catch (error) {
    console.error(`данные проверки не удалились — уберите руками: ${error.message}`)
  }
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
  rmSync(camDir, { recursive: true, force: true })
}
console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

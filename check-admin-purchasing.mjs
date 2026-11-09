/*
 * «Умный закуп» — дашборд (3.11.2026) — только на ЛОКАЛЬНОЙ базе со всеми
 * миграциями закупок (последняя — 20261103120000_supplier_channels).
 *
 * Проверяет:
 *  1) /api/admin/purchasing: гость — 401, не-администратор — 403; цифры — как
 *     в базе и как на «К закупке»; ключей в ответе нет ни знаком;
 *  2) плитки и таблица поставщиков — как в базе: поставщики и каналы, товары
 *     от поставщиков и без, к закупке;
 *  3) спрос по темам на своих цифрах: сумма и рост к прошлому году, «ищут, а
 *     у нас нет» / растёт / скоро сезон, списки тем, график по месяцам с
 *     подсказкой мышью и стрелками, таблица месяцев; фильтр в адресе
 *     «Спроса на рынке»; новые запросы на рынке;
 *  4) остаток DataForSEO через заглушку: «хватит на N обновлений», «пора
 *     пополнить», отказ DataForSEO; последнее обновление и его цена, когда
 *     обновится само;
 *  5) шаги вслед за базой: каналы, обновление спроса (идёт → не удалось →
 *     обновлено), ключ DataForSEO, ключ ИИ и модель без ключа провайдера;
 *  6) меню: один пункт «Умный закуп» вместо пяти, горит и на страницах закупа;
 *     сами страницы — кнопками на дашборде;
 *  7) телефон 390px: всё влезает без горизонтальной прокрутки, вкладка
 *     «Закупки» и мобильное меню;
 *  8) без миграции каналов — работает; без ошибок консоли.
 *
 * Данные заводит сам и в конце убирает. Цифры спроса заводятся, только если
 * на локальной базе своих нет; пробные ключи DataForSEO и ИИ — тоже только
 * если своих нет, иначе эти проверки пропускаются, чтобы не стереть настоящие.
 *
 *   sg docker -c "node check-admin-purchasing.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные) с DATAFORSEO_STUB_URL=
 * http://localhost:8790: заглушку DataForSEO поднимает сам страж, к
 * настоящему DataForSEO стенд не ходит. SHOTS=<папка> — скриншоты.
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SUPPLIER = 'Проверка умного закупа'
const PROBE_LOGIN = 'probe-purchasing-login'
const PROBE_PASSWORD = 'probe-password-1234'
const PROBE_AI_KEY = 'sk-ant-probe-purchasing-zq7x9w2k4m'
const PROBE_QUERY = 'проверка умного закупа запрос'
const STUB_PORT = 8790
const SHOTS = process.env.SHOTS

// Пункты меню до «Умного закупа» (3.11.2026) — ни один, кроме страниц закупа, не должен пропасть
const OLD_LINKS = [
  '/admin',
  '/admin/categories',
  '/admin/popular-categories',
  '/admin/slides',
  '/admin/users',
  '/admin/products',
  '/admin/brands',
  '/admin/brand-seo',
  '/admin/image-seo',
  '/admin/attributes',
  '/admin/banners',
  '/admin/questions',
  '/admin/reviews',
  '/admin/suppliers',
  '/admin/pickup-points',
  '/admin/restock',
  '/admin/demand',
  '/admin/pos',
  '/admin/returns',
  '/admin/sales',
  '/admin/reports',
  '/admin/carts',
  '/admin/promotions',
  '/admin/broadcast',
  '/admin/kaspi-export',
  '/admin/ai',
]
// Страницы закупа — кнопками на дашборде, в меню их нет
const PAGES = [['/admin/suppliers', 'Поставщики'], ['/admin/telegram', 'Аккаунт Telegram'], ['/admin/supplier-offers', 'Товары поставщиков'], ['/admin/demand', 'Спрос на рынке'], ['/admin/ai', 'Модели ИИ'], ['/admin/restock', 'К закупке']]
const MENU = [...OLD_LINKS.filter(h => !PAGES.some(([p]) => p === h)), '/admin/purchasing']

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, поставщиков, цифры спроса и пробные ключи')

const fails = []
// Подписи месяцев под графиком не налезают друг на друга
function monthLabelsApart(p) {
  return p.locator('[data-testid=demand-chart] svg text').evaluateAll((all) => {
    const ts = all.filter(t => /^\p{Script=Cyrillic}{3} \d{4}$/u.test(t.textContent.trim()))
    const r = ts.map(t => t.getBoundingClientRect()).sort((a, b) => a.left - b.left)
    return { labels: ts.map(t => t.textContent).join(', '), apart: r.length > 1 && r.every((b, i) => !i || r[i - 1].right + 4 <= b.left) }
  })
}

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
const num = sql => Number(psql(sql))
const lit = s => `'${String(s).replace(/'/g, '\'\'')}'`

// Склонение и числа — как на странице: 5 900 (пробелы любые), «$0,64»
const form = n => (n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1 : 2
const word = (n, ...forms) => forms[form(n)]
const sp = s => (s ?? '').replace(/\s+/g, ' ').trim()
const vol = n => sp(n.toLocaleString('ru-RU'))
const usd = n => `$${n.toFixed(2).replace('.', ',')}`
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const dayMonth = iso => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Almaty' })

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
async function api(path, token) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} })
  let json = null
  try {
    json = await res.json()
  }
  catch {}
  return { status: res.status, json }
}

const stamp = Date.now()
const emails = { admin: `purchasing-admin-${stamp}@example.test`, buyer: `purchasing-buyer-${stamp}@example.test` }
const users = []

function makeAdmin(adminId) {
  psql(`
SELECT tgname AS t FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"t";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"t";
COMMIT;
`, { admin: adminId })
}

// Что «К закупке» считает дошедшим до порога — так же, как needsRestock
async function expectedRestock(token) {
  const { json } = await api('/api/admin/restock', token)
  const at = json.products.filter(p => p.stock + (p.pending ?? 0) <= p.minStock)
  return {
    products: json.products,
    restock: {
      atThreshold: at.length,
      noSupplier: at.filter(p => !p.supplierId).length,
      suppliers: new Set(at.filter(p => p.supplierId).map(p => p.supplierId)).size,
      openOrders: num(`SELECT count(*) FROM public.supplier_orders WHERE status IN ('ordered', 'in_transit')`),
    },
  }
}
// Поставщики из базы: активные товары и каналы у каждого
function suppliersInDb() {
  return JSON.parse(psql(`
SELECT coalesce(json_agg(x), '[]') FROM (
  SELECT s.id, s.name,
         (SELECT count(*) FROM public.products p WHERE p.supplier_id = s.id AND p.is_active) AS products,
         (SELECT count(*) FROM public.supplier_channels c WHERE c.supplier_id = s.id) AS channels
  FROM public.suppliers s) x;`))
}

// --- Заглушка DataForSEO: баланс и отказ задаются по ходу ---
const stub = { balance: 0.6412, reject: false, log: [] }
const stubServer = http.createServer((req, res) => {
  const good = req.headers.authorization === `Basic ${Buffer.from(`${PROBE_LOGIN}:${PROBE_PASSWORD}`).toString('base64')}`
  stub.log.push({ url: req.url, good })
  res.setHeader('Content-Type', 'application/json')
  if (!good || stub.reject) {
    res.statusCode = 401
    return res.end(JSON.stringify({ status_code: 40100, status_message: 'You are not authorized.', cost: 0, tasks: [] }))
  }
  if (req.url === '/v3/appendix/user_data') {
    return res.end(JSON.stringify({
      status_code: 20000,
      status_message: 'Ok.',
      tasks: [{ status_code: 20000, result: [{ login: PROBE_LOGIN, money: { total: 1, balance: stub.balance } }] }],
    }))
  }
  res.statusCode = 404
  res.end('{}')
})
await new Promise(resolve => stubServer.listen(STUB_PORT, resolve))

// --- Цифры спроса для четырёх тем: 24 месяца до прошлого месяца по Алматы ---
const almaty = new Date(Date.now() + 5 * 3600_000)
const nowMonth = almaty.getUTCMonth() + 1
const lastIndex = almaty.getUTCFullYear() * 12 + almaty.getUTCMonth() - 1
const MONTHS = Array.from({ length: 24 }, (_, i) => {
  const n = lastIndex - 23 + i
  return `${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, '0')}-01`
})
const moy = m => Number(m.slice(5, 7))
const monthName = m => `${MONTH_NAMES[moy(m) - 1]} ${m.slice(0, 4)}`
const peakMonth = nowMonth % 12 + 1
const DESIGNS = [
  // растёт втрое, а у нас такого нет
  { role: 'missing', avg3: 400, trend: 300, season: false, series: MONTHS.map((_, i) => (i >= 21 ? 400 : 100)) },
  // падает
  { role: 'falling', avg3: 200, trend: -75, season: false, series: MONTHS.map((_, i) => (i >= 21 ? 200 : 800)) },
  // пик в следующем месяце — скоро сезон
  { role: 'season', avg3: 300, trend: 0, season: true, series: MONTHS.map(m => (moy(m) === peakMonth ? 1500 : 300)) },
  // ищут больше всех
  { role: 'volume', avg3: 5000, trend: 0, season: false, series: MONTHS.map(() => 5000) },
]
const seeded = []

const runIds = []
let probeCreds = false
let probeAiKey = false
let probeModel = false
let probeQuery = false
let renamed = false

function cleanup() {
  if (runIds.length)
    psql(`DELETE FROM public.market_demand_runs WHERE id IN (${runIds.join(',')});`)
  if (seeded.length)
    psql(`DELETE FROM public.market_demand_keywords WHERE keyword IN (${seeded.map(lit).join(',')});`)
  if (probeQuery)
    psql(`DELETE FROM public.market_demand_candidates WHERE keyword = ${lit(PROBE_QUERY)};`)
  if (probeCreds)
    psql(`SELECT public.market_demand_credentials_delete();`)
  if (probeAiKey)
    psql(`SELECT public.ai_key_delete('anthropic');`)
  if (probeModel)
    psql(`DELETE FROM public.ai_settings WHERE key = 'supplier_vision_model';`)
  psql(`DELETE FROM public.suppliers WHERE name = '${SUPPLIER}';`)
}

const browser = await chromium.launch()
try {
  psql(`DELETE FROM public.suppliers WHERE name = '${SUPPLIER}';`)
  const hadCreds = num(`SELECT count(*) FROM public.market_demand_credentials_status()`) > 0
  const hadAi = num(`SELECT count(*) FROM public.ai_keys_status()`) > 0
    || num(`SELECT count(*) FROM public.ai_settings WHERE key = 'supplier_vision_model'`) > 0
  const hadRuns = num(`SELECT count(*) FROM public.market_demand_runs`) > 0
  const hadNumbers = num(`SELECT count(*) FROM public.market_demand_monthly`) > 0
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}`)

  const nSuppliers = num(`SELECT count(*) FROM public.suppliers`)
  const nTopics = num(`SELECT count(*) FROM public.market_demand_topics WHERE is_active`)
  const nChannels = num(`SELECT count(*) FROM public.supplier_channels`)
  // Аккаунт Telegram (миграция 20261104120000): есть ли она и подключён ли аккаунт — сессия в Vault
  const tgInstalled = psql(`SELECT to_regclass('public.telegram_account') IS NOT NULL;`) === 't'
  const tgConnected = num(`SELECT count(*) FROM vault.secrets WHERE name = 'telegram_session'`) > 0
  const nActive = num(`SELECT count(*) FROM public.products WHERE is_active`)
  const nUnassigned = num(`SELECT count(*) FROM public.products WHERE is_active AND supplier_id IS NULL`)
  const { products: restockProducts, restock } = await expectedRestock(adminToken)
  const dbSuppliers = suppliersInDb()

  console.log('\n== маршрут')
  check((await api('/api/admin/purchasing', null)).status === 401, 'гость — 401')
  check((await api('/api/admin/purchasing', buyerToken)).status === 403, 'не-администратор — 403')
  const first = await api('/api/admin/purchasing', adminToken)
  const j = first.json ?? {}
  check(first.status === 200, `администратору — 200${first.status === 200 ? '' : ` (${first.status} ${j.message})`}`)
  check(j.suppliers === nSuppliers && j.channels?.total === nChannels && j.demand?.overview?.topics === nTopics, `поставщики ${j.suppliers}, каналы ${j.channels?.total}, темы ${j.demand?.overview?.topics} — как в базе`)
  check(JSON.stringify(j.restock) === JSON.stringify(restock), `к закупке — как на «К закупке»: ${JSON.stringify(j.restock)}`)
  check(JSON.stringify(j.telegram) === JSON.stringify(tgInstalled ? { connected: tgConnected } : null), `аккаунт Telegram — как в базе: ${JSON.stringify(j.telegram)}`)
  const loadOk = j.supplierLoad?.length === dbSuppliers.length && dbSuppliers.every((s) => {
    const row = j.supplierLoad.find(x => x.id === s.id)
    const toRestock = restockProducts.filter(p => p.supplierId === s.id && p.stock + (p.pending ?? 0) <= p.minStock).length
    return row && row.name === s.name && row.products === s.products && row.channels === s.channels && row.toRestock === toRestock
  })
  check(loadOk, `по поставщикам — товары, к закупке и каналы как в базе (${j.supplierLoad?.length} поставщиков)`)
  check(j.supplierLoad?.every((s, i, a) => !i || a[i - 1].products >= s.products), 'поставщики — от большего числа товаров к меньшему')
  check(j.unassigned?.products === nUnassigned && j.supplierLoad.reduce((n, s) => n + s.products, 0) + nUnassigned === nActive, `товары: ${nActive - nUnassigned} у поставщиков + ${nUnassigned} без поставщика = ${nActive} активных`)
  check(j.ai?.model === 'anthropic/claude-haiku-5-5' || hadAi, `модель по умолчанию — ${j.ai?.model}`)
  if (!hadNumbers)
    check(j.demand?.overview?.withData === 0 && j.demand.overview.monthly === null && j.demand.overview.series === null, 'цифр спроса нет — сумма и ряд пустые, не нули')
  if (!hadCreds)
    check(j.demand?.hasKey === false && j.demand.balance === null && j.demand.balanceError === null && !stub.log.length, 'ключа DataForSEO нет — за балансом не ходит')

  const errors = []
  const failed = []
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      if (r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts')))
        failed.push(`${r.status()} ${r.url().replace(BASE, '')}`)
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
    await openHub(page)
    return page
  }
  async function openHub(page) {
    await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
    await page.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
    await page.waitForLoadState('networkidle')
  }
  const steps = page => page.evaluate(() => [...document.querySelectorAll('[data-testid=purchasing-steps] > li[data-testid]')].map(el => ({
    id: el.dataset.testid.replace(/^step-/, ''),
    state: el.dataset.state,
    badge: el.querySelector('[data-testid=step-state]')?.textContent.trim(),
    facts: el.querySelector('[data-testid=step-facts]')?.textContent.trim() ?? '',
    next: el.querySelector('[data-testid=step-next]')?.textContent.trim() ?? '',
    href: el.querySelector('[data-testid=step-link]')?.getAttribute('href') ?? null,
  })))
  const stepOf = async (page, id) => (await steps(page)).find(s => s.id === id) ?? {}
  // Плитки: { id: { value, note, delta, warn } }, по порядку
  const tiles = page => page.evaluate(() => [...document.querySelectorAll('[data-testid^=tiles-] > [data-testid]')].map((el) => {
    const text = id => el.querySelector(`[data-testid=${id}]`)?.textContent.replace(/\s+/g, ' ').trim() ?? null
    return { id: el.dataset.testid.replace(/^tile-/, ''), value: text('tile-value'), note: text('tile-note'), delta: text('tile-delta'), warn: text('tile-warn') }
  }))
  const tileOf = async (page, id) => (await tiles(page)).find(t => t.id === id) ?? {}
  const text = async (page, testid) => sp(await page.locator(`[data-testid=${testid}]`).first().textContent({ timeout: 5000 }).catch(() => null))
  const supplierRows = page => page.locator('[data-testid=supplier-row]').evaluateAll(rows => rows.map(r => [...r.querySelectorAll('td')].map(td => td.textContent.replace(/\s+/g, ' ').trim())))
  // База поменялась — страницу заново, как владелец по кнопке «Обновить»
  async function refreshHub(page) {
    const done = page.waitForResponse(r => r.url().includes('/api/admin/purchasing'), { timeout: 30000 })
    await page.getByRole('button', { name: 'Обновить', exact: true }).click()
    await done
    await page.waitForFunction(() => !document.querySelector('button .animate-spin'), null, { timeout: 30000 })
  }
  // Когда обновится само — 5-го в 04:30 UTC, если за 20 дней удачного не было
  function nextAuto(doneIso) {
    const now = new Date()
    const done = doneIso ? Date.parse(doneIso) : null
    const run = k => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 5, 4, 30)
    const k = [0, 1].find(k => run(k) > now.getTime() && (done == null || run(k) - done >= 20 * 86_400_000)) ?? 1
    return dayMonth(new Date(run(k)).toISOString())
  }

  console.log('\n== дашборд, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  const pageLinks = await page.locator('[data-testid=purchasing-pages] a').evaluateAll(as => as.map(a => [a.getAttribute('href'), a.textContent.trim()]))
  check(JSON.stringify(pageLinks) === JSON.stringify(PAGES), `кнопки страниц закупа по порядку: ${pageLinks.map(p => p[1]).join(', ')}`)
  const t0 = await tiles(page)
  check(t0.map(t => t.id).join() === 'monthly,missing,growing,season,suppliers,products,restock,balance', `восемь плиток в два ряда: ${t0.map(t => t.id).join(', ')}`)
  const tile = id => t0.find(t => t.id === id) ?? {}
  check(tile('suppliers').value === String(nSuppliers) && (nChannels || tile('suppliers').note === 'каналов в Telegram ещё нет'), `«Поставщики» — ${tile('suppliers').value}: «${tile('suppliers').note}»`)
  check(tile('products').value === String(nActive - nUnassigned) && tile('products').note === (nUnassigned ? `и ${nUnassigned} без поставщика` : 'у всех товаров есть поставщик'), `«Товаров от поставщиков» — ${tile('products').value}: «${tile('products').note}»`)
  const withSupplier = restock.atThreshold - restock.noSupplier
  check(tile('restock').value === String(restock.atThreshold) && (!restock.atThreshold || tile('restock').note.startsWith(word(restock.atThreshold, 'товар', 'товара', 'товаров'))), `«К закупке» — ${tile('restock').value}: «${tile('restock').note}»`)
  check(!restock.noSupplier || !withSupplier || tile('restock').note.endsWith(`, ${restock.noSupplier} без поставщика`), 'без поставщика — отдельно в той же плитке')
  if (!hadNumbers) {
    check(['monthly', 'missing', 'growing', 'season'].every(id => tile(id).value === '—' && tile(id).note === 'цифр ещё нет') && !tile('monthly').delta, 'цифр спроса нет — прочерки, а не нули')
    const empty = await text(page, 'demand-empty')
    check(empty.startsWith(`Цифр спроса ещё нет — ${nTopics} ${word(nTopics, 'тема', 'темы', 'тем')} ждут первого обновления.`) && (hadCreds || (empty.includes('Задайте ключ DataForSEO') && empty.includes('$0,18'))), `пустой спрос — что сделать и сколько стоит: «${empty.slice(0, 120)}…»`)
    check(await page.locator('[data-testid=demand-chart]').count() === 0, 'без цифр графика нет')
  }
  if (!hadCreds) {
    check(tile('balance').value === '—' && tile('balance').note === 'ключ не задан', '«Остаток DataForSEO» — ключ не задан')
    check(await text(page, 'usage-balance') === 'ключ не задан' && await text(page, 'usage-next') === 'не будет, пока не задан ключ', 'расход: ключа нет — само не обновится')
    check(await page.locator('[data-testid=usage-dataforseo] a[href="/admin/demand"]').count() === 1, 'кнопка «Задать ключ» — на «Спрос на рынке»')
  }
  if (!hadRuns)
    check(await text(page, 'usage-last') === 'ещё не было', 'расход: обновлений ещё не было')
  if (!hadAi)
    check(await text(page, 'usage-ai-keys') === 'не заданы' && await page.locator('[data-testid=usage-ai] a[href="/admin/ai"]').count() === 1, 'ключей ИИ нет — кнопка на «Модели ИИ»')

  const rows0 = await supplierRows(page)
  check(rows0.length === j.supplierLoad.length && rows0.every((r, i) => r[0] === j.supplierLoad[i].name && r[1] === String(j.supplierLoad[i].products)), `таблица поставщиков — ${rows0.length} строк, товары как в базе`)
  check(!nUnassigned || sp(await page.locator('[data-testid=supplier-row-none]').textContent()).startsWith(`Без поставщика ${nUnassigned}`), 'строка «Без поставщика» — с числом товаров')

  const all = await steps(page)
  check(all.map(s => s.id).join() === 'suppliers,demand,ai,offers,order', `пять шагов по порядку: ${all.map(s => s.id).join(', ')}`)
  check(all.map(s => s.href).join() === '/admin/suppliers,/admin/demand,/admin/ai,/admin/supplier-offers,/admin/restock', 'ссылки шагов — на их страницы')
  const [sup, dem, ai, offers, order] = all
  check(sup.facts.startsWith(`${nSuppliers} ${word(nSuppliers, 'поставщик', 'поставщика', 'поставщиков')}`), `шаг 1 — поставщиков столько же, сколько в базе: «${sup.facts}»`)
  if (!nChannels)
    check(sup.state === 'action' && sup.facts.includes('каналов в Telegram нет') && /«Каналы в Telegram»/.test(sup.next), `шаг 1 без каналов — ждёт владельца, как добавить: «${sup.next}»`)
  check(dem.facts.startsWith(`${nTopics} тем`), `шаг 2 — тем столько же, сколько в базе: «${dem.facts}»`)
  if (!hadCreds && !hadRuns)
    check(dem.state === 'action' && dem.facts.includes('цифр ещё нет') && dem.facts.includes('ключ DataForSEO не задан') && /\$0,18/.test(dem.next), `шаг 2 без ключа — ждёт владельца, с ценой: «${dem.next}»`)
  if (!hadAi)
    check(ai.state === 'action' && ai.facts === 'ключа ИИ нет', `шаг 3 без ключа — ждёт владельца: «${ai.next}»`)
  const offersState = !j.offers || !nChannels ? 'later' : !j.offers.collectedAt || j.offers.fresh ? 'action' : 'done'
  check(offers.state === offersState && (j.offers || offers.next === 'Заработает после миграции базы.'), `шаг 4, товары поставщиков — «${offers.badge}»: «${offers.next}»`)
  const orderState = (withSupplier || restock.noSupplier) ? 'action' : restock.openOrders ? 'running' : 'done'
  check(order.state === orderState, `шаг 5 — «${order.badge}», как по остаткам: ${withSupplier} у поставщиков, ${restock.noSupplier} без поставщика`)
  check(!withSupplier || order.facts.includes(`к закупке ${withSupplier} `), `шаг 5 — к закупке ${withSupplier}: «${order.facts}»`)
  const waitingNow = all.flatMap((s, i) => s.state === 'action' ? [i + 1] : [])
  const waitingLine = sp(await page.locator('[data-testid=purchasing-waiting]').innerText())
  check(waitingNow.every(n => waitingLine.includes(String(n))) && (waitingNow.length ? /^Сейчас от вас нужно: шаги? [\d, и]+ — что сделать, внизу ↓$/.test(waitingLine) : waitingLine === 'Сейчас от вас ничего не нужно.'), `строка сверху: «${waitingLine}»`)
  if (waitingNow.length) {
    await page.locator('[data-testid=purchasing-waiting] a').click()
    await page.waitForFunction(() => {
      const r = document.getElementById('steps')?.getBoundingClientRect()
      return r && r.top >= -2 && r.top < window.innerHeight / 2
    }, null, { timeout: 5000 }).then(() => check(true, 'номера шагов в строке — ссылка вниз, к шагам'), () => check(false, 'номера шагов в строке — ссылка вниз, к шагам'))
    await page.evaluate(() => window.scrollTo(0, 0))
  }
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/purchasing-1366.png`, fullPage: true })

  console.log('\n== меню')
  const navHrefs = await page.locator('aside nav a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(navHrefs.length === new Set(navHrefs).size, `пункты меню не задвоились (${navHrefs.length})`)
  check(MENU.every(h => navHrefs.includes(h)) && navHrefs.length === MENU.length, `в меню ${navHrefs.length}: прежние пункты, вместо страниц закупа — один «Умный закуп»`)
  check(!PAGES.some(([h]) => navHrefs.includes(h)) && await page.locator('[data-testid=nav-group]').count() === 0, 'страниц закупа в меню нет, подпунктов тоже')
  const item = page.locator('aside nav a[href="/admin/purchasing"]')
  // Горящий пункт — aria-current="page" (меню по макету AdminSidebar, 9.11.2026; прежде — класс bg-muted)
  check(sp(await item.innerText()) === 'Умный закуп' && await item.getAttribute('aria-current') === 'page', 'на дашборде «Умный закуп» в меню подсвечен')
  for (const [href, label] of PAGES) {
    await page.locator(`[data-testid=purchasing-pages] a[href="${href}"]`).click()
    await page.waitForURL(`**${href}`, { timeout: 30000 })
    await page.waitForLoadState('networkidle')
    check(await item.getAttribute('aria-current') === 'page', `«${label}» — открылась кнопкой, «Умный закуп» в меню горит`)
    await openHub(page)
  }
  await page.locator('[data-testid=step-ai] [data-testid=step-link]').click()
  await page.waitForURL('**/admin/ai', { timeout: 30000 })
  check(new URL(page.url()).pathname === '/admin/ai', 'кнопка шага «Модели ИИ» открывает /admin/ai')
  await openHub(page)

  console.log('\n== шаги и расход вслед за базой')
  const supplierId = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER}') RETURNING id;`)
  psql(`
INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview) VALUES (:'s', 'probe_purchasing_open', 'Проверка — открытый', 'channel', true);
INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type) VALUES (:'s', 'ProbePurchasing_123', 'Проверка — закрытый', 'channel');
`, { s: supplierId })
  await refreshHub(page)
  const sup2 = await stepOf(page, 'suppliers')
  const nSup2 = nSuppliers + 1
  if (tgInstalled && !tgConnected)
    check(sup2.state === 'action' && sup2.badge === 'Нужно ваше действие' && sup2.href === '/admin/telegram', `закрытый канал без аккаунта Telegram — шаг 1 ждёт владельца, кнопка на «Аккаунт Telegram» (${sup2.state}, ${sup2.href})`)
  else
    check(sup2.state === 'done' && sup2.badge === 'Готово', 'каналы есть — шаг 1 «Готово»')
  if (!nChannels) {
    check(sup2.facts === `${nSup2} ${word(nSup2, 'поставщик', 'поставщика', 'поставщиков')} · 2 канала в Telegram — у 1 из ${nSup2} ${word(nSup2, 'поставщика', 'поставщиков', 'поставщиков')} · через аккаунт: 1`, `сколько каналов, у скольких поставщиков, сколько через аккаунт: «${sup2.facts}»`)
    const ts = await tileOf(page, 'suppliers')
    check(ts.value === String(nSup2) && ts.note === `2 канала в Telegram — у 1 из ${nSup2}`, `плитка «Поставщики» — «${ts.value}», «${ts.note}»`)
  }
  check(/через аккаунт Telegram/.test(sup2.next), `про закрытый канал — читать через аккаунт: «${sup2.next}»`)
  const probeRow = (await supplierRows(page)).find(r => r[0] === SUPPLIER)
  check(probeRow?.join(' | ') === `${SUPPLIER} | 0 | — | 2 1 через аккаунт`, `строка нового поставщика — без товаров, 2 канала, 1 через аккаунт: «${probeRow?.join(' | ')}»`)

  runIds.push(psql(`INSERT INTO public.market_demand_runs (kind, status, requested_at) VALUES ('volumes', 'pending', '2026-11-03T05:00:00Z') RETURNING id;`))
  await refreshHub(page)
  const dem2 = await stepOf(page, 'demand')
  check(dem2.state === 'running' && dem2.badge === 'Идёт', `обновление спроса запрошено — шаг 2 «Идёт»: «${dem2.next}»`)
  check((await text(page, 'usage-card')).includes('Обновление идёт — DataForSEO ещё не ответил.'), 'расход: обновление идёт')

  if (!hadCreds) {
    psql(`SELECT public.market_demand_credentials_set('${PROBE_LOGIN}', '${PROBE_PASSWORD}', :'a');`, { a: adminId })
    probeCreds = true
  }
  psql(`UPDATE public.market_demand_runs SET status = 'failed', error = 'Проверка умного закупа', finished_at = '2026-11-03T05:01:00Z' WHERE id = ${runIds[0]};`)
  await refreshHub(page)
  const dem3 = await stepOf(page, 'demand')
  check(dem3.state === 'action' && /не удалось/.test(dem3.next) && !dem3.facts.includes('ключ DataForSEO не задан'), `ключ задан, обновление не удалось — ждёт владельца: «${dem3.next}»`)
  check((await text(page, 'usage-card')).includes('Последнее обновление не удалось'), 'расход: последнее обновление не удалось')
  const withKey = await api('/api/admin/purchasing', adminToken)
  const keyJson = JSON.stringify(withKey.json)
  check(withKey.json?.demand?.hasKey === true && !keyJson.includes(PROBE_LOGIN) && !keyJson.includes(PROBE_PASSWORD) && !/login|last4|password/i.test(keyJson), 'ключ DataForSEO — только «задан», без логина, пароля и последних знаков')

  if (probeCreds) {
    const asked = stub.log.filter(l => l.url === '/v3/appendix/user_data')
    check(asked.length > 0 && asked.every(l => l.good), asked.length ? 'за балансом — в DataForSEO с ключом из базы' : `стенд не ходит в заглушку — запустите его с DATAFORSEO_STUB_URL=http://localhost:${STUB_PORT}`)
    const tb = await tileOf(page, 'balance')
    check(tb.value === '$0,64' && tb.note === 'хватит на 3 обновления' && !tb.warn, `«Остаток DataForSEO» — «${tb.value}», «${tb.note}»`)
    check(await text(page, 'usage-balance') === '$0,64 — хватит на 3 обновления', 'расход: остаток и на сколько обновлений хватит')
    check(await text(page, 'usage-next') === `${nextAuto(null)} — каждое 5-е число`, `само обновится ${nextAuto(null)}`)
    for (const [balance, note, warn] of [[0.25, 'хватит на 1 обновление', 'пора пополнить'], [0.1, 'не хватит ни на одно обновление', 'пополните баланс']]) {
      stub.balance = balance
      await refreshHub(page)
      const t = await tileOf(page, 'balance')
      check(t.value === usd(balance) && t.note === note && t.warn === warn, `остаток ${usd(balance)} — «${t.note}», «${t.warn}»`)
    }
    stub.reject = true
    await refreshHub(page)
    const tr = await tileOf(page, 'balance')
    const usageErr = await text(page, 'usage-balance')
    check(tr.value === '—' && tr.note === 'не удалось узнать' && usageErr === 'не узнать: DataForSEO не принял логин и пароль API', `DataForSEO отказал — дашборд работает, причина видна: «${usageErr}»`)
    stub.reject = false
    stub.balance = 0.6412
  }
  else {
    console.log('  --   ключ DataForSEO: на локальной базе уже есть свой — проверки остатка пропущены')
  }

  runIds.push(psql(`INSERT INTO public.market_demand_runs (kind, status, items, cost, requested_at, finished_at) VALUES ('volumes', 'done', 10, 0.09, '2026-11-02T20:00:00Z', '2026-11-02T20:30:00Z') RETURNING id;`))
  runIds.push(psql(`INSERT INTO public.market_demand_runs (kind, status, items, cost, requested_at, finished_at) VALUES ('ideas', 'done', 5, 0.09, '2026-11-02T20:00:00Z', '2026-11-02T20:31:00Z') RETURNING id;`))
  await refreshHub(page)
  const dem4 = await stepOf(page, 'demand')
  check(dem4.state === 'done' && dem4.facts.includes('обновлено 3 ноября') && /5-го числа/.test(dem4.next), `обновление пришло — «Готово», дата по Алматы: «${dem4.facts}»`)
  check(await text(page, 'usage-last') === '3 ноября · $0,18', 'расход: последнее обновление — 3 ноября, $0,18 за обе задачи')
  if (probeCreds)
    check(await text(page, 'usage-next') === `${nextAuto('2026-11-02T20:30:00Z')} — каждое 5-е число`, `обновляли недавно — само обновится ${nextAuto('2026-11-02T20:30:00Z')}`)

  if (!hadAi) {
    psql(`SELECT public.ai_key_set('anthropic', '${PROBE_AI_KEY}', :'a');`, { a: adminId })
    probeAiKey = true
    await refreshHub(page)
    const ai2 = await stepOf(page, 'ai')
    // С миграцией чтения (20261105120000) — «Готово»; прочитанное за 30 дней, если было, — следующим фактом
    const reads = Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE read_items IS NOT NULL AND read_at >= now() - interval '30 days';`))
    const aiFacts = 'ключ: Anthropic (Claude) · модель: claude-haiku-5-5'
    check(ai2.state === 'done' && (reads ? ai2.facts.startsWith(`${aiFacts} · прочитано за 30 дней: ${reads} `) : ai2.facts === aiFacts), `ключ ИИ задан, чтение подключено — «Готово»: «${ai2.facts}»`)
    check(ai2.next.startsWith('ИИ читает артикул и цену'), `дальше — чтение при сборе: «${ai2.next}»`)
    if (!reads)
      check(await text(page, 'usage-ai-spend') === 'за 30 дней чтений не было', `расход на чтение: «${await text(page, 'usage-ai-spend')}»`)
    check(await text(page, 'usage-ai-keys') === 'Anthropic (Claude)' && await page.locator('[data-testid=usage-ai] a[href="/admin/ai"]').count() === 0, 'расход: ключ Anthropic задан, кнопки «Добавить ключ» нет')
    const aiJson = JSON.stringify((await api('/api/admin/purchasing', adminToken)).json)
    check(!aiJson.includes('probe') && !aiJson.includes(PROBE_AI_KEY.slice(-4)), 'ключ ИИ в ответе не виден ни знаком')
    psql(`INSERT INTO public.ai_settings (key, value) VALUES ('supplier_vision_model', '"openai/gpt-6.1-terra"');`)
    probeModel = true
    await refreshHub(page)
    const ai3 = await stepOf(page, 'ai')
    check(ai3.state === 'action' && ai3.facts.includes('модель: gpt-6.1-terra') && /нет ключа/.test(ai3.next), `модель без ключа своего провайдера — ждёт владельца: «${ai3.next}»`)
    check((await text(page, 'usage-ai')).includes('openai/gpt-6.1-terra'), 'расход: видна выбранная модель')
  }
  else {
    console.log('  --   ключ ИИ: на локальной базе уже есть свой — проверки ключа пропущены')
  }

  console.log('\n== спрос по темам — на своих цифрах')
  if (!hadNumbers) {
    // Темы, чьи фразы только в них самих: одна без наших товаров, три с товарами
    const picks = JSON.parse(psql(`
WITH s AS (SELECT * FROM public.market_demand_summary() WHERE is_active AND cardinality(keywords) > 0),
     k AS (SELECT kw, count(*) AS n FROM public.market_demand_topics, unnest(keywords) kw GROUP BY kw),
     c AS (SELECT s.topic_id, s.name, s.keywords[1] AS keyword, s.our_total FROM s JOIN k ON k.kw = s.keywords[1] AND k.n = 1)
SELECT json_build_object(
  'none', (SELECT json_agg(x) FROM (SELECT * FROM c WHERE our_total = 0 ORDER BY name LIMIT 1) x),
  'ours', (SELECT json_agg(x) FROM (SELECT * FROM c WHERE our_total > 0 ORDER BY name LIMIT 3) x));`))
    const chosen = [...(picks.none ?? []), ...(picks.ours ?? [])]
    check(picks.none?.length === 1 && picks.ours?.length === 3, `темы для цифр: ${chosen.map(t => t.name).join(', ')}`)
    const topics = DESIGNS.map((d, i) => ({ ...d, ...chosen[i] }))
    psql(`
INSERT INTO public.market_demand_keywords (keyword, search_volume) VALUES ${topics.map(t => `(${lit(t.keyword)}, ${t.series.at(-1)})`).join(', ')};
INSERT INTO public.market_demand_monthly (keyword, month, search_volume) VALUES
${topics.flatMap(t => t.series.map((v, i) => `(${lit(t.keyword)}, '${MONTHS[i]}', ${v})`)).join(',\n')};
INSERT INTO public.market_demand_candidates (keyword, search_volume, trend_pct) VALUES (${lit(PROBE_QUERY)}, 500, 40);
`)
    seeded.push(...topics.map(t => t.keyword))
    probeQuery = true

    // Сводка базы по этим темам — как задумано
    const rpc = JSON.parse(psql(`SELECT json_agg(s) FROM public.market_demand_summary() s WHERE s.topic_id IN (${topics.map(t => lit(t.topic_id)).join(',')});`))
    const asDesigned = topics.every((t) => {
      const r = rpc.find(x => x.topic_id === t.topic_id)
      return r && r.volume_avg3 === t.avg3 && r.trend_pct === t.trend && r.season_soon === t.season && r.data_until === MONTHS.at(-1)
    })
    check(asDesigned, 'в сводке базы — спрос, рост и сезон каждой темы как задуманы')

    const series = MONTHS.map((_, i) => topics.reduce((n, t) => n + t.series[i], 0))
    const monthly = topics.reduce((n, t) => n + t.avg3, 0)
    const last3 = series.slice(-3).reduce((a, b) => a + b, 0)
    const prev3 = series.slice(9, 12).reduce((a, b) => a + b, 0)
    const trend = Math.round((last3 - prev3) * 100 / prev3)
    const byVolume = [...topics].sort((a, b) => b.avg3 - a.avg3).map(t => t.name)
    const missingT = topics[0]
    const seasonT = topics[2]
    const newQueries = num(`SELECT count(*) FROM public.market_demand_candidates WHERE status = 'new'`)

    const o = (await api('/api/admin/purchasing', adminToken)).json?.demand?.overview ?? {}
    check(o.withData === 4 && o.monthly === monthly && JSON.stringify(o.series) === JSON.stringify(series) && o.dataUntil === MONTHS.at(-1), `сводка: 4 темы с цифрами, ${monthly} поисков в месяц, ряд за 24 месяца`)
    check(o.trend === trend, `рост ко году — ${o.trend}% (по ряду ${trend}%)`)
    check([o.missing, o.growing, o.falling, o.season].join() === '1,1,1,1' && o.newQueries === newQueries, `ищут, а у нас нет / растёт / падает / скоро сезон — ${[o.missing, o.growing, o.falling, o.season].join(' / ')}, новых запросов ${o.newQueries}`)
    check(o.top?.volume?.map(t => t.name).join() === byVolume.join() && o.top.missing.map(t => t.name).join() === missingT.name && o.top.growing.map(t => t.name).join() === missingT.name && o.top.season.map(t => t.name).join() === seasonT.name, 'списки тем: по спросу, без товаров, растущие, к сезону')

    await refreshHub(page)
    const tm = await tileOf(page, 'monthly')
    const kind = trend >= 15 ? 'up' : trend <= -15 ? 'down' : 'flat'
    const trendText = trend > 0 ? `+${trend}%` : trend < 0 ? `−${Math.abs(trend)}%` : '0%'
    check(tm.value === vol(monthly) && tm.note === 'поисков в Google по всем темам' && tm.delta === `${trendText} к прошлому году`, `«Спрос в месяц» — ${tm.value}, «${tm.delta}» (${kind})`)
    const deltaClass = await page.locator('[data-testid=tile-monthly] [data-testid=tile-delta]').getAttribute('class')
    check(deltaClass.includes({ up: 'text-green-700', down: 'text-red-700', flat: 'text-muted-foreground' }[kind]), `рост покрашен по смыслу: ${kind}`)
    const tOther = await tiles(page)
    const tv = id => tOther.find(t => t.id === id) ?? {}
    check(tv('missing').value === '1' && tv('missing').note === 'тема без наших товаров' && tv('growing').value === '1' && tv('season').value === '1' && tv('season').note === 'тема с пиком в ближайшие 2 месяца', `«Ищут, а у нас нет» / «Растёт» / «Скоро сезон» — ${tv('missing').value} / ${tv('growing').value} / ${tv('season').value}`)

    const desc = await text(page, 'demand-card')
    check(desc.includes(`год назад. Последний месяц — ${monthName(MONTHS.at(-1))}, обновлено 3 ноября.`), 'у спроса по темам — последний месяц и дата обновления')
    const lists = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^=demand-list-]:not([data-testid=demand-list-all])')].map(s => [
      s.dataset.testid.replace('demand-list-', ''),
      [...s.querySelectorAll('[data-testid=demand-line]')].map(li => [...li.querySelectorAll('p, div > div')].map(e => e.textContent.replace(/\s+/g, ' ').trim())),
    ])))
    check(Object.keys(lists).join() === 'missing,growing,season,volume', `четыре списка: ${Object.keys(lists).join(', ')}`)
    check(lists.volume?.map(l => l[0]).join() === byVolume.join(), `«Больше всего ищут» — ${lists.volume?.map(l => l[0]).join(', ')}`)
    const ml = lists.missing?.[0] ?? []
    check(ml[0] === missingT.name && ml[1] === 'у нас нет' && ml.includes(vol(400)) && ml.includes('+300%'), `«Ищут, а у нас нет» — тема без товаров, спрос и рост: «${ml.join(' | ')}»`)
    const sl = lists.season?.[0] ?? []
    check(sl[0] === seasonT.name && sl[1].startsWith(`пик в ${['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'][peakMonth - 1]} · у нас `), `«Скоро сезон» — когда пик и что у нас есть: «${sl[1]}»`)
    check(await page.locator('[data-testid=demand-list-all]').count() === 0, 'тем в списках не больше пяти — ссылки «все N» нет')
    check(await text(page, 'demand-new-queries') === `Новых запросов на рынке, ещё не разобранных: ${newQueries} разобрать на «Спросе на рынке» →`, 'новые запросы на рынке — сколько ждут разбора')

    // График: конец подписан, подсказка — мышью и стрелками, таблица — те же числа
    const chartBox = page.locator('[data-testid=demand-chart]')
    await chartBox.scrollIntoViewIfNeeded()
    check(await text(page, 'demand-chart-end') === vol(series.at(-1)), `последний месяц подписан на графике: ${vol(series.at(-1))}`)
    const wideLabels = await monthLabelsApart(page)
    check(wideLabels.apart, `подписи месяцев не налезают друг на друга: ${wideLabels.labels}`)
    const plot = await page.locator('[data-testid=demand-chart] svg rect').boundingBox()
    const tip = () => text(page, 'demand-chart-tip')
    await page.mouse.move(plot.x + 1, plot.y + plot.height / 2)
    check(await tip() === `${monthName(MONTHS[0])} · ${vol(series[0])} ${word(series[0], 'поиск', 'поиска', 'поисков')}`, `мышь у левого края — первый месяц: «${await tip()}»`)
    await page.mouse.move(plot.x + plot.width - 1, plot.y + plot.height / 2)
    check(await tip() === `${monthName(MONTHS[23])} · ${vol(series[23])} ${word(series[23], 'поиск', 'поиска', 'поисков')}`, `у правого — последний: «${await tip()}»`)
    await page.mouse.move(5, 5)
    check(await page.locator('[data-testid=demand-chart-tip]').count() === 0 && await page.locator('[data-testid=demand-chart-end]').count() === 1, 'мышь ушла — подсказки нет, подпись конца вернулась')
    await chartBox.focus()
    check(await tip() === `${monthName(MONTHS[23])} · ${vol(series[23])} ${word(series[23], 'поиск', 'поиска', 'поисков')}`, 'фокус с клавиатуры — последний месяц')
    await page.keyboard.press('ArrowLeft')
    check((await tip()).startsWith(monthName(MONTHS[22])), `← — месяц назад: «${await tip()}»`)
    await page.keyboard.press('Home')
    check((await tip()).startsWith(monthName(MONTHS[0])), 'Home — первый месяц')
    await chartBox.blur()
    const tableRows = await page.locator('[data-testid=demand-chart-table] tbody tr').evaluateAll(rs => rs.map(r => [...r.cells].map(td => td.textContent.replace(/\s+/g, ' ').trim()).join(' | ')))
    check(tableRows.length === 24 && tableRows[0] === `${monthName(MONTHS[0])} | ${vol(series[0])}` && tableRows[23] === `${monthName(MONTHS[23])} | ${vol(series[23])}`, `таблица под графиком — 24 месяца с теми же числами: ${tableRows.length}, «${tableRows[0]}» … «${tableRows.at(-1)}»`)
    if (SHOTS) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${SHOTS}/purchasing-1366-numbers.png`, fullPage: true })
      await chartBox.scrollIntoViewIfNeeded()
      await page.mouse.move(plot.x + plot.width * 0.62, plot.y + plot.height / 2)
      await chartBox.screenshot({ path: `${SHOTS}/purchasing-chart-hover.png` })
      await page.mouse.move(5, 5)
    }

    // Фильтр в адресе «Спроса на рынке» — ссылки дашборда ведут сразу в него
    await page.goto(`${BASE}/admin/demand?filter=growing`, { waitUntil: 'load', timeout: 120000 })
    await page.locator('[data-testid=demand-filter-growing]').waitFor({ timeout: 30000 })
    await page.waitForLoadState('networkidle')
    // Нажатая кнопка фильтра выглядит иначе, чем остальные, а остальные — одинаково
    const [growingClass, allClass, missingClass] = await Promise.all(['growing', 'all', 'missing'].map(f => page.locator(`[data-testid=demand-filter-${f}]`).getAttribute('class')))
    const growingOn = growingClass !== allClass && allClass === missingClass
    const shown = await page.locator('[data-testid=demand-topic]').evaluateAll(rs => rs.map(r => r.querySelector('.font-medium')?.textContent.trim()))
    check(growingOn && shown.join() === missingT.name, `/admin/demand?filter=growing — открыт фильтр «Растёт»: ${shown.join(', ')}${growingOn ? '' : ` (класс кнопки: ${growingClass})`}`)
    await openHub(page)
  }
  else {
    console.log('  --   на локальной базе уже есть свои цифры спроса — проверки на заданных цифрах пропущены')
  }
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/purchasing-1366-changed.png`, fullPage: true })

  console.log('\n== телефон 390 px')
  const mobile = await newPage({ width: 390, height: 844 })
  const tab = mobile.locator('div.fixed.bottom-0 nav a', { hasText: 'Закупки' })
  check(await tab.getAttribute('href') === '/admin/purchasing', 'вкладка «Закупки» ведёт на «Умный закуп»')
  const wide = await mobile.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    // Колонка админки без min-w-0: распирает она вся, поэтому виновника ищем,
    // пряча блоки по одному, — после какого ширина вернулась
    over: [...document.querySelectorAll('[data-testid]')].filter((el) => {
      const was = el.style.display
      el.style.display = 'none'
      const fixed = document.documentElement.scrollWidth <= window.innerWidth
      el.style.display = was
      return fixed
    }).map(el => el.dataset.testid),
  }))
  check(wide.scroll <= 390, `без горизонтальной прокрутки${wide.scroll <= 390 ? '' : ` — ширина ${wide.scroll}: ${wide.over.join('; ')}`}`)
  const fit = await mobile.evaluate(() => {
    const w = window.innerWidth
    const tiles = [...document.querySelectorAll('[data-testid^=tiles-] > [data-testid]')].map(el => el.getBoundingClientRect())
    const table = document.querySelector('[data-testid=supplier-load]')
    const wrap = table?.parentElement
    const chart = document.querySelector('[data-testid=demand-chart] svg')?.getBoundingClientRect()
    return {
      tiles: tiles.every(r => r.left >= 0 && r.right <= w),
      pairs: tiles.length === 8 && tiles[0].top === tiles[1].top && tiles[1].top < tiles[2].top,
      table: !table || wrap.scrollWidth <= wrap.clientWidth,
      chart: !chart || chart.right <= w,
      steps: [...document.querySelectorAll('[data-testid=purchasing-steps] > li')].every(li => li.getBoundingClientRect().right <= w),
    }
  })
  check(fit.tiles && fit.pairs, `плитки — по две в ряд, в край не упираются${fit.tiles && fit.pairs ? '' : ` (в край: ${fit.tiles}, по две: ${fit.pairs})`}`)
  check(fit.table, 'таблица поставщиков влезает без своей прокрутки')
  check(fit.chart && fit.steps, `график и шаги не вылезают за край${fit.chart && fit.steps ? '' : ` (график: ${fit.chart}, шаги: ${fit.steps})`}`)
  const narrowLabels = await monthLabelsApart(mobile)
  check(narrowLabels.apart, `и на телефоне подписи месяцев не налезают: ${narrowLabels.labels}`)
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/purchasing-390.png`, fullPage: true })
  await mobile.getByRole('button', { name: 'Меню' }).click()
  const sheet = mobile.getByRole('dialog')
  await sheet.waitFor()
  const sheetLinks = await sheet.locator('nav a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(sheetLinks.length === MENU.length && MENU.every(h => sheetLinks.includes(h)) && await sheet.locator('[data-testid=nav-group]').count() === 0, `в мобильном меню — те же ${sheetLinks.length} пунктов, без подпунктов`)
  await mobile.keyboard.press('Escape')
  await sheet.waitFor({ state: 'hidden' })
  await mobile.locator('[data-testid=purchasing-pages] a[href="/admin/suppliers"]').click()
  await mobile.waitForURL('**/admin/suppliers', { timeout: 30000 })
  await mobile.waitForLoadState('networkidle')
  check(/\btext-primary\b/.test(await tab.getAttribute('class')), 'на «Поставщиках» вкладка «Закупки» горит')
  await mobile.getByRole('button', { name: 'Меню' }).click()
  await sheet.waitFor()
  check(await sheet.locator('nav a[href="/admin/purchasing"]').getAttribute('aria-current') === 'page', 'и в мобильном меню горит «Умный закуп»')
  await mobile.context().close()

  console.log('\n== без миграции каналов')
  psql(`ALTER TABLE public.supplier_channels RENAME TO supplier_channels_check_off; NOTIFY pgrst, 'reload schema';`)
  renamed = true
  await new Promise(r => setTimeout(r, 1500))
  const off = await api('/api/admin/purchasing', adminToken)
  check(off.status === 200 && off.json?.channels === null && off.json?.demand !== null && off.json.supplierLoad.every(s => s.channels === null), 'маршрут без таблицы каналов — channels: null, не 500')
  await refreshHub(page)
  const sup3 = await stepOf(page, 'suppliers')
  check(sup3.state === 'later' && sup3.next === 'Заработает после миграции базы.', 'шаг 1 — «В разработке», после миграции')
  check((await tileOf(page, 'suppliers')).note === 'каналы — после миграции базы' && (await supplierRows(page)).every(r => r[3] === '—'), 'плитка и таблица — каналы «после миграции», прочерки')
  psql(`ALTER TABLE public.supplier_channels_check_off RENAME TO supplier_channels; NOTIFY pgrst, 'reload schema';`)
  renamed = false
  await page.context().close()

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
finally {
  await browser.close()
  stubServer.close()
  if (renamed)
    psql(`ALTER TABLE public.supplier_channels_check_off RENAME TO supplier_channels; NOTIFY pgrst, 'reload schema';`)
  cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

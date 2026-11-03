/*
 * «Умный закуп» (3.11.2026) — только на ЛОКАЛЬНОЙ базе со всеми миграциями
 * закупок (последняя — 20261103120000_supplier_channels).
 *
 * Проверяет:
 *  1) /api/admin/purchasing: гость — 401, не-администратор — 403; цифры — как
 *     в базе и как на «К закупке»; ключей в ответе нет ни знаком;
 *  2) страница: пять шагов по порядку, состояние и цифры каждого — как в
 *     базе, строка «сейчас от вас нужно»; ссылки шагов ведут на их страницы;
 *  3) шаги меняются вместе с базой: каналы поставщика (открытый и закрытый),
 *     обновление спроса (идёт → не удалось → обновлено), ключ DataForSEO,
 *     ключ ИИ и модель без ключа её провайдера;
 *  4) меню: «Умный закуп» — группа из четырёх страниц, прежние пункты не
 *     пропали и не задвоились; на странице шага подсвечены и шаг, и группа;
 *  5) телефон 390px: вкладка «Закупки» ведёт на «Умный закуп» и горит на
 *     страницах шагов, в меню — группа, без горизонтальной прокрутки;
 *  6) без миграции каналов страница работает, шаг 1 — «в разработке»; без
 *     ошибок консоли.
 *
 * Данные заводит сам и в конце убирает. Пробные ключи DataForSEO и ИИ
 * заводятся, только если на локальной базе своих нет, — иначе эти проверки
 * пропускаются, чтобы не стереть настоящие.
 *
 *   sg docker -c "node check-admin-purchasing.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные). SHOTS=<папка> — скриншоты.
 */
import { execFileSync } from 'node:child_process'
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
const PROBE_AI_KEY = 'sk-ant-probe-purchasing-zq7x9w2k4m'
const SHOTS = process.env.SHOTS

// Пункты меню до группы «Умный закуп» (3.11.2026) — ни один не должен пропасть
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
const GROUP = ['/admin/suppliers', '/admin/demand', '/admin/ai', '/admin/restock']

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, поставщиков и пробные ключи')

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
const num = sql => Number(psql(sql))

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
    atThreshold: at.length,
    noSupplier: at.filter(p => !p.supplierId).length,
    suppliers: new Set(at.filter(p => p.supplierId).map(p => p.supplierId)).size,
    openOrders: num(`SELECT count(*) FROM public.supplier_orders WHERE status IN ('ordered', 'in_transit')`),
  }
}

const runIds = []
let probeCreds = false
let probeAiKey = false
let probeModel = false
let renamed = false

function cleanup() {
  if (runIds.length)
    psql(`DELETE FROM public.market_demand_runs WHERE id IN (${runIds.join(',')});`)
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
  const restock = await expectedRestock(adminToken)

  console.log('\n== маршрут')
  check((await api('/api/admin/purchasing', null)).status === 401, 'гость — 401')
  check((await api('/api/admin/purchasing', buyerToken)).status === 403, 'не-администратор — 403')
  const first = await api('/api/admin/purchasing', adminToken)
  check(first.status === 200, `администратору — 200${first.status === 200 ? '' : ` (${first.status} ${first.json?.message})`}`)
  check(first.json?.suppliers === nSuppliers && first.json?.channels?.total === nChannels && first.json?.demand?.topics === nTopics, `поставщики ${first.json?.suppliers}, каналы ${first.json?.channels?.total}, темы ${first.json?.demand?.topics} — как в базе`)
  check(JSON.stringify(first.json?.restock) === JSON.stringify(restock), `к закупке — как на «К закупке»: ${JSON.stringify(first.json?.restock)}`)
  check(first.json?.ai?.model === 'anthropic/claude-haiku-5-5' || hadAi, `модель по умолчанию — ${first.json?.ai?.model}`)

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
  const steps = page => page.evaluate(() => [...document.querySelectorAll('[data-testid=purchasing-steps] > li > [data-testid]')].map(el => ({
    id: el.dataset.testid.replace(/^step-/, ''),
    state: el.dataset.state,
    badge: el.querySelector('[data-testid=step-state]')?.textContent.trim(),
    facts: el.querySelector('[data-testid=step-facts]')?.textContent.trim() ?? '',
    next: el.querySelector('[data-testid=step-next]')?.textContent.trim() ?? '',
    href: el.querySelector('[data-testid=step-link]')?.getAttribute('href') ?? null,
  })))
  const stepOf = async (page, id) => (await steps(page)).find(s => s.id === id) ?? {}
  // База поменялась — страницу заново, как владелец по кнопке «Обновить»
  async function refreshHub(page) {
    const done = page.waitForResponse(r => r.url().includes('/api/admin/purchasing'), { timeout: 30000 })
    await page.getByRole('button', { name: 'Обновить', exact: true }).click()
    await done
    await page.waitForFunction(() => !document.querySelector('button .animate-spin'), null, { timeout: 30000 })
  }

  console.log('\n== страница, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  const all = await steps(page)
  check(all.map(s => s.id).join() === 'suppliers,demand,ai,digest,order', `пять шагов по порядку: ${all.map(s => s.id).join(', ')}`)
  check(all.map(s => s.href).join() === '/admin/suppliers,/admin/demand,/admin/ai,,/admin/restock', 'ссылки шагов — на их страницы, у сводки ссылки нет')
  const [sup, dem, ai, digest, order] = all
  const plural5 = n => (n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 1 : 2
  check(sup.facts.startsWith(`${nSuppliers} ${['поставщик', 'поставщика', 'поставщиков'][plural5(nSuppliers)]}`), `шаг 1 — поставщиков столько же, сколько в базе: «${sup.facts}»`)
  if (!nChannels)
    check(sup.state === 'action' && sup.facts.includes('каналов в Telegram нет') && /«Каналы в Telegram»/.test(sup.next), `шаг 1 без каналов — ждёт владельца, как добавить: «${sup.next}»`)
  check(dem.facts.startsWith(`${nTopics} тем`), `шаг 2 — тем столько же, сколько в базе: «${dem.facts}»`)
  if (!hadCreds && !hadRuns)
    check(dem.state === 'action' && dem.facts.includes('цифр ещё нет') && dem.facts.includes('ключ DataForSEO не задан') && /\$0,18/.test(dem.next), `шаг 2 без ключа — ждёт владельца, с ценой: «${dem.next}»`)
  if (!hadAi)
    check(ai.state === 'action' && ai.facts === 'ключа ИИ нет', `шаг 3 без ключа — ждёт владельца: «${ai.next}»`)
  check(digest.state === 'later' && digest.badge === 'В разработке' && digest.next === 'Появится, когда заработают шаги 1–3.', 'шаг 4, сводка — «В разработке», когда появится')
  const withSupplier = restock.atThreshold - restock.noSupplier
  const orderState = (withSupplier || restock.noSupplier) ? 'action' : restock.openOrders ? 'running' : 'done'
  check(order.state === orderState, `шаг 5 — «${order.badge}», как по остаткам: ${withSupplier} у поставщиков, ${restock.noSupplier} без поставщика`)
  check(!withSupplier || order.facts.includes(`к закупке ${withSupplier} `), `шаг 5 — к закупке ${withSupplier}: «${order.facts}»`)
  check(!restock.noSupplier || order.facts.includes(`${restock.noSupplier} ${['товар', 'товара', 'товаров'][plural5(restock.noSupplier)]} без поставщика`), `шаг 5 — без поставщика ${restock.noSupplier}`)
  const waitingNow = all.flatMap((s, i) => s.state === 'action' ? [i + 1] : [])
  const waitingLine = await page.locator('[data-testid=purchasing-waiting]').innerText()
  check(waitingNow.every(n => waitingLine.includes(String(n))) && (waitingNow.length ? /^Сейчас от вас нужно: шаги? /.test(waitingLine) : waitingLine === 'Сейчас от вас ничего не нужно.'), `строка сверху: «${waitingLine}»`)
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/purchasing-1366.png`, fullPage: true })

  console.log('\n== меню')
  const navHrefs = await page.locator('aside nav a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(navHrefs.length === new Set(navHrefs).size, `пункты меню не задвоились (${navHrefs.length})`)
  check(OLD_LINKS.every(h => navHrefs.includes(h)) && navHrefs.length === OLD_LINKS.length + 1, 'все прежние пункты на месте, новый один — «Умный закуп»')
  const groupHrefs = await page.locator('aside [data-testid=nav-group] a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(groupHrefs.join() === GROUP.join(), `в группе «Умный закуп» — четыре страницы по шагам: ${groupHrefs.join(', ')}`)
  const parent = page.locator('aside nav a[href="/admin/purchasing"]')
  check((await parent.innerText()).trim() === 'Умный закуп' && /\bbg-muted\b/.test(await parent.getAttribute('class')), 'на «Умном закупе» он подсвечен в меню')
  await page.locator('aside [data-testid=nav-group] a[href="/admin/restock"]').click()
  await page.waitForURL('**/admin/restock', { timeout: 30000 })
  await page.waitForLoadState('networkidle')
  const child = page.locator('aside [data-testid=nav-group] a[href="/admin/restock"]')
  const parentClass = await parent.getAttribute('class')
  check(/\bbg-muted\b/.test(await child.getAttribute('class')) && /\btext-primary\b/.test(parentClass) && !/\bbg-muted\b/.test(parentClass), 'на «К закупке» подсвечен шаг, а группа — цветом')
  await openHub(page)
  await page.locator('[data-testid=step-ai] [data-testid=step-link]').click()
  await page.waitForURL('**/admin/ai', { timeout: 30000 })
  check(new URL(page.url()).pathname === '/admin/ai', 'кнопка шага «Модели ИИ» открывает /admin/ai')
  await openHub(page)

  console.log('\n== шаги вслед за базой')
  const supplierId = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER}') RETURNING id;`)
  psql(`
INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview) VALUES (:'s', 'probe_purchasing_open', 'Проверка — открытый', 'channel', true);
INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type) VALUES (:'s', 'ProbePurchasing_123', 'Проверка — закрытый', 'channel');
`, { s: supplierId })
  await refreshHub(page)
  const sup2 = await stepOf(page, 'suppliers')
  const nSup2 = nSuppliers + 1
  check(sup2.state === 'done' && sup2.badge === 'Готово', 'каналы есть — шаг 1 «Готово»')
  if (!nChannels) {
    check(sup2.facts === `${nSup2} ${['поставщик', 'поставщика', 'поставщиков'][plural5(nSup2)]} · 2 канала в Telegram — у 1 из ${nSup2} ${['поставщика', 'поставщиков', 'поставщиков'][plural5(nSup2)]} · через аккаунт: 1`, `сколько каналов, у скольких поставщиков, сколько через аккаунт: «${sup2.facts}»`)
  }
  check(/через аккаунт Telegram/.test(sup2.next), `про закрытый канал — читать через аккаунт: «${sup2.next}»`)

  runIds.push(psql(`INSERT INTO public.market_demand_runs (kind, status, requested_at) VALUES ('volumes', 'pending', '2026-11-03T05:00:00Z') RETURNING id;`))
  await refreshHub(page)
  const dem2 = await stepOf(page, 'demand')
  check(dem2.state === 'running' && dem2.badge === 'Идёт', `обновление спроса запрошено — шаг 2 «Идёт»: «${dem2.next}»`)

  if (!hadCreds) {
    psql(`SELECT public.market_demand_credentials_set('${PROBE_LOGIN}', 'probe-password-1234', :'a');`, { a: adminId })
    probeCreds = true
  }
  psql(`UPDATE public.market_demand_runs SET status = 'failed', error = 'Проверка умного закупа', finished_at = '2026-11-03T05:01:00Z' WHERE id = ${runIds[0]};`)
  await refreshHub(page)
  const dem3 = await stepOf(page, 'demand')
  check(dem3.state === 'action' && /не удалось/.test(dem3.next) && !dem3.facts.includes('ключ DataForSEO не задан'), `ключ задан, обновление не удалось — ждёт владельца: «${dem3.next}»`)
  const withKey = await api('/api/admin/purchasing', adminToken)
  check(withKey.json?.demand?.hasKey === true && !JSON.stringify(withKey.json).includes(PROBE_LOGIN) && !/login|last4|password/i.test(JSON.stringify(withKey.json)), 'ключ DataForSEO — только «задан», без логина и последних знаков')

  runIds.push(psql(`INSERT INTO public.market_demand_runs (kind, status, items, requested_at, finished_at) VALUES ('volumes', 'done', 10, '2026-11-02T20:00:00Z', '2026-11-02T20:30:00Z') RETURNING id;`))
  await refreshHub(page)
  const dem4 = await stepOf(page, 'demand')
  check(dem4.state === 'done' && dem4.facts.includes('обновлено 3 ноября') && /5-го числа/.test(dem4.next), `обновление пришло — «Готово», дата по Алматы: «${dem4.facts}»`)

  if (!hadAi) {
    psql(`SELECT public.ai_key_set('anthropic', '${PROBE_AI_KEY}', :'a');`, { a: adminId })
    probeAiKey = true
    await refreshHub(page)
    const ai2 = await stepOf(page, 'ai')
    check(ai2.state === 'later' && ai2.facts === 'ключ: Anthropic (Claude) · модель: claude-haiku-5-5' && ai2.next.startsWith('Ключ есть'), `ключ ИИ задан — дальше разработка: «${ai2.facts}»`)
    const aiJson = JSON.stringify((await api('/api/admin/purchasing', adminToken)).json)
    check(!aiJson.includes('probe') && !aiJson.includes(PROBE_AI_KEY.slice(-4)), 'ключ ИИ в ответе не виден ни знаком')
    psql(`INSERT INTO public.ai_settings (key, value) VALUES ('supplier_vision_model', '"openai/gpt-6.1-terra"');`)
    probeModel = true
    await refreshHub(page)
    const ai3 = await stepOf(page, 'ai')
    check(ai3.state === 'action' && ai3.facts.includes('модель: gpt-6.1-terra') && /нет ключа/.test(ai3.next), `модель без ключа своего провайдера — ждёт владельца: «${ai3.next}»`)
  }
  else {
    console.log('  --   ключ ИИ: на локальной базе уже есть свой — проверки ключа пропущены')
  }
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/purchasing-1366-changed.png`, fullPage: true })

  console.log('\n== телефон 390 px')
  const mobile = await newPage({ width: 390, height: 844 })
  const tab = mobile.locator('div.fixed.bottom-0 nav a', { hasText: 'Закупки' })
  check(await tab.getAttribute('href') === '/admin/purchasing', 'вкладка «Закупки» ведёт на «Умный закуп»')
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'без горизонтальной прокрутки')
  const cardsFit = await mobile.evaluate(() => [...document.querySelectorAll('[data-testid=purchasing-steps] > li')].every(li => li.getBoundingClientRect().right <= window.innerWidth))
  check(cardsFit, 'карточки шагов не вылезают за край')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/purchasing-390.png`, fullPage: true })
  await mobile.getByRole('button', { name: 'Меню' }).click()
  const sheet = mobile.getByRole('dialog')
  await sheet.waitFor()
  const sheetGroup = await sheet.locator('[data-testid=nav-group] a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(sheetGroup.join() === GROUP.join(), 'в мобильном меню — та же группа из четырёх страниц')
  await sheet.locator('[data-testid=nav-group] a[href="/admin/suppliers"]').click()
  await mobile.waitForURL('**/admin/suppliers', { timeout: 30000 })
  await mobile.waitForLoadState('networkidle')
  check(/\btext-primary\b/.test(await tab.getAttribute('class')), 'на «Поставщиках» вкладка «Закупки» горит')
  await mobile.context().close()

  console.log('\n== без миграции каналов')
  psql(`ALTER TABLE public.supplier_channels RENAME TO supplier_channels_check_off; NOTIFY pgrst, 'reload schema';`)
  renamed = true
  await new Promise(r => setTimeout(r, 1500))
  const off = await api('/api/admin/purchasing', adminToken)
  check(off.status === 200 && off.json?.channels === null && off.json?.demand !== null, 'маршрут без таблицы каналов — channels: null, не 500')
  await refreshHub(page)
  const sup3 = await stepOf(page, 'suppliers')
  check(sup3.state === 'later' && sup3.next === 'Заработает после миграции базы.', 'шаг 1 — «В разработке», после миграции')
  psql(`ALTER TABLE public.supplier_channels_check_off RENAME TO supplier_channels; NOTIFY pgrst, 'reload schema';`)
  renamed = false
  await page.context().close()

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
finally {
  await browser.close()
  if (renamed)
    psql(`ALTER TABLE public.supplier_channels_check_off RENAME TO supplier_channels; NOTIFY pgrst, 'reload schema';`)
  cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

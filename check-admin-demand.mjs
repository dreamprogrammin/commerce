/*
 * «Спрос на рынке» в админке (1.11.2026) — только ЛОКАЛЬНЫЙ стенд с
 * заглушкой DataForSEO.
 *
 * Владелец: «нужно искать, что в рынке актуально, чтобы мы отбирали товар от
 * поставщиков в тг тот товар, который нужен». Страница показывает спрос по
 * темам (DataForSEO, Google Ads, Казахстан) и новые запросы на рынке.
 *
 * Заглушка DataForSEO поднимается здесь же на :8789 и проверяет логин и
 * пароль. До неё дотягиваются оба, кто ходит в DataForSEO:
 *   • сервер админки (проверка ключа, баланс) — стенд запущен с
 *     DATAFORSEO_STUB_URL=http://localhost:8789;
 *   • база (pg_net, само обновление) — сессиям PostgREST на время прогона
 *     ставится app.market_demand_api = http://host.docker.internal:8789, и
 *     контейнер PostgREST перезапускается, чтобы новые соединения её взяли.
 *
 * Проверяет:
 *  1) доступ: гость 401, покупатель 403 — и к чтению, и к платному обновлению;
 *  2) неверный ключ — отказ, в базу не ложится; верный — сохранён, видны
 *     логин, 4 знака и баланс;
 *  3) «Обновить сейчас» — подтверждение с ценой и балансом; в DataForSEO ушли
 *     ровно два запроса с ключом из Vault (Казахстан, русский, 24 месяца,
 *     фразы активных тем); страница сама дождалась ответа;
 *  4) темы: цифры как в market_demand_summary, фильтры «у нас нет» / «скоро
 *     сезон» совпадают с базой;
 *  5) новые запросы: без покрытых темами, мусора, общих и редких; «Скрыть»;
 *     «Сделать темой» — тема с цифрами, запрос из списка ушёл;
 *  6) окно темы: эмодзи во фразе — понятный отказ; правка фраз; «Отслеживать»
 *     выкл.; удаление в два нажатия; удаление ключа в два нажатия;
 *  7) 390 px без горизонтальной прокрутки; без ошибок консоли и чужих 4xx/5xx.
 * В конце всё возвращается: темы, ключ, запуски, настройка PostgREST, пользователи.
 *
 *   node check-admin-demand.mjs --base=http://localhost:3141
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import os from 'node:os'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
const REST_CONTAINER = 'supabase_rest_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const STUB_PORT = 8789
const STUB_LOGIN = 'stub_api_login'
const STUB_PASSWORD = 'stub_api_password_42'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж меняет настройки базы и пишет в неё')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

function psql(sql, vars = {}) {
  const args = ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1']
  for (const [k, v] of Object.entries(vars))
    args.push('-v', `${k}=${v}`)
  return execFileSync('docker', args, { input: sql, encoding: 'utf8' }).trim()
}
/*
 * Настройку для сессий PostgREST (роль authenticator) ставит только
 * суперпользователь — локальный supabase_admin (пароль локального стенда).
 * Через контейнер: psql на самой машине есть не везде (на WSL его нет).
 */
function psqlSuper(sql) {
  return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', DB_CONTAINER, 'psql', '-w', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }).trim()
}
const serviceHeaders = { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
async function rpc(name, body = {}) {
  const res = await fetch(`${SUPA}/rest/v1/rpc/${name}`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify(body) })
  if (!res.ok)
    throw new Error(`RPC ${name}: ${res.status} ${await res.text()}`)
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
async function api(path, token, method = 'GET') {
  const res = await fetch(`${BASE}${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} })
  return res.status
}

// ── Заглушка DataForSEO ─────────────────────────────────────────────────────
const stubLog = []
const hash = s => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7)
function monthsBack(n) {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1 - i, 1))
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  })
}
// Объёмы фразы: база по хешу, пик в одном месяце, тренд последних 3 месяцев
function volumeItem(keyword, months) {
  const h = hash(keyword)
  const base = 100 + (h % 3000)
  const peak = (h % 12) + 1
  const growth = [1.6, 0.6, 1][h % 3]
  const monthly = monthsBack(months).map((m, i) => ({
    ...m,
    search_volume: Math.round(base * (m.month === peak ? 2.5 : 1) * (i < 3 ? growth : 1)),
  }))
  return { keyword, search_volume: monthly[0].search_volume, competition: 'LOW', competition_index: h % 100, cpc: (h % 50) / 100, monthly_searches: monthly }
}
const IDEAS = [
  ['кукла монстер', 400, 1600],
  ['пазлы 1000 деталей', 600, 600],
  ['мягкая игрушка акула', 450, 450],
  ['сквиш антистресс', 300, 300],
  ['лабубу купить', 9000, 3000],
  ['конструктор майнкрафт', 700, 700],
  ['раскраска лол', 1000, 1000],
  ['игрушки для девочек 8 9 лет', 2000, 2000],
  ['игрушка бегемот', 30, 30],
]
function ideaItem([keyword, base, last]) {
  const monthly = monthsBack(12).map((m, i) => ({ ...m, search_volume: i < 3 ? last : base }))
  return { keyword, search_volume: monthly[0].search_volume, competition: 'LOW', competition_index: 5, cpc: 0.05, monthly_searches: monthly }
}
const reply = result => ({ version: '0.1', status_code: 20000, status_message: 'Ok.', cost: 0.09, tasks_count: 1, tasks_error: 0, tasks: [{ id: 'stub', status_code: 20000, status_message: 'Ok.', cost: 0.09, result_count: result.length, result }] })

const stub = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => raw += c)
  req.on('end', () => {
    const auth = req.headers.authorization ?? ''
    const good = auth === `Basic ${Buffer.from(`${STUB_LOGIN}:${STUB_PASSWORD}`).toString('base64')}`
    let body = null
    try {
      body = raw ? JSON.parse(raw) : null
    }
    catch {}
    stubLog.push({ method: req.method, url: req.url, auth, good, body })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/ping')
      return res.end('{"pong":true}')
    if (!good) {
      res.statusCode = 401
      return res.end(JSON.stringify({ status_code: 40100, status_message: 'You are not authorized.', cost: 0, tasks: [] }))
    }
    if (req.url === '/v3/appendix/user_data')
      return res.end(JSON.stringify(reply([{ login: STUB_LOGIN, money: { total: 1, balance: 0.6412 } }])))
    if (req.url === '/v3/keywords_data/google_ads/search_volume/live') {
      const task = body?.[0] ?? {}
      return res.end(JSON.stringify(reply((task.keywords ?? []).map(k => volumeItem(k, 24)))))
    }
    if (req.url === '/v3/keywords_data/google_ads/keywords_for_keywords/live')
      return res.end(JSON.stringify(reply(IDEAS.map(ideaItem))))
    res.statusCode = 404
    res.end('{}')
  })
})

/*
 * База зовёт заглушку по host.docker.internal. Под WSL с Docker Desktop это
 * имя ведёт в Windows, а заглушка живёт в WSL — не достучаться. Зато адрес
 * самого WSL (eth0) из контейнера виден: тогда на время прогона имя в
 * /etc/hosts контейнера базы указывает туда, в конце файл возвращается.
 * pg_net держит адреса в кеше libcurl до минуты — отсюда долгий повтор.
 */
let hostsBackup = null
async function stubPing(host, seconds) {
  const until = Date.now() + seconds * 1000
  while (Date.now() < until) {
    const id = psql(`SELECT net.http_get('http://${host}:${STUB_PORT}/ping')`)
    for (let i = 0; i < 10; i++) {
      await sleep(500)
      const row = psql(`SELECT coalesce(status_code, 0) FROM net._http_response WHERE id = ${id}`)
      if (row === '200')
        return true
      if (row)
        break
    }
    await sleep(2000)
  }
  return false
}
async function reachStub() {
  if (await stubPing('host.docker.internal', 5))
    return
  const wsl = os.networkInterfaces().eth0?.find(a => a.family === 'IPv4')?.address
  if (!wsl || !(await stubPing(wsl, 5)))
    throw new Error('база не достучалась до заглушки ни через host.docker.internal, ни по адресу WSL')
  hostsBackup = execFileSync('docker', ['exec', DB_CONTAINER, 'cat', '/etc/hosts'], { encoding: 'utf8' })
  const lines = hostsBackup.replace(/\n$/, '').split('\n').filter(l => !/\shost\.docker\.internal\s*$/.test(l))
  // `cat >`, а не sed -i: /etc/hosts в контейнере смонтирован файлом, менять его inode нельзя
  execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'sh', '-c', 'cat > /etc/hosts'], { input: `${[...lines, `${wsl}\thost.docker.internal`].join('\n')}\n` })
  if (!(await stubPing('host.docker.internal', 90)))
    throw new Error(`база не достучалась до заглушки и после подмены host.docker.internal на ${wsl}`)
}
function restoreHosts() {
  if (hostsBackup)
    execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'sh', '-c', 'cat > /etc/hosts'], { input: hostsBackup })
}

// ── Подготовка ──────────────────────────────────────────────────────────────
const stamp = Date.now()
const emails = { admin: `demand-admin-${stamp}@example.test`, buyer: `demand-buyer-${stamp}@example.test` }
const users = []
let topicsBackup = null
let restSet = false

async function restartRest() {
  execFileSync('docker', ['restart', REST_CONTAINER], { encoding: 'utf8' })
  for (let i = 0; i < 60; i++) {
    const ok = await fetch(`${SUPA}/rest/v1/market_demand_topics?select=id&limit=1`, { headers: serviceHeaders }).then(r => r.ok).catch(() => false)
    if (ok)
      return
    await sleep(1000)
  }
  throw new Error('PostgREST не поднялся после перезапуска')
}

const browser = await chromium.launch()
const errors = []
const failed = []
try {
  await new Promise(r => stub.listen(STUB_PORT, r))

  // База видит заглушку? (pg_net из контейнера → host.docker.internal)
  await reachStub()

  topicsBackup = psql(`SELECT coalesce(json_agg(t), '[]')::text FROM public.market_demand_topics t`)
  psql(`
DELETE FROM public.market_demand_runs; DELETE FROM public.market_demand_candidates;
DELETE FROM public.market_demand_monthly; DELETE FROM public.market_demand_keywords;
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';`)
  restSet = true
  psqlSuper(`ALTER ROLE authenticator IN DATABASE postgres SET app.market_demand_api = 'http://host.docker.internal:${STUB_PORT}';`)
  await restartRest()

  const adminId = await createUser(emails.admin)
  users.push(adminId)
  users.push(await createUser(emails.buyer))
  psql(`
SELECT tgname AS t FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"t";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"t";
COMMIT;`, { admin: adminId })

  console.log('\n== доступ')
  const buyerToken = await tokenFor(emails.buyer)
  check(await api('/api/admin/demand') === 401, 'гость: чтение — 401')
  check(await api('/api/admin/demand', buyerToken) === 403, 'покупатель: чтение — 403')
  check(await api('/api/admin/demand/refresh', buyerToken, 'POST') === 403, 'покупатель: платное обновление — 403')
  check(await api('/api/admin/demand/credentials', buyerToken, 'DELETE') === 403, 'покупатель: удалить ключ — 403')

  // ── Браузер ───────────────────────────────────────────────────────────────
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      const u = r.url()
      // Свои ожидаемые отказы — неверный ключ и эмодзи во фразе — 400
      if (r.status() >= 400 && !/\/_payload\.json/.test(u) && !(r.status() === 400 && /\/api\/admin\/demand\/(?:credentials|topics)/.test(u)))
        failed.push(`${r.status()} ${u.replace(BASE, '')}`)
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
    await page.goto(`${BASE}/admin/demand`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
    await page.locator('[data-testid=demand-key-status]').waitFor({ timeout: 30000 })
    return page
  }
  // Тостов на экране бывает несколько, и порядок у sonner не по времени — ищем по тексту
  const toastWith = (page, text) => page.locator('[data-sonner-toast]', { hasText: text })
  const secretCount = () => psql(`SELECT count(*) FROM vault.secrets WHERE name = 'dataforseo_credentials'`)

  console.log('\n== ключ, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  const keyStatus = page.locator('[data-testid=demand-key-status]')
  check((await keyStatus.innerText()).includes('ключ не задан'), 'ключа нет — так и написано')
  check(await page.getByTestId('demand-refresh').isDisabled(), 'без ключа «Обновить сейчас» выключена')
  const topicsTotal = Number(psql('SELECT count(*) FROM public.market_demand_topics'))
  check(await page.locator('[data-testid=demand-topic]').count() === topicsTotal, `все темы на месте (${topicsTotal})`)
  check(await page.getByText('Цифр пока нет').isVisible(), 'цифр нет — подсказка, что делать')

  await page.getByLabel('Логин API DataForSEO').fill('wrong_login')
  await page.getByLabel('Пароль API DataForSEO').fill('wrong_password_1')
  await page.getByTestId('demand-key-form').getByRole('button', { name: 'Проверить и сохранить' }).click()
  check(await toastWith(page, 'не принял').waitFor({ timeout: 15000 }).then(() => true, () => false), 'неверный ключ — «DataForSEO не принял логин и пароль API»')
  check(secretCount() === '0', 'неверный ключ в базу не лёг')

  await page.getByLabel('Логин API DataForSEO').fill(STUB_LOGIN)
  await page.getByLabel('Пароль API DataForSEO').fill(STUB_PASSWORD)
  await page.getByTestId('demand-key-form').getByRole('button', { name: 'Проверить и сохранить' }).click()
  await keyStatus.getByText('ключ задан').waitFor({ timeout: 15000 })
  const statusText = await keyStatus.innerText()
  check(statusText.includes(STUB_LOGIN) && statusText.includes('••••d_42') && statusText.includes('$0,64'), 'верный ключ: логин, 4 последних знака пароля и баланс $0,64')
  check(secretCount() === '1' && !statusText.includes(STUB_PASSWORD), 'ключ в Vault, пароль на страницу не вернулся')

  console.log('\n== платное обновление')
  const before = stubLog.length
  await page.getByTestId('demand-refresh').click()
  const dialog = page.getByRole('alertdialog')
  await dialog.waitFor({ timeout: 10000 })
  const dialogText = await dialog.innerText()
  check(dialogText.includes('$0,18') && dialogText.includes('$0,64'), 'подтверждение: цена ≈ $0,18 и баланс до нажатия')
  await page.getByTestId('demand-refresh-confirm').click()
  await page.getByText('Идёт обновление').waitFor({ timeout: 15000 }).catch(() => {})
  // pg_net иногда отдаёт ответ через минуты (до 6 при обычных секундах) — ждём до
  // 8; ошибка разбора на странице — сразу провал, а не 8 минут ожидания
  const t0 = Date.now()
  const outcome = await Promise.race([
    page.locator('[data-testid=demand-run-status]', { hasText: 'Обновлено' }).waitFor({ timeout: 8 * 60_000 }).then(() => 'ok'),
    page.locator('[data-testid=demand-collect-error]').waitFor({ timeout: 8 * 60_000 }).then(async () => page.locator('[data-testid=demand-collect-error]').innerText()),
  ])
  check(outcome === 'ok', `страница сама дождалась ответа DataForSEO (${Math.round((Date.now() - t0) / 1000)} с)${outcome === 'ok' ? '' : ` — ${outcome}`}`)
  if (outcome !== 'ok')
    throw new Error('ответ не разобран — дальше проверять нечего')

  const sent = stubLog.slice(before).filter(r => r.method === 'POST')
  const volumes = sent.find(r => r.url.endsWith('/search_volume/live'))
  const ideas = sent.find(r => r.url.endsWith('/keywords_for_keywords/live'))
  check(sent.length === 2 && volumes?.good && ideas?.good, 'в DataForSEO ушло ровно два запроса, оба с ключом из Vault')
  const activeKeywords = JSON.parse(psql(`SELECT json_agg(DISTINCT k ORDER BY k) FROM public.market_demand_topics t, unnest(t.keywords) k WHERE t.is_active`))
  const firstOfMonth = (() => {
    const d = new Date()
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 24, 1))
    return m.toISOString().slice(0, 10)
  })()
  const v = volumes?.body?.[0] ?? {}
  check(v.location_code === 2398 && v.language_code === 'ru' && v.date_from === firstOfMonth
    && JSON.stringify([...v.keywords].sort()) === JSON.stringify([...activeKeywords].sort()), `объёмы: Казахстан, русский, с ${firstOfMonth}, все ${activeKeywords.length} фраз активных тем`)
  check(ideas?.body?.[0]?.location_code === 2398 && ideas.body[0].keywords.length <= 20, 'похожие: Казахстан, до 20 затравок')

  console.log('\n== темы')
  const summary = await rpc('market_demand_summary')
  const tolokar = summary.find(t => t.name === 'Толокар')
  const row = page.locator('[data-testid=demand-topic]', { hasText: 'Толокар' }).first()
  const rowText = (await row.innerText()).replace(/\s+/g, ' ')
  check(rowText.includes(tolokar.volume_avg3.toLocaleString('ru-RU').replace(/\s/g, ' ')) && rowText.includes('в мес.'), `толокар: ${tolokar.volume_avg3} в месяц — как в сводке базы`)
  check(await row.locator('svg polyline').count() === 1, 'у темы мини-график за 2 года')
  const first = await page.locator('[data-testid=demand-topic]').first().innerText()
  const top = summary.filter(t => t.is_active && t.volume_avg3 != null).sort((a, b) => b.volume_avg3 - a.volume_avg3)[0]
  check(first.includes(top.name), `сверху — самый большой спрос («${top.name}»)`)

  const missing = summary.filter(t => t.is_active && t.our_total === 0 && (t.volume_avg3 ?? 0) > 0).length
  await page.getByTestId('demand-filter-missing').click()
  check(await page.locator('[data-testid=demand-topic]').count() === missing && missing > 0, `«Ищут, а у нас нет» — ${missing}, как в базе`)
  const season = summary.filter(t => t.is_active && t.season_soon).length
  await page.getByTestId('demand-filter-season').click()
  check(await page.locator('[data-testid=demand-topic]').count() === season, `«Скоро сезон» — ${season}, как в базе`)
  await page.getByTestId('demand-filter-all').click()

  console.log('\n== новые запросы')
  const candidates = await page.locator('[data-testid=demand-candidate]').allInnerTexts()
  const has = k => candidates.some(c => c.startsWith(k))
  check(has('кукла монстер') && has('мягкая игрушка акула') && has('пазлы 1000 деталей'), 'новое на рынке — в списке')
  check(!has('лабубу купить') && !has('конструктор майнкрафт') && !has('раскраска лол') && !has('игрушки для девочек') && !has('игрушка бегемот'), 'без покрытого темами, мусора, общего и редкого')
  check(candidates[0].startsWith('кукла монстер') && candidates[0].includes('+300%'), 'сверху — самый ходовой, рост +300% виден')

  await page.locator('[data-testid=demand-candidate]', { hasText: 'мягкая игрушка акула' }).getByRole('button', { name: 'Скрыть' }).click()
  await page.locator('[data-testid=demand-candidate]', { hasText: 'мягкая игрушка акула' }).waitFor({ state: 'detached', timeout: 15000 })
  check(psql(`SELECT status FROM public.market_demand_candidates WHERE keyword = 'мягкая игрушка акула'`) === 'dismissed', '«Скрыть» — запрос скрыт и в базе')

  await page.locator('[data-testid=demand-candidate]', { hasText: 'кукла монстер' }).getByRole('button', { name: 'Сделать темой' }).click()
  const editor = page.getByRole('dialog')
  await editor.waitFor({ timeout: 10000 })
  check(await page.locator('#topic-name').inputValue() === 'Кукла монстер' && await page.locator('#topic-keywords').inputValue() === 'кукла монстер', 'окно темы заполнено из запроса')
  await page.locator('#topic-kind').selectOption('franchise')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  await page.locator('[data-testid=demand-candidate]', { hasText: 'кукла монстер' }).waitFor({ state: 'detached', timeout: 15000 })
  const created = JSON.parse(psql(`SELECT row_to_json(t) FROM public.market_demand_topics t WHERE name = 'Кукла монстер'`) || 'null')
  check(created?.kind === 'franchise' && created.keywords.join() === 'кукла монстер'
    && psql(`SELECT status FROM public.market_demand_candidates WHERE keyword = 'кукла монстер'`) === 'added', '«Сделать темой»: тема заведена, запрос помечен и из списка ушёл')
  await page.getByLabel('Найти тему').fill('монстер')
  const newRow = page.locator('[data-testid=demand-topic]', { hasText: 'Кукла монстер' })
  check((await newRow.innerText()).includes('в мес.') && await newRow.locator('svg polyline').count() === 1, 'у новой темы сразу цифры за 12 месяцев — без доплаты')

  console.log('\n== окно темы')
  await newRow.getByRole('button', { name: /Изменить тему/ }).click()
  await editor.waitFor({ timeout: 10000 })
  await page.locator('#topic-keywords').fill('кукла монстер\nкукла 🎎')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  check(await toastWith(page, 'только буквы').waitFor({ timeout: 10000 }).then(() => true, () => false) && await editor.isVisible(), 'эмодзи во фразе — понятный отказ, окно не закрылось')
  await page.locator('#topic-keywords').fill('кукла монстер\nmonster doll')
  await page.locator('#topic-active').click()
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  const edited = JSON.parse(psql(`SELECT row_to_json(t) FROM public.market_demand_topics t WHERE name = 'Кукла монстер'`))
  check(edited.keywords.join('|') === 'кукла монстер|monster doll' && edited.is_active === false, 'правка: фразы сохранены, «Отслеживать» выключено')
  check((await newRow.innerText()).includes('не отслеживается'), 'на странице — «не отслеживается»')

  await newRow.getByRole('button', { name: /Изменить тему/ }).click()
  await editor.waitFor({ timeout: 10000 })
  await editor.getByRole('button', { name: 'Удалить тему' }).click()
  check(await editor.getByRole('button', { name: 'Точно удалить?' }).isVisible() && psql(`SELECT count(*) FROM public.market_demand_topics WHERE name = 'Кукла монстер'`) === '1', 'первое нажатие только спрашивает')
  await editor.getByRole('button', { name: 'Точно удалить?' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  check(psql(`SELECT count(*) FROM public.market_demand_topics WHERE name = 'Кукла монстер'`) === '0', 'второе — удаляет')
  await page.getByLabel('Найти тему').fill('')

  console.log('\n== удаление ключа')
  await keyStatus.getByRole('button', { name: 'Удалить', exact: true }).click()
  check(secretCount() === '1', 'первое нажатие только спрашивает')
  await keyStatus.getByRole('button', { name: 'Точно удалить?' }).click()
  await keyStatus.getByText('ключ не задан').waitFor({ timeout: 15000 })
  check(secretCount() === '0', 'второе — ключ удалён из Vault')

  console.log('\n== 390 px')
  const phone = await newPage({ width: 390, height: 844 })
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'страница без горизонтальной прокрутки')
  await phone.locator('[data-testid=demand-topic]').first().getByRole('button', { name: /Изменить тему/ }).click()
  const phoneDialog = phone.getByRole('dialog')
  await phoneDialog.waitFor({ timeout: 10000 })
  const box = await phoneDialog.boundingBox()
  check(box && box.x >= 0 && box.x + box.width <= 390, 'окно темы влезает в экран')
  if (process.env.SHOTS) {
    await phone.keyboard.press('Escape')
    await phoneDialog.waitFor({ state: 'hidden', timeout: 10000 })
    await phone.locator('[data-testid=demand-topic]').first().scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${process.env.SHOTS}/demand-390-topics.png` })
    await phone.locator('[data-testid=demand-candidate]').first().scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${process.env.SHOTS}/demand-390-candidates.png` })
    await page.screenshot({ path: `${process.env.SHOTS}/demand-1366.png` })
  }

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без чужих ответов 4xx/5xx${failed.length ? ` — ${failed.slice(0, 3).join(', ')}` : ''}`)
}
finally {
  await browser.close()
  stub.close()
  try {
    restoreHosts()
  }
  catch (e) {
    console.error('/etc/hosts базы не вернулся:', e.message)
    fails.push('уборка /etc/hosts')
  }
  // Всё назад: темы, данные спроса, ключ, настройка PostgREST, пользователи
  try {
    if (topicsBackup) {
      psql(`
BEGIN;
DELETE FROM public.market_demand_runs; DELETE FROM public.market_demand_candidates;
DELETE FROM public.market_demand_monthly; DELETE FROM public.market_demand_keywords;
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
DELETE FROM public.market_demand_topics;
INSERT INTO public.market_demand_topics SELECT * FROM json_populate_recordset(NULL::public.market_demand_topics, :'backup'::json);
COMMIT;`, { backup: topicsBackup })
    }
    if (restSet) {
      psqlSuper(`ALTER ROLE authenticator IN DATABASE postgres RESET app.market_demand_api;`)
      await restartRest()
    }
  }
  catch (e) {
    console.error('уборка не удалась:', e.message)
    fails.push('уборка')
  }
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

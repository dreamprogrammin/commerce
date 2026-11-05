/*
 * Вордстат в «Спросе на рынке» (2.11.2026) — только ЛОКАЛЬНЫЙ стенд с
 * заглушкой Wordstat API (Yandex Cloud Search API).
 *
 * Владелец: «оставляем DataForSEO на пробном балансе и еще подключаем туда
 * яндекс». Ключ Yandex Cloud задаётся на странице, числа по темам база
 * спрашивает сама (pg_net, тик в pg_cron раз в 30 с, не больше 5 запросов в
 * полёте и 95 в час), страница только смотрит.
 *
 * Заглушка поднимается здесь же на :8791 и проверяет ключ. До неё дотягиваются
 * оба, кто ходит в Вордстат:
 *   • сервер админки (проверка ключа, дерево регионов) — стенд запущен с
 *     WORDSTAT_STUB_URL=http://localhost:8791;
 *   • база (pg_net, само обновление) — сессиям PostgREST на время прогона
 *     ставится app.market_demand_yandex_api = http://host.docker.internal:8791;
 *     адрес запоминается в запуске, и тик из pg_cron ходит туда же.
 * Отслеживаются 7 тем из 92 — иначе обновление шло бы 10 минут; на «пазлы»
 * заглушка один раз отвечает 429 (квота), на фразу со словом «отказ» — 400.
 *
 * Проверяет:
 *  1) доступ: гость 401, покупатель 403 — чтение хода, обновление, ключ;
 *  2) неверный ключ и чужой каталог — понятный отказ, в базу не ложится;
 *     верный — каталог, 4 знака и регион «Казахстан» из дерева Вордстата;
 *  3) «Обновить Яндекс» — цена по числу фраз; в Вордстат ушли все фразы
 *     отслеживаемых тем с ключом из Vault (по месяцам, 24 месяца, Казахстан);
 *     квота — пауза и повтор; отказ фразы виден на странице; страница сама
 *     дождалась конца;
 *  4) темы: переключатель «Google | Яндекс», цифры как в
 *     market_demand_summary, порядок и фильтр «у нас нет» по Яндексу, число
 *     другого источника рядом;
 *  5) фраза для Вордстата в окне темы: эмодзи — отказ; своя фраза
 *     сохраняется строчными; повторное обновление спрашивает только её;
 *     пустая — снова по первой фразе;
 *  6) удаление ключа в два нажатия; 390 px без горизонтальной прокрутки;
 *     без ошибок консоли и чужих 4xx/5xx.
 * В конце всё возвращается: темы, данные Вордстата, ключ, тик, настройка
 * PostgREST, пользователи.
 *
 *   node check-admin-demand-yandex.mjs --base=http://localhost:3141
 */
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
const STUB_PORT = 8791
const STUB_KEY = 'AQVNstubWordstatKey00000000000xY7z'
const STUB_FOLDER = 'b1gstubfolder0000000'
// Темы прогона и что с ними делает заглушка
const TOPICS = ['Беговел', 'Кукла', 'Лабубу', 'Пазлы', 'Сквиш', 'Толокар', 'Юла']
const QUOTA_PHRASE = 'пазлы'
const REJECTED = 'юла отказ'

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
 * Через контейнер: psql на самой машине есть не везде.
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

// ── Заглушка Вордстата ──────────────────────────────────────────────────────
const stubLog = []
let quotaHit = false
const hash = s => [...s].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 7)
const REGIONS = [{
  id: '10000',
  label: 'Земля',
  children: [
    { id: '225', label: 'Россия', children: [{ id: '213', label: 'Москва' }] },
    { id: '159', label: 'Казахстан', children: [{ id: '162', label: 'Алматы' }, { id: '163', label: 'Астана' }] },
  ],
}]
/*
 * Ряд по месяцам с fromDate по ТЕКУЩИЙ (неполный — база его отбросит): база
 * по хешу фразы, пик в одном месяце, рост или спад последних трёх полных.
 * count — строкой, как в JSON protobuf; у «сквиш» в первом месяце count нет
 * вовсе (protobuf опускает ноль).
 */
function dynamics(phrase, fromDate) {
  const h = hash(phrase)
  const base = 100 + (h % 3000)
  const peak = (h % 12) + 1
  const growth = [1.6, 0.6, 1][h % 3]
  const from = new Date(fromDate)
  const now = new Date()
  const months = []
  for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= now; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)))
    months.push(d)
  return months.map((d, i) => {
    const back = months.length - 1 - i // 0 — текущий месяц
    const count = Math.round(base * (d.getUTCMonth() + 1 === peak ? 2.5 : 1) * (back >= 1 && back <= 3 ? growth : 1))
    const row = { date: d.toISOString().replace('.000Z', 'Z'), count: String(count), share: '0.000042' }
    if (phrase === 'сквиш' && i === 0)
      delete row.count
    return row
  })
}

const stub = http.createServer((req, res) => {
  let raw = ''
  req.on('data', c => raw += c)
  req.on('end', () => {
    let body = null
    try {
      body = raw ? JSON.parse(raw) : null
    }
    catch {}
    const good = req.headers.authorization === `Api-Key ${STUB_KEY}`
    stubLog.push({ at: Date.now(), method: req.method, url: req.url, good, body })
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/ping')
      return res.end('{"pong":true}')
    if (!good) {
      res.statusCode = 401
      return res.end(JSON.stringify({ code: 16, message: 'Unknown api key', details: [] }))
    }
    if (req.method === 'POST' && req.url === '/v2/wordstat/getRegionsTree') {
      if (body?.folderId !== STUB_FOLDER) {
        res.statusCode = 403
        return res.end(JSON.stringify({ code: 7, message: 'Permission denied', details: [] }))
      }
      return res.end(JSON.stringify({ regions: REGIONS }))
    }
    if (req.method === 'POST' && req.url === '/v2/wordstat/dynamics') {
      const phrase = body?.phrase ?? ''
      if (phrase.includes('отказ')) {
        res.statusCode = 400
        return res.end(JSON.stringify({ code: 3, message: 'Phrase is not valid', details: [] }))
      }
      if (phrase === QUOTA_PHRASE && !quotaHit) {
        quotaHit = true
        res.statusCode = 429
        res.setHeader('Retry-After', '30')
        return res.end(JSON.stringify({ code: 8, message: 'Quota exceeded', details: [] }))
      }
      return res.end(JSON.stringify({ results: dynamics(phrase, body.fromDate) }))
    }
    res.statusCode = 404
    res.end('{}')
  })
})
const dynamicsLog = () => stubLog.filter(r => r.method === 'POST' && r.url === '/v2/wordstat/dynamics')

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
const emails = { admin: `yandex-admin-${stamp}@example.test`, buyer: `yandex-buyer-${stamp}@example.test` }
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

const WIPE = `
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'Market Demand Yandex Tick';
DELETE FROM public.market_demand_yandex_runs WHERE true;
DELETE FROM public.market_demand_yandex_monthly WHERE true;
DELETE FROM vault.secrets WHERE name = 'wordstat_api_key';
DELETE FROM public.market_demand_monthly WHERE keyword = 'толокар';
DELETE FROM public.market_demand_keywords WHERE keyword = 'толокар';`

const browser = await chromium.launch()
const errors = []
const failed = []
try {
  await new Promise(r => stub.listen(STUB_PORT, r))

  // База видит заглушку? (pg_net из контейнера → host.docker.internal)
  await reachStub()

  topicsBackup = psql(`SELECT coalesce(json_agg(t), '[]')::text FROM public.market_demand_topics t`)
  psql(WIPE)
  psql(`
UPDATE public.market_demand_topics SET is_active = (name = ANY (string_to_array(:'topics', ','))) WHERE true;
UPDATE public.market_demand_topics SET yandex_phrase = :'rejected' WHERE name = 'Юла';
-- Google у «Толокара» — чтобы было видно число другого источника рядом
INSERT INTO public.market_demand_keywords (keyword, search_volume) VALUES ('толокар', 2400);
INSERT INTO public.market_demand_monthly (keyword, month, search_volume)
SELECT 'толокар', (date_trunc('month', now()) - make_interval(months => i))::date, 2000 + i * 10 FROM generate_series(1, 24) i;`, { topics: TOPICS.join(','), rejected: REJECTED })
  restSet = true
  psqlSuper(`ALTER ROLE authenticator IN DATABASE postgres SET app.market_demand_yandex_api = 'http://host.docker.internal:${STUB_PORT}';`)
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
  check(await api('/api/admin/demand/yandex') === 401, 'гость: ход обновления — 401')
  check(await api('/api/admin/demand/yandex', buyerToken) === 403, 'покупатель: ход обновления — 403')
  check(await api('/api/admin/demand/yandex/refresh', buyerToken, 'POST') === 403, 'покупатель: обновление — 403')
  check(await api('/api/admin/demand/yandex/key', buyerToken, 'POST') === 403, 'покупатель: задать ключ — 403')
  check(await api('/api/admin/demand/yandex/key', buyerToken, 'DELETE') === 403, 'покупатель: удалить ключ — 403')

  // ── Браузер ───────────────────────────────────────────────────────────────
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      const u = r.url()
      // Свои ожидаемые отказы — неверный ключ, чужой каталог, эмодзи во фразе — 400
      if (r.status() >= 400 && !/\/_payload\.json/.test(u) && !(r.status() === 400 && /\/api\/admin\/demand\/(?:yandex\/key|topics)/.test(u)))
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
    await page.locator('[data-testid=yandex-key-status]').waitFor({ timeout: 30000 })
    return page
  }
  // Тостов на экране бывает несколько, и порядок у sonner не по времени — ищем по тексту
  const toastWith = (page, text) => page.locator('[data-sonner-toast]', { hasText: text })
  const secretCount = () => psql(`SELECT count(*) FROM vault.secrets WHERE name = 'wordstat_api_key'`)
  const phrases = JSON.parse(psql(`
SELECT json_agg(DISTINCT public.market_demand_yandex_phrase(yandex_phrase, keywords) ORDER BY public.market_demand_yandex_phrase(yandex_phrase, keywords))
FROM public.market_demand_topics WHERE is_active`))
  const lastMonth = psql(`SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '1 month', 'YYYY-MM-DD')`)
  const fromDate = `${psql(`SELECT to_char(date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '24 months', 'YYYY-MM-DD')`)}T00:00:00Z`
  const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
  const monthText = `${MONTHS[Number(lastMonth.slice(5, 7)) - 1]} ${lastMonth.slice(0, 4)}`

  console.log('\n== ключ, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  const card = page.getByTestId('yandex-card')
  const keyStatus = page.getByTestId('yandex-key-status')
  const runStatus = page.getByTestId('yandex-run-status')
  const refreshBtn = page.getByTestId('yandex-refresh')
  check((await keyStatus.innerText()).includes('ключ не задан'), 'ключа нет — так и написано')
  check(await refreshBtn.isDisabled(), 'без ключа «Обновить Яндекс» выключена')
  check(await page.getByTestId('demand-source-yandex').count() === 0, 'чисел Яндекса нет — и переключателя нет')

  const form = page.getByTestId('yandex-key-form')
  const save = form.getByRole('button', { name: 'Проверить и сохранить' })
  await form.getByLabel('API-ключ Yandex Cloud').fill('AQVNwrongKey0000000000000000')
  await form.getByLabel('ID каталога Yandex Cloud').fill(STUB_FOLDER)
  await save.click()
  check(await toastWith(page, 'не принял API-ключ').waitFor({ timeout: 15000 }).then(() => true, () => false), 'неверный ключ — «Yandex Cloud не принял API-ключ»')
  await form.getByLabel('API-ключ Yandex Cloud').fill(STUB_KEY)
  await form.getByLabel('ID каталога Yandex Cloud').fill('b1gchuzhoykatalog00')
  await save.click()
  check(await toastWith(page, 'search-api.webSearch.user').waitFor({ timeout: 15000 }).then(() => true, () => false), 'чужой каталог (403) — подсказка про роль сервисного аккаунта')
  check(secretCount() === '0', 'ни неверный ключ, ни чужой каталог в базу не легли')

  await form.getByLabel('ID каталога Yandex Cloud').fill(STUB_FOLDER)
  await save.click()
  await keyStatus.getByText('ключ задан').waitFor({ timeout: 15000 })
  const statusText = await keyStatus.innerText()
  check(statusText.includes(STUB_FOLDER) && statusText.includes('••••xY7z') && statusText.includes('Казахстан'), 'верный ключ: каталог, 4 последних знака и регион «Казахстан» из дерева Вордстата')
  const tree = stubLog.filter(r => r.url === '/v2/wordstat/getRegionsTree').at(-1)
  check(tree?.good && tree.body?.folderId === STUB_FOLDER, 'проверка ключа — бесплатным деревом регионов, с Api-Key и каталогом')
  check(secretCount() === '1' && !(await page.content()).includes(STUB_KEY)
    && psql(`SELECT decrypted_secret::jsonb ->> 'region_id' FROM vault.decrypted_secrets WHERE name = 'wordstat_api_key'`) === '159', 'ключ в Vault с регионом 159, сам ключ на страницу не вернулся')

  const runText0 = await runStatus.innerText()
  check(runText0.includes(`Нет чисел за ${monthText} по ${phrases.length} фразам из ${phrases.length}`), `ждём ${monthText}: нет чисел по ${phrases.length} фразам из ${phrases.length}`)
  const price = `${String(phrases.length / 10).replace('.', ',')} ₸`
  check((await refreshBtn.innerText()).replace(/\s+/g, ' ').includes(`≈ ${price}`), `на кнопке цена: ${phrases.length} × 0,1 ₸ = ${price}`)

  console.log('\n== обновление')
  await refreshBtn.click()
  check(await toastWith(page, 'Запросы ушли в Вордстат').waitFor({ timeout: 15000 }).then(() => true, () => false), 'запуск — «Запросы ушли в Вордстат»')
  check(await runStatus.getByText('Идёт обновление').waitFor({ timeout: 15000 }).then(() => true, () => false), 'на странице — «Идёт обновление: получено N из M»')
  // Пауза по 429 держится 30 с — страница спрашивает каждые 5 с, увидеть её должна
  let pauseSeen = false
  const t0 = Date.now()
  while (Date.now() - t0 < 8 * 60_000) {
    const text = await runStatus.innerText()
    if (!pauseSeen && text.includes('продолжу в') && process.env.SHOTS)
      await card.screenshot({ path: `${process.env.SHOTS}/yandex-card-paused.png` })
    pauseSeen ||= text.includes('продолжу в')
    if (text.includes('Обновлено') && !text.includes('Идёт обновление'))
      break
    await sleep(1000)
  }
  const run1 = JSON.parse(psql(`SELECT row_to_json(r) FROM public.market_demand_yandex_runs r ORDER BY id DESC LIMIT 1`))
  check(run1.status === 'done', `страница сама дождалась конца (${Math.round((Date.now() - t0) / 1000)} с), запуск закрыт удачным`)
  check(pauseSeen, 'квота (429) — на странице «продолжу в …»')
  check(await toastWith(page, 'Вордстат обновлён').waitFor({ timeout: 15000 }).then(() => true, () => false), 'в конце — «Вордстат обновлён»')

  const sent = dynamicsLog()
  const asked = [...new Set(sent.map(r => r.body?.phrase))].sort()
  check(JSON.stringify(asked) === JSON.stringify([...phrases].sort()), `в Вордстат ушли все ${phrases.length} фраз отслеживаемых тем`)
  check(sent.every(r => r.good && r.body.folderId === STUB_FOLDER && r.body.period === 'PERIOD_MONTHLY' && r.body.fromDate === fromDate
    && JSON.stringify(r.body.regions) === '["159"]' && JSON.stringify(r.body.devices) === '["DEVICE_ALL"]'), `каждый запрос: ключ из Vault, каталог, по месяцам с ${fromDate.slice(0, 10)}, Казахстан, все устройства`)
  check(sent.filter(r => r.body.phrase === QUOTA_PHRASE).length === 2 && sent.filter(r => r.body.phrase !== QUOTA_PHRASE).length === phrases.length - 1, `«${QUOTA_PHRASE}» после 429 спрошена повторно, остальные — по разу`)
  const repeat = sent.filter(r => r.body.phrase === QUOTA_PHRASE)
  check(repeat.length === 2 && repeat[1].at - repeat[0].at >= 29_000, `повтор не раньше Retry-After (через ${repeat.length === 2 ? Math.round((repeat[1].at - repeat[0].at) / 1000) : '?'} с)`)
  check(psql(`SELECT count(*) FROM public.market_demand_yandex_monthly WHERE month > '${lastMonth}'`) === '0'
    && psql(`SELECT count(DISTINCT phrase) FROM public.market_demand_yandex_monthly`) === String(phrases.length - 1), 'числа легли по всем фразам, кроме отвергнутой; текущий неполный месяц — нет')
  const failure = await page.getByTestId('yandex-failure').allInnerTexts()
  check(failure.length === 1 && failure[0].includes(`«${REJECTED}»`) && failure[0].includes('Вордстат не принял фразу'), 'отказ фразы — на странице с причиной')
  if (process.env.SHOTS)
    await card.screenshot({ path: `${process.env.SHOTS}/yandex-card-done.png` })
  check((await runStatus.innerText()).includes(`по 1 фразе из ${phrases.length}`) && (await refreshBtn.innerText()).replace(/\s+/g, ' ').includes('≈ 0,1 ₸'), 'без чисел осталась одна фраза — и цена за неё одну')

  console.log('\n== темы по Яндексу')
  const summary = await rpc('market_demand_summary')
  check(await page.getByTestId('demand-source-yandex').isVisible() && await page.getByTestId('demand-source-google').getAttribute('aria-pressed') === 'true', 'появился переключатель «Google | Яндекс», по умолчанию Google')
  const tolokar = summary.find(t => t.name === 'Толокар')
  const fmt = n => n.toLocaleString('ru-RU').replace(/\s/g, ' ')
  const row = name => page.locator('[data-testid=demand-topic]', { hasText: name }).first()
  const rowText = async name => (await row(name).innerText()).replace(/\s+/g, ' ')
  check((await rowText('Толокар')).includes(`Яндекс ${fmt(tolokar.y_volume_avg3)}`), `Google: у «Толокара» рядом число Яндекса (${tolokar.y_volume_avg3})`)

  await page.getByTestId('demand-source-yandex').click()
  if (process.env.SHOTS) {
    await page.locator('[data-testid=demand-topic]').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${process.env.SHOTS}/yandex-topics-1366.png` })
  }
  check((await page.getByText('сколько раз искали в Яндексе').count()) === 1, 'пояснение — про Яндекс: слова фразы в любой форме, с Google не сравнивать')
  const active = summary.filter(t => t.is_active && t.y_volume_avg3 != null).sort((a, b) => b.y_volume_avg3 - a.y_volume_avg3)
  const first = (await page.locator('[data-testid=demand-topic]').first().innerText()).replace(/\s+/g, ' ')
  check(first.includes(active[0].name) && first.includes(`${fmt(active[0].y_volume_avg3)} в мес.`), `сверху — самый большой спрос в Яндексе («${active[0].name}», ${active[0].y_volume_avg3})`)
  const tol = await rowText('Толокар')
  check(tol.includes(`${fmt(tolokar.y_volume_avg3)} в мес.`) && tol.includes(`Google ${fmt(tolokar.volume_avg3)}`) && tol.includes('Вордстат: толокар'), 'у «Толокара» — число Яндекса как в сводке, рядом Google, и по какой фразе считал Вордстат')
  check(await row('Толокар').locator('svg polyline').count() === 1, 'мини-график — по Яндексу')
  const missing = summary.filter(t => t.is_active && t.our_total === 0 && (t.y_volume_avg3 ?? 0) > 0).length
  await page.getByTestId('demand-filter-missing').click()
  check(await page.locator('[data-testid=demand-topic]').count() === missing && missing > 0, `«Ищут, а у нас нет» по Яндексу — ${missing}, как в базе`)
  await page.getByTestId('demand-filter-all').click()

  console.log('\n== фраза для Вордстата')
  await row('Юла').getByRole('button', { name: /Изменить тему/ }).click()
  const editor = page.getByRole('dialog')
  await editor.waitFor({ timeout: 10000 })
  const phraseInput = page.locator('#topic-yandex')
  check(await phraseInput.inputValue() === REJECTED && await phraseInput.getAttribute('placeholder') === 'юла', 'в окне — своя фраза темы, подсказка — первая фраза')
  check(await editor.getByText('спрашивать цифры у Google и Яндекса').isVisible(), '«Отслеживать» — и для Яндекса')
  if (process.env.SHOTS)
    await editor.screenshot({ path: `${process.env.SHOTS}/yandex-editor.png` })
  await phraseInput.fill('юла 🎎')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  check(await toastWith(page, 'только буквы').waitFor({ timeout: 10000 }).then(() => true, () => false) && await editor.isVisible(), 'эмодзи — понятный отказ, окно не закрылось')
  await phraseInput.fill('  Юла   Волчок  -Игра ')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  check(psql(`SELECT yandex_phrase FROM public.market_demand_topics WHERE name = 'Юла'`) === 'юла волчок -игра', 'своя фраза сохранена строчными, без лишних пробелов')
  // Окно закрывается до того, как страница перечитала темы, — ждать текст, а не читать сразу
  const yandexLine = text => row('Юла').getByText(text, { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false)
  check(await yandexLine('Вордстат: юла волчок -игра'), 'на странице — новая фраза')
  check((await runStatus.innerText()).includes(`по 1 фразе из ${phrases.length}`), 'чисел по новой фразе ещё нет')

  const before = dynamicsLog().length
  await refreshBtn.click()
  const t1 = Date.now()
  const done2 = await runStatus.getByText('есть по всем фразам').waitFor({ timeout: 6 * 60_000 }).then(() => true, () => false)
  check(done2, `второе обновление дошло само (${Math.round((Date.now() - t1) / 1000)} с): числа есть по всем фразам`)
  const second = dynamicsLog().slice(before).map(r => r.body.phrase)
  check(JSON.stringify(second) === '["юла волчок -игра"]', 'спрошена только новая фраза — за свежие не платим второй раз')
  check(await refreshBtn.isDisabled(), 'всё свежее — кнопка выключена')
  const yula = (await rpc('market_demand_summary')).find(t => t.name === 'Юла')
  check((await rowText('Юла')).includes(`${fmt(yula.y_volume_avg3)} в мес.`), `у «Юлы» числа по своей фразе (${yula.y_volume_avg3})`)

  await row('Юла').getByRole('button', { name: /Изменить тему/ }).click()
  await editor.waitFor({ timeout: 10000 })
  await phraseInput.fill('')
  await editor.getByRole('button', { name: 'Сохранить' }).click()
  await editor.waitFor({ state: 'hidden', timeout: 15000 })
  check(psql(`SELECT yandex_phrase IS NULL FROM public.market_demand_topics WHERE name = 'Юла'`) === 't' && await yandexLine('Вордстат: юла'), 'пустая фраза — снова по первой фразе темы')

  console.log('\n== удаление ключа')
  await card.getByRole('button', { name: 'Удалить', exact: true }).click()
  check(secretCount() === '1', 'первое нажатие только спрашивает')
  await card.getByRole('button', { name: 'Точно удалить?' }).click()
  await keyStatus.getByText('ключ не задан').waitFor({ timeout: 15000 })
  check(secretCount() === '0' && await refreshBtn.isDisabled(), 'второе — ключ удалён из Vault, обновлять нечем')

  console.log('\n== 390 px')
  const phone = await newPage({ width: 390, height: 844 })
  check(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'страница без горизонтальной прокрутки')
  const phoneCard = await phone.getByTestId('yandex-card').boundingBox()
  check(phoneCard && phoneCard.x >= 0 && phoneCard.x + phoneCard.width <= 390, 'карточка Вордстата влезает в экран')
  if (process.env.SHOTS) {
    await phone.getByTestId('yandex-card').scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${process.env.SHOTS}/yandex-390-card.png` })
    await phone.getByTestId('demand-source-yandex').click()
    await phone.locator('[data-testid=demand-topic]').first().scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${process.env.SHOTS}/yandex-390-topics.png` })
    await page.getByTestId('yandex-card').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${process.env.SHOTS}/yandex-1366.png` })
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
  // Всё назад: темы, данные Вордстата, ключ, тик, настройка PostgREST, пользователи
  try {
    if (topicsBackup) {
      psql(`
BEGIN;
${WIPE}
DELETE FROM public.market_demand_topics WHERE true;
INSERT INTO public.market_demand_topics SELECT * FROM json_populate_recordset(NULL::public.market_demand_topics, :'backup'::json);
COMMIT;`, { backup: topicsBackup })
    }
    if (restSet) {
      psqlSuper(`ALTER ROLE authenticator IN DATABASE postgres RESET app.market_demand_yandex_api;`)
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

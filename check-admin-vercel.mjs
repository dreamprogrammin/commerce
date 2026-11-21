/**
 * Страж карточки «Vercel — расход и сборки» на дашборде админки (21.11.2026).
 * Владелец: «а ты можешь взять и в версел данные и показывать в админке и
 * давать подсказки туда». Vercel — подставной (localhost:8791), настоящий ключ
 * страж не видит.
 *
 *   sg docker -c "SHOTS=<папка> node check-admin-vercel.mjs --base=http://localhost:3141"
 *   (сервер — с VERCEL_API_STUB_URL=http://127.0.0.1:8791)
 */
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
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей и ключ в Vault')

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
const bodies = []
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  bodies.push(text)
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {}
  return { status: res.status, json, text }
}

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


/*
 * Подставной API Vercel: сервер запущен с VERCEL_API_STUB_URL=http://127.0.0.1:8791.
 * Цифры придуманы. Принимается только GOOD; команда с проектом — вторая в списке.
 */
const GOOD = `stub-vercel-token-${'x'.repeat(16)}GOOD`
const TEAM = 'team_stubTeam1234'
const charge = (name, q, unit, eff, billed) => JSON.stringify({ ServiceName: name, ConsumedQuantity: q, ConsumedUnit: unit, EffectiveCost: eff, BilledCost: billed })
const stubHits = []
const stub = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  stubHits.push(u.pathname)
  if (req.headers.authorization !== `Bearer ${GOOD}`) {
    res.writeHead(403).end('{"error":{"code":"forbidden"}}')
    return
  }
  const send = (code, body, type = 'application/json') => res.writeHead(code, { 'content-type': type }).end(typeof body === 'string' ? body : JSON.stringify(body))
  if (u.pathname === '/v2/teams')
    return send(200, { teams: [{ id: 'team_otherTeam000', name: 'Чужая', slug: 'other' }, { id: TEAM, name: 'Проба', slug: 'proba' }] })
  if (u.pathname === '/v9/projects/commerce')
    return u.searchParams.get('teamId') === TEAM ? send(200, { id: 'prj_x', name: 'commerce' }) : send(404, { error: { code: 'not_found' } })
  if (u.pathname === '/v1/billing/charges' && u.searchParams.get('teamId') === TEAM) {
    return send(200, [
      charge('Pro', 0, 'USD', 20, 0),
      charge('ISR Writes', 1200000, 'Writes', 4, 1.5),
      charge('ISR Writes', 800000, 'Writes', 2.5, 1),
      charge('Build CPU Minutes', 300, 'minute', 1.2, 0),
      charge('Fast Data Transfer', 3.2, 'gigabyte', 0.4, 0),
      'мусор',
    ].join('\n'), 'application/jsonl')
  }
  if (u.pathname === '/v6/deployments' && u.searchParams.get('teamId') === TEAM) {
    const now = Date.now()
    return send(200, { deployments: [
      { target: null, state: 'ERROR', createdAt: now - 60000, meta: { githubCommitRef: 'dev', githubCommitMessage: 'Merge feat/x into dev\n\nподробности' } },
      { target: null, state: 'READY', createdAt: now - 3600000, meta: { githubCommitRef: 'dev', githubCommitMessage: 'прежнее' } },
      { target: 'production', state: 'READY', createdAt: now - 86400000, meta: { githubCommitRef: 'master', githubCommitMessage: 'выкатка' } },
    ] })
  }
  send(404, { error: { code: 'not_found' } })
})

const stamp = Date.now()
const emails = { admin: `vercel-admin-${stamp}@probe.local`, buyer: `vercel-buyer-${stamp}@probe.local` }
const users = []
const errors = []
const failedResponses = []
let started = false

async function main() {
  await new Promise(r => stub.listen(8791, '127.0.0.1', r))
  if (psql(`SELECT to_regprocedure('public.vercel_key_status()') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261121140000_vercel_key')
  if (psql(`SELECT count(*) FROM vault.secrets WHERE name = 'vercel_token';`) !== '0')
    throw new Error('На локальной базе уже есть ключ Vercel — страж его не трогает')
  started = true
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)

  // 1) доступ и ввод
  check((await api('/api/admin/vercel/key', buyerToken, { token: GOOD })).status === 403, 'ключ покупателю — 403')
  check((await api('/api/admin/vercel/key', null, { token: GOOD })).status === 401, 'ключ без входа — 401')
  const short = await api('/api/admin/vercel/key', adminToken, { token: 'abc' })
  check(short.status === 400 && short.json?.message === 'Это не похоже на ключ Vercel', `короткий ключ — отказ без похода в Vercel (${short.json?.message})`)
  const bad = await api('/api/admin/vercel/key', adminToken, { token: `wrong-token-${'y'.repeat(20)}` })
  check(bad.status === 400 && /не принял ключ/.test(bad.json?.message ?? ''), `чужой ключ — «${bad.json?.message}»`)
  check(psql(`SELECT count(*) FROM vault.secrets WHERE name = 'vercel_token';`) === '0', 'непринятый ключ в Vault не попал')

  let s = (await api('/api/admin/site-health', adminToken)).json
  check(s.vercel?.installed === true && s.vercel.key === null, 'без ключа — ключа нет')
  check(s.readings.vercel?.value === 'ключ не задан', `строка Vercel: «${s.readings.vercel?.value}»`)

  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    ctx.on('page', (page) => {
      page.on('pageerror', e => page.url().startsWith(BASE) && errors.push(e.message))
      page.on('console', m => m.type() === 'error' && page.url().startsWith(BASE) && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
      page.on('response', r => r.url().startsWith(`${BASE}/api/`) && r.status() >= 400 && failedResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`))
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/about`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
    const loginError = await page.evaluate(async ({ email, password }) => {
      const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      const { error } = await nuxt.$supabase.client.auth.signInWithPassword({ email, password })
      return error?.message ?? null
    }, { email: emails.admin, password: PASSWORD })
    if (loginError)
      throw new Error(`вход: ${loginError}`)
    const sp = t => (t ?? '').replace(/\s+/g, ' ').trim()

    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid=vercel-key-form]').waitFor({ timeout: 20000 })
    check(await page.locator('[data-testid=vercel-key-form] a[href="https://vercel.com/account/settings/tokens"]').count() === 1, 'без ключа: форма со ссылкой, где его создать')
    await page.fill('[data-testid=vercel-token]', GOOD)
    await page.click('[data-testid=vercel-save]')
    await page.locator('[data-testid=vercel-services]').waitFor({ timeout: 20000 })
    check(psql(`SELECT decrypted_secret::jsonb ->> 'teamId' FROM vault.decrypted_secrets WHERE name = 'vercel_token';`) === TEAM, 'ключ в Vault, команда — та, где проект commerce (вторая в списке)')
    check(sp(await page.locator('[data-testid=vercel-key]').textContent()) === 'Ключ …GOOD, команда Проба', `подпись ключа: «${sp(await page.locator('[data-testid=vercel-key]').textContent())}»`)

    const names = await page.locator('[data-testid=vercel-service]').evaluateAll(els => els.map(e => e.getAttribute('data-name')))
    check(names.join('|') === 'ISR Writes|Build CPU Minutes|Fast Data Transfer', `услуги без тарифа, дорогие первыми: ${names.join(', ')}`)
    const isr = await page.locator('[data-testid=vercel-service][data-name="ISR Writes"] td').evaluateAll(els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '))
    check(isr === 'Пересборки кеша страниц | 2 000 000 | $6,50', `строка ISR по-русски, строки дня сложены: «${isr}»`)
    const hints = await page.locator('[data-testid=vercel-hint]').evaluateAll(els => els.map(e => `${e.getAttribute('data-level')}:${e.textContent.replace(/\s+/g, ' ').trim()}`))
    check(hints[0] === 'warn:Сверх включённого в Pro уже $2,50 — это придёт в счёт в конце месяца.', `подсказка о счёте: «${hints[0]}»`)
    check(/^info:Пересборки кеша страниц — 80% расхода \(\$6,50\)\. Страницы пересобираются часто/.test(hints[1] ?? ''), `подсказка о главной статье: «${(hints[1] ?? '').slice(0, 70)}»`)
    check(hints[2] === 'warn:Превью (dev) не собралось — dev.uhti.kz показывает прежнюю сборку.' && hints.length === 3, `подсказка об упавшем превью: «${hints[2]}»`)
    const deploys = await page.locator('[data-testid=vercel-deploy]').evaluateAll(els => els.map(e => e.getAttribute('data-state')))
    check(deploys.join(',') === 'READY,ERROR,READY', `сборки: боевая первой, потом превью (${deploys.join(',')})`)
    check(sp(await page.locator('[data-testid=vercel-deploy][data-state=ERROR]').textContent()).startsWith('превью · dev — упало'), 'упавшее превью — «упало»')
    check(/^Потреблено с 1 ноября: \$28,10 \(подписка и услуги\) · услуги к концу месяца ≈ \$\d+,\d\d · сверх включённого в Pro: \$2,50$/.test(sp(await page.locator('[data-testid=vercel-total]').textContent())), `итог: «${sp(await page.locator('[data-testid=vercel-total]').textContent()).slice(0, 120)}»`)
    const vrow = page.locator('[data-testid=paid-row][data-name="Vercel"] [data-testid=paid-reading]')
    check(sp(await vrow.textContent()).startsWith('расход в этом месяце $28,10'), `строка Vercel в «Платных сервисах»: «${sp(await vrow.textContent())}»`)
    if (SHOTS)
      await page.locator('[data-testid=vercel]').screenshot({ path: `${SHOTS}/vercel-1366.png` })

    // 2) ключ наружу не уходит
    s = (await api('/api/admin/site-health', adminToken)).json
    check(bodies.every(b => !b.includes(GOOD) && !b.includes('stub-vercel-token')), 'ответы сайта ключа не содержат')
    check(s.vercel.usage.services.length === 4, 'сводка: четыре услуги (с тарифом)')

    // 3) телефон
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })
    const p2 = await phone.newPage()
    await p2.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
    await p2.locator('[data-testid=vercel-services]').waitFor({ timeout: 20000 })
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(overflow <= 0, `телефон: без горизонтальной прокрутки (${overflow})`)
    if (SHOTS)
      await p2.locator('[data-testid=vercel]').screenshot({ path: `${SHOTS}/vercel-390.png` })
    await phone.close()

    // 4) убрать ключ
    await page.click('[data-testid=vercel-delete]')
    check(sp(await page.locator('[data-testid=vercel-delete]').textContent()) === 'Точно убрать?', 'удаление — со вторым нажатием')
    await page.click('[data-testid=vercel-delete]')
    await page.locator('[data-testid=vercel-key-form]').waitFor({ timeout: 10000 })
    check(psql(`SELECT count(*) FROM vault.secrets WHERE name = 'vercel_token';`) === '0', 'ключ убран из Vault')
    await ctx.close()
  }
  finally {
    await browser.close()
  }
  check(stubHits.includes('/v1/billing/charges'), 'расход брался у (подставного) Vercel')
  check(!errors.length, `ошибок консоли нет${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)
  check(!failedResponses.length, `неудачных ответов API нет${failedResponses.length ? `: ${failedResponses.slice(0, 3).join(', ')}` : ''}`)
}

try {
  await main()
}
catch (e) {
  fails.push(String(e?.stack ?? e))
  console.error(e)
}
finally {
  if (started)
    psql(`DELETE FROM vault.secrets WHERE name = 'vercel_token';`)
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
  stub.close()
}
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nВсё зелёное')
process.exit(fails.length ? 1 : 0)

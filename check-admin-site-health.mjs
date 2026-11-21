/**
 * Страж «Состояние сайта» и платных сервисов на дашборде админки (21.11.2026).
 * Владелец: «в админку нужно завести батарейку состояния сайта и все сервисы
 * платные которые имеются». Сторож (эдж-функция site-watchdog) здесь не
 * запускается — проверки и сбой вставляются в базу, как их пишет он.
 *
 *   sg docker -c "SHOTS=<папка> node check-admin-site-health.mjs --base=http://localhost:3141"
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
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей и пишет в таблицы сторожа')

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

const stamp = Date.now()
const emails = { admin: `site-admin-${stamp}@probe.local`, buyer: `site-buyer-${stamp}@probe.local` }
const users = []
const errors = []
const failedResponses = []
let servicesBefore = null
let started = false

function cleanup() {
  psql(`DELETE FROM public.site_health_checks; DELETE FROM public.site_health_incidents;`)
  if (servicesBefore != null) {
    psql(`DELETE FROM public.paid_services;
INSERT INTO public.paid_services SELECT * FROM json_populate_recordset(null::public.paid_services, :'rows'::json);`, { rows: servicesBefore })
  }
}

async function main() {
  if (psql(`SELECT to_regclass('public.paid_services') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261121120000_site_health')
  if (psql(`SELECT (SELECT count(*) FROM public.site_health_checks) + (SELECT count(*) FROM public.site_health_incidents);`) !== '0')
    throw new Error('На локальной базе уже есть проверки сторожа — страж их не трогает')
  servicesBefore = psql(`SELECT coalesce(json_agg(p), '[]') FROM public.paid_services p;`)
  started = true
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)

  // 1) доступ и ввод
  check((await api('/api/admin/site-health', buyerToken)).status === 403, 'сводка покупателю — 403')
  check((await api('/api/admin/site-health')).status === 401, 'сводка без входа — 401')
  check((await api('/api/admin/paid-services', buyerToken, { name: 'x', period: 'month', currency: 'USD' })).status === 403, 'правка сервиса покупателю — 403')
  const bad = await api('/api/admin/paid-services', adminToken, { name: 'Проба', period: 'month', currency: 'USD', renewsOn: '21.11.2026' })
  check(bad.status === 400 && bad.json?.message === 'Дата продления — ГГГГ-ММ-ДД', `дата не ГГГГ-ММ-ДД — понятный отказ (${bad.json?.message})`)
  check((await api('/api/admin/paid-services', adminToken, { name: 'Проба', period: 'month', currency: 'USD', url: 'http://x' })).status === 400, 'ссылка без https — отказ')

  // 2) сторож ещё не проверял
  let s = (await api('/api/admin/site-health', adminToken)).json
  check(s?.installed === true && s.site.last === null, 'проверок нет — «последней» нет')
  check(s.services.map(x => x.name).join('|') === 'Vercel|Supabase|DataForSEO|Модели ИИ|Домен uhti.kz', `сервисы из миграции: ${s.services.map(x => x.name).join(', ')}`)
  check(s.readings.supabase?.value?.startsWith('база ') && s.readings.supabase.level > 0, `Supabase: размер базы и файлов из лимитов Free («${s.readings.supabase?.value}»)`)

  // 3) сайт лежит: проверки за сутки и открытый сбой, о котором уже написали
  psql(`
INSERT INTO public.site_health_checks (checked_at, url, ok, status, ms, error)
SELECT now() - (g * interval '5 minutes') - interval '20 minutes', u, true, 200, 800, NULL
FROM generate_series(0, 95) g, unnest(ARRAY['https://uhti.kz/', 'https://uhti.kz/catalog']) u;
INSERT INTO public.site_health_checks (checked_at, url, ok, status, ms, error)
SELECT now() - (g * interval '5 minutes'), u, false, 402, 300, '402 — Vercel остановил проект (лимиты или оплата)'
FROM generate_series(0, 3) g, unnest(ARRAY['https://uhti.kz/', 'https://uhti.kz/catalog']) u;
INSERT INTO public.site_health_incidents (started_at, ended_at, reason, alerted_at, recovered_alerted_at) VALUES
  (now() - interval '3 days', now() - interval '3 days' + interval '40 minutes', 'HTTP 500', now() - interval '3 days', now() - interval '3 days' + interval '40 minutes'),
  (now() - interval '2 days', now() - interval '2 days' + interval '5 minutes', 'случайная', NULL, NULL),
  (now() - interval '15 minutes', NULL, '402 — Vercel остановил проект (лимиты или оплата)', now() - interval '10 minutes', NULL);
UPDATE public.paid_services SET renews_on = (now() AT TIME ZONE 'Asia/Almaty')::date + 3 WHERE meter = 'vercel';
UPDATE public.paid_services SET cost = 6000, renews_on = '2027-03-01' WHERE name = 'Домен uhti.kz';
`)
  s = (await api('/api/admin/site-health', adminToken)).json
  check(s.site.down?.reason?.startsWith('402 — Vercel') && s.site.last.ok === false, 'сбой идёт — причина и последняя проверка неудачная')
  check(Math.abs(s.site.uptime24 - 192 / 200) < 0.001, `доступность за сутки — по проверкам (${s.site.uptime24})`)
  check(s.site.incidents.length === 2 && !s.site.incidents.some(i => i.reason === 'случайная'), 'в истории — только сбои, о которых писали')

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
    const panel = page.locator('[data-testid=site-health]')
    await panel.waitFor({ timeout: 20000 })
    check(await panel.getAttribute('data-state') === 'empty' && sp(await page.locator('[data-testid=site-health-headline]').textContent()) === 'Сайт не открывается', 'панель: «Сайт не открывается», красная')
    check(sp(await page.locator('[data-testid=site-health-note]').textContent()).startsWith('402 — Vercel остановил проект'), `панель: причина — «${sp(await page.locator('[data-testid=site-health-note]').textContent()).slice(0, 60)}»`)
    check(await page.locator('[data-testid=site-health-incidents] p').count() === 3, 'панель: в истории два сбоя')
    const row = name => page.locator(`[data-testid=paid-row][data-name="${name}"]`)
    check(sp(await row('Vercel').locator('[data-testid=paid-price]').textContent()) === '$20 в месяц' && /через 3 дн/.test(await row('Vercel').locator('[data-testid=paid-renew]').textContent()), 'Vercel: $20 в месяц, продление через 3 дня')
    check((await row('Vercel').locator('[data-testid=paid-renew]').getAttribute('class')).includes('text-amber-700'), 'скорое продление — выделено')
    check(sp(await page.locator('[data-testid=paid-total]').textContent()).startsWith('В месяц: $20 + 500 ₸ + по факту (DataForSEO, Модели ИИ)'), `итог: «${sp(await page.locator('[data-testid=paid-total]').textContent())}»`)
    check(sp(await row('Supabase').locator('[data-testid=paid-reading]').textContent()).startsWith('база '), 'Supabase: показание размера')
    if (SHOTS)
      await page.screenshot({ path: `${SHOTS}/site-health-1366.png`, fullPage: false })

    // 4) добавить, поправить, удалить
    await page.click('[data-testid=paid-add]')
    await page.fill('[data-testid=paid-name]', 'ImprovMX')
    await page.fill('[data-testid=paid-plan]', 'Premium')
    await page.fill('[data-testid=paid-cost]', '9,5')
    await page.fill('[data-testid=paid-url]', 'https://app.improvmx.com/')
    await page.click('[data-testid=paid-save]')
    await row('ImprovMX').waitFor({ timeout: 10000 })
    const added = JSON.parse(psql(`SELECT row_to_json(p) FROM public.paid_services p WHERE name = 'ImprovMX';`))
    check(Number(added.cost) === 9.5 && added.currency === 'USD' && added.period === 'month' && added.url === 'https://app.improvmx.com/', 'добавлен: цена 9,5 → 9.5, $ в месяц, ссылка')
    check(sp(await page.locator('[data-testid=paid-total]').textContent()).startsWith('В месяц: $29,5 + 500 ₸'), `итог пересчитан: «${sp(await page.locator('[data-testid=paid-total]').textContent()).slice(0, 40)}»`)
    await row('ImprovMX').locator('[data-testid=paid-edit]').click()
    await page.selectOption('[data-testid=paid-period]', 'year')
    await page.fill('[data-testid=paid-cost]', '90')
    await page.click('[data-testid=paid-save]')
    await page.locator('[data-testid=paid-row][data-name="ImprovMX"] [data-testid=paid-price]', { hasText: '$90 в год' }).waitFor({ timeout: 10000 })
    check(psql(`SELECT period || ' ' || cost FROM public.paid_services WHERE name = 'ImprovMX';`) === 'year 90.00', 'поправлен: $90 в год')
    await row('ImprovMX').locator('[data-testid=paid-edit]').click()
    await page.click('[data-testid=paid-delete]')
    check(sp(await page.locator('[data-testid=paid-delete]').textContent()) === 'Точно удалить?', 'удаление — со вторым нажатием')
    await page.click('[data-testid=paid-delete]')
    await row('ImprovMX').waitFor({ state: 'detached', timeout: 10000 })
    check(psql(`SELECT count(*) FROM public.paid_services WHERE name = 'ImprovMX';`) === '0', 'удалён из базы')

    // 5) сайт снова открывается
    psql(`UPDATE public.site_health_incidents SET ended_at = now(), recovered_alerted_at = now() WHERE ended_at IS NULL;
INSERT INTO public.site_health_checks (url, ok, status, ms) VALUES ('https://uhti.kz/', true, 200, 900), ('https://uhti.kz/catalog', true, 200, 700);`)
    await page.reload({ waitUntil: 'networkidle' })
    await panel.waitFor()
    check(sp(await page.locator('[data-testid=site-health-headline]').textContent()) === 'Сайт работает' && await panel.getAttribute('data-state') === 'low', 'открылся: «Сайт работает», жёлтая — за сутки меньше 99%')
    check(/^Проверено только что · ответ 0,9 с · за 24 ч — 9\d(,\d)?%/.test(sp(await page.locator('[data-testid=site-health-note]').textContent())), `подпись: «${sp(await page.locator('[data-testid=site-health-note]').textContent())}»`)

    // 6) телефон
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: await ctx.storageState() })
    const p2 = await phone.newPage()
    await p2.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
    await p2.locator('[data-testid=paid-services]').waitFor({ timeout: 20000 })
    const overflow = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(overflow <= 0, `телефон: без горизонтальной прокрутки (${overflow})`)
    if (SHOTS) {
      await p2.locator('[data-testid=site-health]').screenshot({ path: `${SHOTS}/site-health-390.png` })
      await p2.locator('[data-testid=paid-services]').screenshot({ path: `${SHOTS}/paid-services-390.png` })
    }
    await phone.close()
    await ctx.close()
  }
  finally {
    await browser.close()
  }
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
    cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nВсё зелёное')
process.exit(fails.length ? 1 : 0)

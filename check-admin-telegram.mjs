/*
 * Аккаунт Telegram (4.11.2026) — только на ЛОКАЛЬНОЙ базе с миграцией
 * 20261104120000_telegram_account и только на стенде с подделкой Telegram
 * (сервер запущен с TELEGRAM_FAKE=1). Настоящий Telegram страж не трогает:
 * первым делом ищет `fake: true` в статусе и без него останавливается, не
 * введя ни одного номера.
 *
 * Подделка — server/utils/telegramAccount.ts: номер на …0000 Telegram «не
 * принимает», на …1 — с паролем; код 12345, пароль secret; приглашение на
 * Member… — аккаунт в канале, на Expired… — устарело, остальные — не вступил.
 *
 * Проверяет:
 *  1) маршруты: гость — 401, не-администратор — 403, на каждом;
 *  2) приложение: неверный api_hash — кнопка не жмётся, сервер — 400; верный
 *     ложится в Vault, назад не отдаётся;
 *  3) вход: номер, который Telegram не принял, — причина по-русски; неверный
 *     код — причина; верный — аккаунт подключён: имя, @username, последние
 *     4 цифры; в Vault сессия, временный вход стёрт;
 *  4) подключённому — второй вход отказом; закрытые каналы: в канале, не
 *     вступил, приглашение устарело;
 *  5) выход: два клика; сессия и строка аккаунта стёрты, приложение осталось;
 *  6) двухэтапная проверка: подсказка, неверный пароль, верный; «Другой
 *     номер» стирает начатый вход; вход старше 15 минут — как не начатый;
 *  7) ни один ответ маршрутов не несёт секретов: api_hash, сессии,
 *     phone_code_hash, полного номера;
 *  8) «Умный закуп»: кнопка «Аккаунт Telegram»; шаг 1 с закрытым каналом —
 *     «Ждёт вас» и кнопка на эту страницу, после входа — «Готово»;
 *  9) без миграции (таблица и функция статуса на время переименованы) —
 *     страница и дашборд говорят про миграцию, не 500;
 * 10) телефон 390px: шаги без горизонтальной прокрутки; без ошибок консоли.
 *
 * Данные заводит сам — администратор, покупатель, поставщик с закрытыми
 * каналами — и в конце всё убирает, секреты Telegram в Vault тоже. Если
 * они на локальной базе уже есть, страж останавливается, не тронув их.
 *
 *   sg docker -c "node check-admin-telegram.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные) с TELEGRAM_FAKE=1.
 * SHOTS=<папка> — скриншоты.
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
const SUPPLIER = 'Проверка аккаунта Telegram'
// Пробные значения подделки — их не должно быть ни в одном ответе
const API_ID = '1234567'
const API_HASH = '0123456789abcdef0123456789abcdef'
const PHONE = '+7 777 123 45 67'
const PHONE_2FA = '+7 777 123 45 61'
const SECRETS = [API_HASH, 'fake-session-', 'fake-temp-', 'hash4567', 'hash4561', '77771234567', '77771234561']
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, поставщика и секреты Telegram')

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
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  }
  catch {}
  return { status: res.status, json, text }
}

const stamp = Date.now()
const emails = { admin: `telegram-admin-${stamp}@example.test`, buyer: `telegram-buyer-${stamp}@example.test` }
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

// Какие секреты Telegram лежат в Vault — имена, без значений
const vaultNames = () => psql(`SELECT coalesce(string_agg(substr(name, 10), ',' ORDER BY name), '') FROM vault.secrets WHERE name LIKE 'telegram\\_%';`)
const accountRows = () => rest('telegram_account?select=user_id,display_name,username,phone_last4,logged_in_by')

let started = false
function cleanup() {
  psql(`DELETE FROM public.suppliers WHERE name = '${SUPPLIER}';`)
  if (started)
    psql(`DELETE FROM vault.secrets WHERE name LIKE 'telegram\\_%'; DELETE FROM public.telegram_account;`)
}

const browser = await chromium.launch()
let renamed = false
try {
  if (psql(`SELECT to_regclass('public.telegram_account') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261104120000_telegram_account')
  if (vaultNames())
    throw new Error(`На локальной базе уже есть секреты Telegram (${vaultNames()}) — страж их не трогает`)
  started = true
  cleanup()
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}`)

  const first = await api('/api/admin/telegram', adminToken)
  if (first.json?.fake !== true)
    throw new Error('Стенд без подделки Telegram (нет fake: true) — запустите сервер с TELEGRAM_FAKE=1. Номера не вводились')

  console.log('\n== маршруты')
  const routes = [
    ['GET', '/api/admin/telegram', null],
    ['PUT', '/api/admin/telegram/app', { apiId: API_ID, apiHash: API_HASH }],
    ['POST', '/api/admin/telegram/login', { phone: PHONE }],
    ['DELETE', '/api/admin/telegram/login', null],
    ['POST', '/api/admin/telegram/login/code', { code: '12345' }],
    ['POST', '/api/admin/telegram/login/password', { password: 'secret' }],
    ['DELETE', '/api/admin/telegram', null],
    ['POST', '/api/admin/telegram/channels', {}],
  ]
  for (const [method, path, body] of routes) {
    const guest = await api(path, null, body, method)
    const buyer = await api(path, buyerToken, body, method)
    check(guest.status === 401 && buyer.status === 403, `${method} ${path}: гость — ${guest.status}, не-администратор — ${buyer.status}`)
  }
  check(!vaultNames(), 'отказанные запросы ничего не записали в Vault')
  check(first.status === 200 && first.json.installed === true && first.json.app.configured === false && first.json.account === null && first.json.login === null, 'статус администратору: миграция есть, приложения и аккаунта нет')

  const badApp = await api('/api/admin/telegram/app', adminToken, { apiId: API_ID, apiHash: 'xyz' }, 'PUT')
  check(badApp.status === 400 && /api_hash/.test(badApp.json?.message), `неверный api_hash — 400 «${badApp.json?.message}»`)
  const early = await api('/api/admin/telegram/login', adminToken, { phone: PHONE })
  check(early.status === 409 && /api_id и api_hash/.test(early.json?.message), `код без приложения — 409 «${early.json?.message}»`)
  const badPhone = await api('/api/admin/telegram/login', adminToken, { phone: '12345' })
  check(badPhone.status === 400 && /\+7/.test(badPhone.json?.message), `не номер — 400 «${badPhone.json?.message}»`)

  const supplierId = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER}') RETURNING id;`)
  psql(`
INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type) VALUES
  (:'s', 'MemberProbe_tg1', 'Проверка — в канале', 'channel'),
  (:'s', 'JoinProbe_tg1', 'Проверка — не вступил', 'channel'),
  (:'s', 'ExpiredProbe_tg1', 'Проверка — устарело', 'channel');
`, { s: supplierId })

  const errors = []
  const failed = []
  const bodies = []
  async function newPage(viewport, path = '/admin/telegram') {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', async (r) => {
      if (r.url().includes('/api/admin/telegram'))
        bodies.push(`${r.url()} ${await r.text().catch(() => '')}`)
      // Отказы Telegram и проверки — ответ, который страница показывает человеку
      if ((r.status() === 400 || r.status() === 409) && r.url().includes('/api/admin/telegram'))
        return
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
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForLoadState('networkidle')
    return page
  }
  // Тостов бывает несколько, порядок у sonner не по времени — ищем по тексту
  const toastWith = (page, text) => page.locator('[data-sonner-toast]', { hasText: text })
  const sp = s => (s ?? '').replace(/\s+/g, ' ').trim()
  const textOf = async (page, testid) => sp(await page.locator(`[data-testid=${testid}]`).first().textContent({ timeout: 5000 }).catch(() => null))
  // Ответ маршрута и перерисовка после refresh
  async function act(page, path, click) {
    const done = page.waitForResponse(r => r.url().includes(path) && r.request().method() !== 'GET', { timeout: 30000 })
    await click()
    const res = await done
    await page.waitForLoadState('networkidle')
    return res
  }
  const noScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

  console.log('\n== приложение, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  check(await page.getByRole('heading', { name: 'Аккаунт Telegram' }).isVisible(), 'страница открылась: заголовок «Аккаунт Telegram»')
  check(await page.locator('[data-testid=tg-login]').count() === 0, 'без приложения входа нет')
  const save = page.locator('[data-testid=tg-app-form] button[type=submit]')
  await page.locator('#tg-api-id').fill(API_ID)
  await page.locator('#tg-api-hash').fill('0123456789abcdef')
  check(await save.isDisabled(), 'короткий api_hash — «Сохранить» не жмётся')
  await page.locator('#tg-api-hash').fill(API_HASH.toUpperCase())
  check(await save.isEnabled(), 'api_hash заглавными — жмётся, сервер сам переведёт в строчные')
  await act(page, '/api/admin/telegram/app', () => save.click())
  await toastWith(page, 'Приложение сохранено').waitFor({ timeout: 15000 })
  check((await textOf(page, 'tg-app-state')).startsWith('Задано '), `приложение «задано»: «${await textOf(page, 'tg-app-state')}»`)
  check(vaultNames() === 'api_hash,api_id', `в Vault — api_id и api_hash: «${vaultNames()}»`)
  check(psql(`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_api_hash';`) === API_HASH, 'api_hash в Vault — строчными')
  check(await page.locator('#tg-api-hash').count() === 0, 'после сохранения полей приложения на странице нет')

  console.log('\n== вход')
  const phoneForm = page.locator('[data-testid=tg-phone-form]')
  await phoneForm.locator('input').fill('+7 777 000 0000')
  await act(page, '/api/admin/telegram/login', () => phoneForm.locator('button[type=submit]').click())
  await toastWith(page, 'Telegram не принимает этот номер').waitFor({ timeout: 15000 })
  check(await phoneForm.isVisible() && !vaultNames().includes('login'), 'номер не принят — причина по-русски, вход не начат')
  await phoneForm.locator('input').fill(PHONE)
  await act(page, '/api/admin/telegram/login', () => phoneForm.locator('button[type=submit]').click())
  const codeForm = page.locator('[data-testid=tg-code-form]')
  await codeForm.waitFor({ timeout: 15000 })
  check(sp(await codeForm.locator('p').first().textContent()).includes('Код отправлен в приложение Telegram') && sp(await codeForm.textContent()).includes('номер …4567'), `код запрошен: «${sp(await codeForm.locator('p').first().textContent())}»`)
  check(vaultNames() === 'api_hash,api_id,login', 'временный вход — в Vault')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/telegram-code-1366.png`, fullPage: true })
  await codeForm.locator('input').fill('11 111')
  await act(page, '/api/admin/telegram/login/code', () => codeForm.locator('button[type=submit]').click())
  await toastWith(page, 'Код не подошёл').waitFor({ timeout: 15000 })
  check(await codeForm.isVisible(), 'неверный код — причина, форма кода на месте')
  await codeForm.locator('input').fill('12 345')
  await act(page, '/api/admin/telegram/login/code', () => codeForm.locator('button[type=submit]').click())
  await page.locator('[data-testid=tg-account]').waitFor({ timeout: 15000 })
  const acc = await textOf(page, 'tg-account')
  check(/^Закуп Ухти · @uhti_zakup Телефон …4567 · вошли \d{1,2} \S+ \d{4}/.test(acc), `подключён: «${acc}»`)
  check(vaultNames() === 'api_hash,api_id,session', `в Vault сессия, временный вход стёрт: «${vaultNames()}»`)
  const rows = await accountRows()
  check(rows.length === 1 && rows[0].phone_last4 === '4567' && rows[0].username === 'uhti_zakup' && rows[0].logged_in_by === adminId, 'строка аккаунта: последние 4 цифры, @username, кто вошёл')
  const again = await api('/api/admin/telegram/login', adminToken, { phone: PHONE })
  check(again.status === 409 && /уже подключён/.test(again.json?.message), `подключённому второй вход — 409 «${again.json?.message}»`)

  console.log('\n== закрытые каналы')
  const channelRows = page.locator('[data-testid=tg-channel-row]')
  check(await channelRows.count() === 3, `три закрытых канала поставщика (${await channelRows.count()})`)
  await act(page, '/api/admin/telegram/channels', () => page.locator('[data-testid=tg-channels]').getByRole('button', { name: 'Проверить' }).click())
  const state = async title => sp(await channelRows.filter({ hasText: title }).locator('[data-testid=tg-channel-state]').textContent({ timeout: 5000 }).catch(() => null))
  check(/^аккаунт в канале · последний пост 4 нояб\. 2026/.test(await state('Проверка — в канале')), `в канале: «${await state('Проверка — в канале')}»`)
  check((await state('Проверка — не вступил')).startsWith('аккаунт не вступил'), `не вступил: «${await state('Проверка — не вступил')}»`)
  check((await state('Проверка — устарело')).startsWith('приглашение устарело'), `устарело: «${await state('Проверка — устарело')}»`)

  console.log('\n== дашборд: аккаунт подключён')
  const hub = await newPage({ width: 1366, height: 900 }, '/admin/purchasing')
  await hub.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
  const stepOf = async id => hub.evaluate((id) => {
    const el = document.querySelector(`[data-testid=purchasing-steps] > li[data-testid=step-${id}]`)
    const t = sel => el?.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? ''
    return { state: el?.dataset.state, facts: t('[data-testid=step-facts]'), next: t('[data-testid=step-next]'), href: el?.querySelector('[data-testid=step-link]')?.getAttribute('href') ?? null }
  }, id)
  const pages = await hub.locator('[data-testid=purchasing-pages] a').evaluateAll(as => as.map(a => a.getAttribute('href')))
  check(pages.includes('/admin/telegram'), `кнопка «Аккаунт Telegram» на дашборде: ${pages.join(', ')}`)
  let s1 = await stepOf('suppliers')
  check(s1.state === 'done' && s1.facts.includes('аккаунт Telegram подключён') && s1.href === '/admin/suppliers', `шаг 1 при подключённом аккаунте — «Готово»: «${s1.facts}»`)

  console.log('\n== выход')
  const logoutBtn = page.locator('[data-testid=tg-login]').getByRole('button', { name: 'Выйти' })
  await logoutBtn.click()
  check(await page.getByRole('button', { name: 'Точно выйти?' }).isVisible() && vaultNames().includes('session'), 'первый клик — «Точно выйти?», сессия на месте')
  await act(page, '/api/admin/telegram', () => page.getByRole('button', { name: 'Точно выйти?' }).click())
  await toastWith(page, 'Вышли из аккаунта Telegram').waitFor({ timeout: 15000 })
  await phoneForm.waitFor({ timeout: 15000 })
  check(vaultNames() === 'api_hash,api_id' && !(await accountRows()).length, `сессия и строка аккаунта стёрты, приложение осталось: «${vaultNames()}»`)
  check(await page.locator('[data-testid=tg-channel-state]').count() === 0 && /После входа здесь будет видно/.test(await textOf(page, 'tg-channels')), 'после выхода состояния каналов не висят')

  await hub.getByRole('button', { name: 'Обновить', exact: true }).click()
  await hub.waitForLoadState('networkidle')
  await hub.waitForFunction(() => !document.querySelector('button .animate-spin'), null, { timeout: 30000 })
  s1 = await stepOf('suppliers')
  check(s1.state === 'action' && s1.next === 'Закрытые каналы читаются только через аккаунт Telegram — подключите его на странице «Аккаунт Telegram».' && s1.href === '/admin/telegram', `шаг 1 без аккаунта — «Ждёт вас», кнопка на страницу аккаунта: «${s1.next}» → ${s1.href}`)
  await hub.locator('[data-testid=step-suppliers] [data-testid=step-link]').click()
  await hub.waitForURL('**/admin/telegram', { timeout: 30000 })
  await hub.waitForLoadState('networkidle')
  const item = hub.locator('aside nav a[href="/admin/purchasing"]')
  check(/\bbg-muted\b/.test(await item.getAttribute('class')), 'кнопка шага открыла «Аккаунт Telegram», «Умный закуп» в меню горит')
  await hub.context().close()

  console.log('\n== двухэтапная проверка и отмена')
  await phoneForm.locator('input').fill(PHONE_2FA)
  await act(page, '/api/admin/telegram/login', () => phoneForm.locator('button[type=submit]').click())
  await codeForm.locator('input').fill('12345')
  await act(page, '/api/admin/telegram/login/code', () => codeForm.locator('button[type=submit]').click())
  const passForm = page.locator('[data-testid=tg-password-form]')
  await passForm.waitFor({ timeout: 15000 })
  check(sp(await passForm.textContent()).includes('Подсказка: кот'), `нужен пароль, подсказка видна: «${sp(await passForm.locator('p').textContent())}»`)
  await passForm.locator('input').fill('dog')
  await act(page, '/api/admin/telegram/login/password', () => passForm.locator('button[type=submit]').click())
  await toastWith(page, 'Пароль не подошёл').waitFor({ timeout: 15000 })
  check(await passForm.isVisible() && vaultNames().includes('login'), 'неверный пароль — причина, вход ждёт пароль')
  await passForm.locator('input').fill('secret')
  await act(page, '/api/admin/telegram/login/password', () => passForm.locator('button[type=submit]').click())
  await page.locator('[data-testid=tg-account]').waitFor({ timeout: 15000 })
  check((await textOf(page, 'tg-account')).includes('Телефон …4561') && vaultNames() === 'api_hash,api_id,session', 'пароль принят — подключён, номер …4561')

  await act(page, '/api/admin/telegram', async () => {
    await logoutBtn.click()
    await page.getByRole('button', { name: 'Точно выйти?' }).click()
  })
  await phoneForm.waitFor({ timeout: 15000 })
  await phoneForm.locator('input').fill(PHONE)
  await act(page, '/api/admin/telegram/login', () => phoneForm.locator('button[type=submit]').click())
  await codeForm.waitFor({ timeout: 15000 })
  await act(page, '/api/admin/telegram/login', () => codeForm.getByRole('button', { name: 'Другой номер' }).click())
  await phoneForm.waitFor({ timeout: 15000 })
  check(!vaultNames().includes('login'), '«Другой номер» — начатый вход стёрт, снова телефон')

  await phoneForm.locator('input').fill(PHONE)
  await act(page, '/api/admin/telegram/login', () => phoneForm.locator('button[type=submit]').click())
  psql(`
SELECT public.telegram_secret_set('login', jsonb_set(
  (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'telegram_login')::jsonb,
  '{startedAt}', to_jsonb(to_char(now() AT TIME ZONE 'utc' - interval '16 minutes', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
)::text, NULL);`)
  const stale = await api('/api/admin/telegram/login/code', adminToken, { code: '12345' })
  check(stale.status === 409 && /устарел/.test(stale.json?.message), `вход старше 15 минут — 409 «${stale.json?.message}»`)
  const staleStatus = await api('/api/admin/telegram', adminToken)
  check(staleStatus.json?.login === null && staleStatus.json?.account === null, 'и в статусе — как не начатый')
  await api('/api/admin/telegram/login', adminToken, null, 'DELETE')

  console.log('\n== телефон 390 px')
  const mobile = await newPage({ width: 390, height: 844 })
  check(await noScroll(mobile), 'шаг телефона — без горизонтальной прокрутки')
  const mPhone = mobile.locator('[data-testid=tg-phone-form]')
  await mPhone.locator('input').fill(PHONE)
  await act(mobile, '/api/admin/telegram/login', () => mPhone.locator('button[type=submit]').click())
  await mobile.locator('[data-testid=tg-code-form]').waitFor({ timeout: 15000 })
  check(await noScroll(mobile), 'шаг кода — без горизонтальной прокрутки')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/telegram-code-390.png`, fullPage: true })
  await mobile.locator('[data-testid=tg-code-form] input').fill('12345')
  await act(mobile, '/api/admin/telegram/login/code', () => mobile.locator('[data-testid=tg-code-form] button[type=submit]').click())
  await mobile.locator('[data-testid=tg-account]').waitFor({ timeout: 15000 })
  await act(mobile, '/api/admin/telegram/channels', () => mobile.locator('[data-testid=tg-channels]').getByRole('button', { name: 'Проверить' }).click())
  check(await noScroll(mobile), 'подключён, состояния каналов — без горизонтальной прокрутки')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/telegram-account-390.png`, fullPage: true })
  await mobile.context().close()

  console.log('\n== секреты в ответах')
  const leaks = bodies.filter(b => SECRETS.some(s => b.includes(s)))
  check(bodies.length > 10 && !leaks.length, `ответов маршрутов ${bodies.length}, с секретами — ${leaks.length}${leaks.length ? `: ${leaks[0].slice(0, 160)}` : ''}`)
  const statusNow = await api('/api/admin/telegram', adminToken)
  check(!SECRETS.some(s => statusNow.text.includes(s)), 'статус подключённого аккаунта — без секретов')

  console.log('\n== без миграции')
  psql(`ALTER TABLE public.telegram_account RENAME TO telegram_account_check_off;
ALTER FUNCTION public.telegram_secrets_status() RENAME TO telegram_secrets_status_check_off;
NOTIFY pgrst, 'reload schema';`)
  renamed = true
  await new Promise(r => setTimeout(r, 1500))
  const off = await api('/api/admin/telegram', adminToken)
  check(off.status === 200 && off.json?.installed === false, 'статус без миграции — installed: false, не 500')
  const bare = await newPage({ width: 1366, height: 900 })
  check(/после миграции базы 20261104120000/.test(await textOf(bare, 'tg-not-installed')), 'страница без миграции — говорит про миграцию')
  await bare.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await bare.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
  const bareStep = await bare.evaluate(() => {
    const el = document.querySelector('[data-testid=purchasing-steps] > li[data-testid=step-suppliers]')
    return { state: el?.dataset.state, next: el?.querySelector('[data-testid=step-next]')?.textContent.replace(/\s+/g, ' ').trim() }
  })
  check(bareStep.state === 'done' && bareStep.next === 'Закрытые каналы читаются только через аккаунт Telegram — его страница заработает после миграции базы.', `дашборд без миграции — шаг 1 «Готово» и про миграцию: «${bareStep.next}»`)
  await bare.context().close()

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
finally {
  await browser.close()
  if (renamed) {
    psql(`ALTER TABLE public.telegram_account_check_off RENAME TO telegram_account;
ALTER FUNCTION public.telegram_secrets_status_check_off() RENAME TO telegram_secrets_status;
NOTIFY pgrst, 'reload schema';`)
  }
  cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

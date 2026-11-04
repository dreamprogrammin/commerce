/*
 * «Товары поставщиков» (4.11.2026) — только на ЛОКАЛЬНОЙ базе с миграцией
 * 20261104160000_supplier_offers и только на стенде с подделками: сервер
 * запущен с TELEGRAM_FAKE=1 (закрытые каналы читает подделка Telegram из
 * server/utils/telegramAccount.ts) и TELEGRAM_WEB=http://127.0.0.1:3199
 * (открытые — заглушка t.me/s, её поднимает сам страж). Настоящие Telegram и
 * t.me страж не трогает: первым делом ищет в ответе `fake: true` и адрес
 * заглушки и без них останавливается.
 *
 * Заглушка — канал probe_offers: сообщения 1001–1060 через полтора часа,
 * последнее 20 минут назад; 1007, 1017, … — текст без фото, у 1020 два фото,
 * фото 1030 — не с CDN Telegram. Подделка — закрытый канал из 80 сообщений по
 * часу (там же описан); приглашение на Member… — аккаунт в канале, на
 * Expired… — устарело.
 *
 * Проверяет:
 *  1) маршруты: гость — 401, не-администратор — 403; негодные канал, товары и
 *     статус — 400;
 *  2) до сбора: каналы «ещё не собирали», закрытые без аккаунта — подсказка;
 *  3) сбор: открытый канал — посты за 3 дня, закрытый — товары за 3 дня
 *     частями по 30; альбом с одной подписью — один товар и «2 фото»; текст
 *     без фото — мимо; фото — в закрытом бакете, ссылка открывается; фото не
 *     с CDN Telegram не скачано; устаревшее приглашение — причина у канала;
 *  4) повторный сбор — ничего нового; новые посты — только они;
 *  5) старше 30 дней — удалены вместе с фото; фото удалённого канала — тоже;
 *  6) группировка: по поставщикам, по дням, списком; запоминается;
 *  7) разбор: «Не брать» и «Отменить», «Добавил», «Вернуть в новые»;
 *     счётчики; в базе — кто и когда;
 *  8) дашборд: шаг 4 «Товары поставщиков» и кнопка страницы;
 *  9) ни один ответ не несёт секретов: сессии, api_hash, кода приглашения;
 * 10) без миграции — страница и дашборд говорят про миграцию, не 500;
 * 11) телефон 390px — без горизонтальной прокрутки; без ошибок консоли.
 *
 * Данные заводит сам — администратор, покупатель, два поставщика с каналами,
 * вход подделки Telegram — и в конце всё убирает, фото в бакете тоже. Если
 * на локальной базе уже есть секреты Telegram, страж останавливается, не
 * тронув их.
 *
 *   sg docker -c "node check-admin-supplier-offers.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные) с TELEGRAM_FAKE=1 и
 * TELEGRAM_WEB=http://127.0.0.1:3199. SHOTS=<папка> — скриншоты.
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const WEB_PORT = 3199
const WEB = `http://127.0.0.1:${WEB_PORT}`
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SUPPLIER_OPEN = 'Проверка товаров — открытый'
const SUPPLIER_CLOSED = 'Проверка товаров — закрытый'
const API_HASH = '0123456789abcdef0123456789abcdef'
const SECRETS = [API_HASH, 'fake-session-', 'fake-temp-', 'MemberProbe_offers', 'ExpiredProbe_offers']
const ORPHAN = '00000000-0000-4000-8000-00000000dead'
const SHOTS = process.env.SHOTS
const HOUR = 3_600_000
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mPo33EDAAP5AiCMelXAAAAAAElFTkSuQmCC', 'base64')

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, поставщиков и секреты Telegram')

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

// Бакет supplier-photos — через API хранилища сервисным ключом
async function bucketFiles(prefix) {
  const res = await fetch(`${SUPA}/storage/v1/object/list/supplier-photos`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ prefix, limit: 1000 }) })
  return res.ok ? (await res.json()).filter(f => f.id).map(f => `${prefix}/${f.name}`) : []
}
async function uploadFile(path) {
  const res = await fetch(`${SUPA}/storage/v1/object/supplier-photos/${path}`, { method: 'POST', headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: PNG })
  if (!res.ok)
    throw new Error(`загрузка ${path}: ${res.status} ${await res.text()}`)
}
async function removeFiles(paths) {
  if (paths.length)
    await fetch(`${SUPA}/storage/v1/object/supplier-photos`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: paths }) })
}

// ---------- заглушка t.me/s ----------

const stub = { posts: [], requests: [] }
function addPost(id, at) {
  stub.posts.push({
    id,
    date: new Date(Math.floor(at / 1000) * 1000).toISOString().replace('.000Z', '+00:00'),
    photos: id % 10 === 7 ? [] : id === 1020 ? [`${WEB}/file/${id}-1.png`, `${WEB}/file/${id}-2.png`] : id === 1030 ? ['https://evil.example/1030.jpg'] : [`${WEB}/file/${id}-1.png`],
    text: id % 10 === 7 ? `Склад: приём до 18:00 (${id})` : `Артикул PO-${id}<br/>Цена ${id} ₸ &amp; опт`,
  })
}
const t0 = Date.now()
for (let id = 1001; id <= 1060; id++)
  addPost(id, t0 - 20 * 60_000 - (1060 - id) * 1.5 * HOUR)

function stubMessage(p) {
  const photos = p.photos.map(u => `<a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/probe_offers/${p.id}" style="width:800px;background-image:url('${u}')"><div class="tgme_widget_message_photo" style="padding-top:75%"></div></a>`).join('')
  return `<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="probe_offers/${p.id}">
<div class="tgme_widget_message_bubble">${photos}<div class="tgme_widget_message_text js-message_text" dir="auto">${p.text}</div>
<div class="tgme_widget_message_footer"><span class="tgme_widget_message_meta"><a class="tgme_widget_message_date" href="https://t.me/probe_offers/${p.id}"><time datetime="${p.date}" class="time">12:00</time></a></span></div></div></div></div>`
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, WEB)
  stub.requests.push(url.pathname + url.search)
  const file = url.pathname.match(/^\/file\/\d+-\d+\.png$/)
  if (file) {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': PNG.length })
    return res.end(PNG)
  }
  if (url.pathname !== '/s/probe_offers') {
    res.writeHead(302, { location: '/' })
    return res.end()
  }
  const sorted = [...stub.posts].sort((a, b) => a.id - b.id)
  const before = Number(url.searchParams.get('before'))
  const after = Number(url.searchParams.get('after'))
  const page = after
    ? sorted.filter(p => p.id > after).slice(0, 20)
    : sorted.filter(p => !before || p.id < before).slice(-20)
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(`<html><body><div class="tgme_channel_info"></div><section class="tgme_channel_history">${page.map(stubMessage).join('\n')}</section></body></html>`)
})
await new Promise(r => server.listen(WEB_PORT, '127.0.0.1', r))

// ---------- данные ----------

const stamp = Date.now()
const emails = { admin: `offers-admin-${stamp}@example.test`, buyer: `offers-buyer-${stamp}@example.test` }
const users = []
const vaultNames = () => psql(`SELECT coalesce(string_agg(substr(name, 10), ',' ORDER BY name), '') FROM vault.secrets WHERE name LIKE 'telegram\\_%';`)
let started = false
const channelIds = []

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

async function cleanup() {
  const ids = psql(`SELECT coalesce(string_agg(c.id::text, ','), '') FROM public.supplier_channels c JOIN public.suppliers s ON s.id = c.supplier_id WHERE s.name IN ('${SUPPLIER_OPEN}', '${SUPPLIER_CLOSED}');`)
  for (const id of new Set([...channelIds, ...ids.split(',').filter(Boolean), ORPHAN]))
    await removeFiles(await bucketFiles(id))
  psql(`DELETE FROM public.suppliers WHERE name IN ('${SUPPLIER_OPEN}', '${SUPPLIER_CLOSED}');`)
  if (started)
    psql(`DELETE FROM vault.secrets WHERE name LIKE 'telegram\\_%'; DELETE FROM public.telegram_account;`)
}

const offersOf = channel => Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE channel_id = '${channel}';`))

const browser = await chromium.launch()
let renamed = false
try {
  if (psql(`SELECT to_regclass('public.supplier_offers') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261104160000_supplier_offers')
  if (vaultNames())
    throw new Error(`На локальной базе уже есть секреты Telegram (${vaultNames()}) — страж их не трогает`)
  started = true
  await cleanup()
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}, заглушка t.me ${WEB}`)

  const first = await api('/api/admin/supplier-offers', adminToken)
  if (first.json?.fake !== true || first.json?.web !== WEB)
    throw new Error(`Стенд без подделки Telegram и заглушки t.me (fake: ${first.json?.fake}, web: ${first.json?.web}) — запустите сервер с TELEGRAM_FAKE=1 и TELEGRAM_WEB=${WEB}. Ничего не собиралось`)

  const openSupplier = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER_OPEN}') RETURNING id;`)
  const closedSupplier = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER_CLOSED}') RETURNING id;`)
  // По очереди: страница собирает каналы в порядке created_at
  const openId = psql(`INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview, created_at) VALUES (:'s', 'probe_offers', 'Проверка — открытый канал', 'channel', true, now() - interval '3 minutes') RETURNING id;`, { s: openSupplier })
  const memberId = psql(`INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type, created_at) VALUES (:'s', 'MemberProbe_offers', 'Проверка — закрытый канал', 'channel', now() - interval '2 minutes') RETURNING id;`, { s: closedSupplier })
  const expiredId = psql(`INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type, created_at) VALUES (:'s', 'ExpiredProbe_offers', 'Проверка — устаревшее приглашение', 'channel', now() - interval '1 minute') RETURNING id;`, { s: closedSupplier })
  channelIds.push(openId, memberId, expiredId)

  console.log('\n== маршруты')
  const routes = [
    ['GET', '/api/admin/supplier-offers', null],
    ['POST', '/api/admin/supplier-offers/collect', { channelId: openId }],
    ['POST', '/api/admin/supplier-offers/status', { ids: [openId], status: 'skipped' }],
  ]
  for (const [method, path, body] of routes) {
    const guest = await api(path, null, body, method)
    const buyer = await api(path, buyerToken, body, method)
    check(guest.status === 401 && buyer.status === 403, `${method} ${path}: гость — ${guest.status}, не-администратор — ${buyer.status}`)
  }
  check(!stub.requests.length && offersOf(openId) === 0, 'отказанные запросы в t.me не ходили и ничего не записали')
  const bad = [
    await api('/api/admin/supplier-offers?status=all', adminToken),
    await api('/api/admin/supplier-offers/collect', adminToken, { channelId: 'x' }),
    await api('/api/admin/supplier-offers/status', adminToken, { ids: ['x'], status: 'skipped' }),
    await api('/api/admin/supplier-offers/status', adminToken, { ids: [openId], status: 'ordered' }),
  ]
  check(bad.every(r => r.status === 400), `негодный статус, канал, товары — 400: ${bad.map(r => `${r.status} «${r.json?.message}»`).join(', ')}`)
  const missing = await api('/api/admin/supplier-offers/collect', adminToken, { channelId: '00000000-0000-4000-8000-000000000000' })
  check(missing.status === 404, `несуществующий канал — 404 «${missing.json?.message}»`)

  const errors = []
  const failedResponses = []
  async function newPage(viewport, path = '/admin/supplier-offers') {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', async (r) => {
      if (r.url().includes('/api/admin/supplier-offers'))
        bodies.push(await r.text().catch(() => ''))
      // Устаревшее приглашение — ответ, который страница показывает у канала
      if (r.status() === 409 && r.url().includes('/api/admin/supplier-offers/collect'))
        return
      if (r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts')))
        failedResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`)
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
  const toastWith = (page, text) => page.locator('[data-sonner-toast]', { hasText: text })
  const sp = s => (s ?? '').replace(/\s+/g, ' ').trim()
  const cards = page => page.locator('[data-testid=offer-card]')
  const statusCount = async (page, id) => Number((await page.locator(`[data-testid=offers-status-${id}] span`).textContent()).trim())
  const groupTitles = page => page.locator('[data-testid=offers-group] h2').evaluateAll(hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()))
  const noScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  // Список перечитывается после сбора, смены отбора и перезагрузки — ждать сам ответ:
  // networkidle на этой странице уже наступал, и waitForLoadState вернётся сразу
  const listed = page => page.waitForResponse(r => new URL(r.url()).pathname === '/api/admin/supplier-offers' && r.request().method() === 'GET', { timeout: 180000 })
  const painted = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  async function collect(page, toastText) {
    const reread = listed(page)
    await page.locator('[data-testid=offers-collect]').click()
    await toastWith(page, toastText).waitFor({ timeout: 180000 })
    await reread
    await painted(page)
  }
  async function reload(page) {
    const reread = listed(page)
    await page.reload({ waitUntil: 'load' })
    await reread
    await painted(page)
  }

  console.log('\n== до сбора, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  check(await page.getByRole('heading', { name: 'Товары поставщиков' }).isVisible(), 'страница открылась: заголовок «Товары поставщиков»')
  const channelRows = await page.locator('[data-testid=offers-channel]').evaluateAll(ls => ls.map(l => l.textContent.replace(/\s+/g, ' ').trim()))
  check(channelRows.length === 3 && channelRows.every(r => r.endsWith('ещё не собирали')), `каналы — «ещё не собирали»: ${channelRows.join(' | ')}`)
  check(await page.locator('[data-testid=offers-channel] [aria-label="Закрытый канал"]').count() === 2, 'у закрытых каналов — замок')
  check(await page.locator('[data-testid=offers-no-account] a[href="/admin/telegram"]').count() === 1, 'закрытые каналы без аккаунта — подсказка и кнопка «Аккаунт Telegram»')
  check(sp(await page.locator('[data-testid=offers-empty]').textContent()).startsWith('Нажмите «Собрать новые»'), 'пусто — что нажать')

  // Вход подделки Telegram — как на странице «Аккаунт Telegram»
  await api('/api/admin/telegram/app', adminToken, { apiId: '1234567', apiHash: API_HASH }, 'PUT')
  await api('/api/admin/telegram/login', adminToken, { phone: '+7 777 123 45 67' })
  const code = await api('/api/admin/telegram/login/code', adminToken, { code: '12345' })
  check(code.status === 200 && vaultNames().includes('session'), 'аккаунт подделки Telegram подключён')

  console.log('\n== сбор')
  await reload(page)
  check(await page.locator('[data-testid=offers-no-account]').count() === 0, 'с аккаунтом подсказки нет')
  await collect(page, 'Не собрано: 1 канал')
  const openPosts = stub.posts.filter(p => p.photos.length && Date.parse(p.date) >= Date.now() - 72 * HOUR)
  // Подделка: 9–80 за 3 дня, без 15, 25, … 75 (текст) и с альбомом 41–42 — 64 товара
  const closedCount = 64
  check(offersOf(openId) === openPosts.length, `открытый канал — посты за 3 дня с фото: ${offersOf(openId)} из ${openPosts.length}`)
  check(offersOf(memberId) === closedCount, `закрытый канал — товары за 3 дня: ${offersOf(memberId)} из ${closedCount}`)
  check(offersOf(expiredId) === 0, 'устаревшее приглашение — ничего не собрано')
  const errorsUnder = await page.locator('[data-testid=offers-channel-error]').evaluateAll(ps => ps.map(p => p.textContent.trim()))
  check(errorsUnder.length === 1 && /Приглашение в канал устарело/.test(errorsUnder[0]), `причина — у канала: «${errorsUnder[0]}»`)
  const total = openPosts.length + closedCount
  check(await statusCount(page, 'new') === total && await cards(page).count() === total, `«Новые» — ${total}, карточек столько же`)
  const pages = stub.requests.filter(r => r.startsWith('/s/'))
  check(pages.some(r => r.includes('before=')) && pages.some(r => r.includes('after=')), `открытый канал — назад до 3 дней (?before=), дальше от прочитанного (?after=): ${pages.join(' ')}`)

  const rows = JSON.parse(psql(`SELECT json_agg(json_build_object('m', message_id, 'url', post_url, 'path', photo_path, 'photo', photo_url, 'n', photo_count, 'caption', caption) ORDER BY message_id) FROM public.supplier_offers WHERE channel_id IN ('${openId}', '${memberId}');`))
  const row = m => rows.find(r => r.m === m)
  check(row(1020)?.n === 2 && row(41)?.n === 2 && row(50)?.n === 1 && row(51)?.n === 1, 'альбом с одной подписью — один товар на 2 фото; альбом с разными подписями — два товара')
  check(!row(1017) && !row(15) && !row(42), 'текст без фото и второе фото альбома — не товары')
  check(row(1030) && !row(1030).path && row(60) && !row(60).path, 'фото не с CDN Telegram и нескачанное — товар без фото')
  check(row(1013)?.caption === 'Артикул PO-1013\nЦена 1013 ₸ & опт' && row(1013)?.url === 'https://t.me/probe_offers/1013', 'подпись с переносом и сущностями, ссылка — на пост t.me/<канал>/<номер>')
  check(row(9)?.url === 'https://t.me/c/1000000001/9', 'закрытый — ссылка t.me/c/<канал>/<номер>')
  const files = [...await bucketFiles(openId), ...await bucketFiles(memberId)]
  const withPhoto = rows.filter(r => r.path)
  check(files.length === withPhoto.length && withPhoto.every(r => files.includes(r.path)), `фото в бакете — ${files.length}, у каждой строки с фото — свой файл`)
  // Подписанной ссылке хранилище ставит не Cache-Control, а Expires на конец подписи:
  // браузер держит фото у себя весь срок товара и повторно его не качает
  const signed = await fetch(withPhoto[0].photo)
  const expires = Date.parse(signed.headers.get('expires') ?? '')
  check(signed.status === 200 && signed.headers.get('content-type') === 'image/png' && expires - Date.now() > 29 * 86_400_000, `подписанная ссылка открывается и кешируется до конца срока: ${signed.status} ${signed.headers.get('content-type')}, Expires ${signed.headers.get('expires')}`)
  const revalidated = await fetch(withPhoto[0].photo, { headers: { 'If-None-Match': signed.headers.get('etag') ?? '' } })
  check(revalidated.status === 304, `повторный запрос фото — без тела: ${revalidated.status}`)
  const unsigned = await fetch(`${SUPA}/storage/v1/object/public/supplier-photos/${withPhoto[0].path}`)
  check(unsigned.status >= 400, `без подписи фото не открыть: ${unsigned.status}`)
  const upTo = JSON.parse(psql(`SELECT json_object_agg(id, collected_up_to) FROM public.supplier_channels WHERE id IN ('${openId}', '${memberId}', '${expiredId}');`))
  check(upTo[openId] === 1060 && upTo[memberId] === 80 && upTo[expiredId] === null, `прочитано до: открытый — ${upTo[openId]}, закрытый — ${upTo[memberId]}, устаревший — ${upTo[expiredId]}`)
  const shown = await page.locator('[data-testid=offer-card] img').first()
  await shown.scrollIntoViewIfNeeded()
  check(await shown.evaluate(img => img.decode().then(() => img.naturalWidth > 0, () => false)), 'фото на карточке загрузилось')
  check(await page.locator('[data-testid=offer-card]', { hasText: 'PO-1020' }).locator('text=2 фото').count() === 1, 'на карточке альбома — «2 фото»')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/offers-1366.png` })

  console.log('\n== повторный сбор, срок и чистка')
  psql(`DELETE FROM public.supplier_channels WHERE id = :'id';`, { id: expiredId })
  await uploadFile(`${ORPHAN}/1.png`)
  await uploadFile(`${openId}/999.png`)
  psql(`INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, caption, post_url, photo_path, photo_url) VALUES (:'c', 999, now() - interval '31 days', 'Старый', 'https://t.me/probe_offers/999', :'p', 'http://127.0.0.1:54321/x');`, { c: openId, p: `${openId}/999.png` })
  await reload(page)
  await collect(page, 'Новых товаров нет')
  check(offersOf(openId) === openPosts.length && offersOf(memberId) === closedCount, 'второй сбор — ничего нового, ничего не задвоилось')
  check(Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE message_id = 999;`)) === 0, 'товар старше 30 дней — удалён')
  check(!(await bucketFiles(openId)).includes(`${openId}/999.png`), 'его фото — тоже')
  check(!(await bucketFiles(ORPHAN)).length, 'фото канала, которого больше нет, — удалены')
  addPost(1061, Date.now() - 5 * 60_000)
  addPost(1067, Date.now() - 4 * 60_000)
  addPost(1068, Date.now() - 3 * 60_000)
  await collect(page, 'Новых товаров: 2')
  check(offersOf(openId) === openPosts.length + 2, 'новые посты — только они: 2 с фото, текст мимо')

  console.log('\n== группировка')
  await page.locator('[data-testid=offers-group-supplier]').click()
  const bySupplier = await groupTitles(page)
  check(bySupplier.length === 2 && bySupplier.includes(`${SUPPLIER_OPEN} · ${openPosts.length + 2}`) && bySupplier.includes(`${SUPPLIER_CLOSED} · ${closedCount}`), `по поставщикам: ${bySupplier.join(' | ')}`)
  await page.locator('[data-testid=offers-group-day]').click()
  const byDay = await groupTitles(page)
  check(byDay[0]?.startsWith('Сегодня · ') && byDay[1]?.startsWith('Вчера · ') && byDay.length >= 3, `по дням: ${byDay.join(' | ')}`)
  await page.locator('[data-testid=offers-group-none]').click()
  check((await groupTitles(page)).length === 0 && await page.locator('[data-testid=offers-group]').count() === 1, 'списком — одна группа без заголовка')
  await reload(page)
  check(await page.locator('[data-testid=offers-group-none]').getAttribute('aria-pressed') === 'true', 'выбор группировки — запомнен')
  await page.locator('[data-testid=offers-group-supplier]').click()

  console.log('\n== разбор')
  const newTotal = total + 2
  const firstCard = cards(page).first()
  const firstCaption = sp(await firstCard.locator('p').first().textContent())
  await firstCard.locator('[data-testid=offer-skipped]').click()
  await toastWith(page, 'Отмечено: не брать').waitFor({ timeout: 15000 })
  check(await statusCount(page, 'new') === newTotal - 1 && await statusCount(page, 'skipped') === 1 && await cards(page).count() === newTotal - 1, '«Не брать» — карточка ушла, счётчики сдвинулись')
  await toastWith(page, 'Отмечено: не брать').getByRole('button', { name: 'Отменить' }).click()
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=offer-card]').length === n, newTotal, { timeout: 15000 })
  check(await statusCount(page, 'skipped') === 0 && sp(await cards(page).first().locator('p').first().textContent()) === firstCaption, '«Отменить» — карточка вернулась на место')
  await cards(page).first().locator('[data-testid=offer-added]').click()
  await toastWith(page, 'Отмечено: добавил на сайт').waitFor({ timeout: 15000 })
  const marked = JSON.parse(psql(`SELECT json_agg(json_build_object('status', status, 'by', status_by, 'at', status_at)) FROM public.supplier_offers WHERE status <> 'new' AND channel_id IN ('${openId}', '${memberId}');`))
  check(marked?.length === 1 && marked[0].status === 'added' && marked[0].by === adminId && marked[0].at, 'в базе — «добавил», кто и когда')
  const addedList = listed(page)
  await page.locator('[data-testid=offers-status-added]').click()
  await addedList
  await painted(page)
  check(await cards(page).count() === 1 && await page.locator('[data-testid=offer-restore]').count() === 1, '«Добавлены» — одна карточка с «Вернуть в новые»')
  await page.locator('[data-testid=offer-restore]').click()
  await toastWith(page, 'Вернул в новые').waitFor({ timeout: 15000 })
  check(await cards(page).count() === 0 && await statusCount(page, 'new') === newTotal && await statusCount(page, 'added') === 0, 'вернул — во «Добавлены» пусто, «Новые» — все')
  check(psql(`SELECT count(*) FROM public.supplier_offers WHERE status_by IS NOT NULL AND channel_id IN ('${openId}', '${memberId}');`) === '0', 'вернул — кто и когда стёрты')

  console.log('\n== дашборд')
  await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
  const dash = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=purchasing-steps] > li[data-testid=step-offers]')
    const t = s => el?.querySelector(`[data-testid=${s}]`)?.textContent.replace(/\s+/g, ' ').trim()
    return { state: el?.dataset.state, facts: t('step-facts'), href: el?.querySelector('[data-testid=step-link]')?.getAttribute('href') }
  })
  const fresh = Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE status = 'new' AND posted_at > now() - interval '30 days';`))
  check(dash.state === 'action' && dash.facts?.includes(`не разобрано: ${fresh} `) && dash.href === '/admin/supplier-offers', `шаг 4 — «Нужно ваше действие»: «${dash.facts}», кнопка на страницу`)
  check(await page.locator('[data-testid=purchasing-pages] a[href="/admin/supplier-offers"]').count() === 1, 'кнопка «Товары поставщиков» среди страниц закупа')

  console.log('\n== телефон 390 px')
  const phone = await newPage({ width: 390, height: 844 })
  check(await noScroll(phone), 'без горизонтальной прокрутки')
  const box = await cards(phone).first().boundingBox()
  check(box && box.width > 150 && box.width < 200, `карточки в два столбца: ${Math.round(box?.width ?? 0)} px`)
  const buttons = await cards(phone).first().locator('button').evaluateAll(bs => bs.map(b => b.scrollWidth <= b.clientWidth + 1))
  check(buttons.length === 2 && buttons.every(Boolean), 'надписи «Добавил» и «Не брать» помещаются в кнопки')
  if (SHOTS)
    await phone.screenshot({ path: `${SHOTS}/offers-390.png` })
  await phone.context().close()

  console.log('\n== секреты')
  const leaked = SECRETS.filter(s => bodies.some(b => b.includes(s)))
  check(!leaked.length, `ни один ответ маршрутов не несёт секретов${leaked.length ? ` — нашлось: ${leaked.join(', ')}` : ''}`)

  console.log('\n== без миграции')
  psql(`ALTER TABLE public.supplier_offers RENAME TO supplier_offers_check_off;
NOTIFY pgrst, 'reload schema';`)
  renamed = true
  await new Promise(r => setTimeout(r, 1500))
  const off = await api('/api/admin/supplier-offers', adminToken)
  check(off.status === 200 && off.json?.installed === false, 'список без миграции — installed: false, не 500')
  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle', timeout: 120000 })
  check(/после миграции базы 20261104160000/.test(sp(await page.locator('[data-testid=offers-not-installed]').textContent())), 'страница без миграции — говорит про миграцию')
  await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
  const bare = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=purchasing-steps] > li[data-testid=step-offers]')
    return { state: el?.dataset.state, next: el?.querySelector('[data-testid=step-next]')?.textContent.replace(/\s+/g, ' ').trim() }
  })
  check(bare.state === 'later' && bare.next === 'Заработает после миграции базы.', `дашборд без миграции — шаг 4: «${bare.next}»`)

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failedResponses.length, `без ответов с ошибкой${failedResponses.length ? ` — ${failedResponses[0]}` : ''}`)
}
finally {
  await browser.close()
  server.close()
  if (renamed) {
    psql(`ALTER TABLE public.supplier_offers_check_off RENAME TO supplier_offers;
NOTIFY pgrst, 'reload schema';`)
  }
  await cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

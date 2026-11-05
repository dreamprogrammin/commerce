/*
 * «Товары поставщиков» (4.11.2026) — только на ЛОКАЛЬНОЙ базе с миграциями
 * 20261104160000_supplier_offers и 20261105120000_supplier_offers_read и
 * только на стенде с подделками: сервер запущен с TELEGRAM_FAKE=1 (закрытые
 * каналы читает подделка Telegram из server/utils/telegramAccount.ts),
 * TELEGRAM_WEB=http://127.0.0.1:3199 (открытые — заглушка t.me/s) и
 * AI_STUB_URL=http://127.0.0.1:8788 (модель ИИ — заглушка Anthropic); обе
 * заглушки поднимает сам страж. Настоящие Telegram, t.me и провайдера ИИ
 * страж не трогает: первым делом ищет в ответе `fake: true` и адреса заглушек
 * и без них останавливается.
 *
 * Заглушка — канал probe_offers: сообщения 1001–1060 через полтора часа,
 * последнее 20 минут назад; 1007, 1017, … — текст без фото, у 1020 два фото,
 * фото 1030 — не с CDN Telegram. Подделка — закрытый канал из 80 сообщений по
 * часу (там же описан); приглашение на Member… — аккаунт в канале, на
 * Expired… — устарело. Заглушка ИИ «читает» подпись — артикул и цену из неё;
 * у постов 1013–1024 свои ответы, каждый — на свою ветку карточки (aiAnswer).
 *
 * Проверяет:
 *  1) маршруты: гость — 401, не-администратор — 403; негодные канал, товары и
 *     статус — 400;
 *  2) до сбора: каналы «ещё не собирали», закрытые без аккаунта — подсказка;
 *  3) сбор: открытый канал — посты за 3 дня, закрытый — товары за 3 дня
 *     частями по 30; альбом с одной подписью — один товар и «2 фото»; текст
 *     без фото — мимо; фото — в закрытом бакете, ссылка открывается; фото не
 *     с CDN Telegram не скачано; устаревшее приглашение — причина у канала;
 *  4) чтение ИИ при сборе (5.11.2026): товары с фото прочитаны сразу, один
 *     запрос на товар — модель, низкий уровень рассуждений, схема ответа,
 *     фото; на карточке — название, артикул без второй «Арт.», цена из
 *     подписи или с фото, обе при расхождении, сомнение модели, «товара не
 *     нашёл»; отказ модели и ответ не JSON — причина на карточке, а остальные
 *     читаются; без ключа ИИ — подсказка и кнопка «Модели ИИ»;
 *  5) повторный сбор — ничего нового; новые посты — только они;
 *  6) старше 30 дней — удалены вместе с фото; фото удалённого канала — тоже;
 *  7) группировка: по поставщикам, по дням, списком; запоминается;
 *  8) разбор: «Не брать» и «Отменить», «Добавил», «Вернуть в новые»;
 *     счётчики; в базе — кто и когда;
 *  9) без ключа ИИ товары собираются без чтения; «Прочитать» берёт фото из
 *     бакета, порциями по 10; лимит провайдера и обрыв связи — дальше не
 *     читает; непрочитываемый товар за проход берётся один раз;
 * 10) дашборд: шаг 4 «Товары поставщиков» и кнопка страницы; шаг «ИИ
 *     читает посты» и расход на чтение за 30 дней;
 * 11) ни один ответ не несёт секретов: сессии, api_hash, кода приглашения,
 *     ключа ИИ; список товаров — даже последних знаков ключа;
 * 12) без миграции чтения — товары собираются без чтения, «Прочитать» — 409,
 *     страница и дашборд говорят про миграцию; без миграции товаров — тоже
 *     про миграцию, не 500;
 * 13) телефон 390px — без горизонтальной прокрутки, цена с ₸ одной строкой;
 *     без ошибок консоли.
 *
 * Данные заводит сам — администратор, покупатель, два поставщика с каналами,
 * вход подделки Telegram, ключ ИИ для заглушки — и в конце всё убирает, фото
 * в бакете тоже. Если на локальной базе уже есть секреты Telegram, ключи ИИ
 * или выбрана другая модель чтения, страж останавливается, не тронув их.
 *
 *   sg docker -c "node check-admin-supplier-offers.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные) с TELEGRAM_FAKE=1,
 * TELEGRAM_WEB=http://127.0.0.1:3199 и AI_STUB_URL=http://127.0.0.1:8788.
 * SHOTS=<папка> — скриншоты.
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'
import ExcelJS from 'exceljs'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const WEB_PORT = 3199
const WEB = `http://127.0.0.1:${WEB_PORT}`
const AI_PORT = 8788
const AI_WEB = `http://127.0.0.1:${AI_PORT}`
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const SUPPLIER_OPEN = 'Проверка товаров — открытый'
const SUPPLIER_CLOSED = 'Проверка товаров — закрытый'
const API_HASH = '0123456789abcdef0123456789abcdef'
// Модель чтения по умолчанию и ключ, который принимает заглушка ИИ
const VISION = 'claude-haiku-5-5'
const AI_KEY = `sk-ant-api03-PROBEoffers${'x'.repeat(24)}Q7zX`
const SECRETS = [API_HASH, 'fake-session-', 'fake-temp-', 'MemberProbe_offers', 'ExpiredProbe_offers', AI_KEY]
// Колонки миграции чтения ИИ — на проверку «без миграции» страж их переименовывает
const READ_COLS = ['read_items', 'read_model', 'read_at', 'read_error', 'read_input_tokens', 'read_output_tokens']
const ORPHAN = '00000000-0000-4000-8000-00000000dead'
const SHOTS = process.env.SHOTS
const HOUR = 3_600_000
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mPo33EDAAP5AiCMelXAAAAAAElFTkSuQmCC', 'base64')
const PNG_B64 = PNG.toString('base64')

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
// Ответы маршрутов «Товаров поставщиков» — в них ключа ИИ нет даже последними знаками
const offerBodies = []
async function api(path, token, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  bodies.push(text)
  if (path.startsWith('/api/admin/supplier-offers'))
    offerBodies.push(text)
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

// ---------- заглушка ИИ (Anthropic) ----------

/*
 * «Читает» пост по подписи: артикул PO-…/ЗК-… и цену из неё. mode: 'limit' —
 * провайдер отвечает 429, 'down' — рвёт соединение. Фото в журнал не пишется —
 * только тип и совпало ли с отданным заглушкой t.me и подделкой Telegram.
 */
const ai = { mode: 'ok', requests: [], retrieved: 0, tries: new Map() }
function aiAnswer(article, caption) {
  const price = Number(/Цена (\d+)/.exec(caption)?.[1]) || null
  const item = patch => ({ name: `Игрушка ${article}`, article, brand: null, price_text: price, price_image: null, price_note: null, age: '3+', confidence: 'high', doubt: null, ...patch })
  const tries = (ai.tries.get(article) ?? 0) + 1
  ai.tries.set(article, tries)
  switch (article) {
    // Подпись продавца модель переписывает вместе с артикулом — сервер её срезает
    case 'PO-1013': return { items: [item({ article: `Арт. ${article}` })] }
    case 'PO-1014': return { items: [item({ price_text: null, price_image: 2500 })] }
    case 'PO-1016': return { items: [item({ price_image: 1200 })] }
    case 'PO-1018': return { items: [item({ confidence: 'low', doubt: 'последняя цифра артикула не читается' })] }
    case 'PO-1019': return { items: [] }
    // Отказ — только с первой попытки: «Прочитать» дочитает
    case 'PO-1021': return tries === 1 ? 'refusal' : { items: [item()] }
    case 'PO-1022': return 'garbage'
    case 'PO-1023': return { items: [item(), ...['B-2', 'B-3', 'B-4'].map(a => item({ name: `Набор ${a}`, article: a }))] }
    case 'PO-1024': return { items: [item({ price_note: 'от 3 шт' })] }
    default: return { items: [item()] }
  }
}
const aiServer = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, AI_WEB)
  const send = (status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers })
    res.end(JSON.stringify(body))
  }
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    if (req.headers['x-api-key'] !== AI_KEY)
      return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    const model = { type: 'model', id: VISION, display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' }
    // Список — им страница «Модели ИИ» проверяет ключ; справка — есть ли у модели уровень рассуждений
    if (req.method === 'GET' && pathname === '/v1/models')
      return send(200, { data: [{ ...model, capabilities: { image_input: { supported: true } } }], has_more: false, first_id: VISION, last_id: VISION })
    if (req.method === 'GET' && pathname === `/v1/models/${VISION}`) {
      ai.retrieved++
      return send(200, { ...model, capabilities: { image_input: { supported: true }, effort: { low: { supported: true }, medium: { supported: true }, high: { supported: true } } } })
    }
    if (req.method !== 'POST' || pathname !== '/v1/messages')
      return send(404, { type: 'error', error: { type: 'not_found_error', message: pathname } })
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const content = body.messages?.[0]?.content ?? []
    const caption = content.find(b => b.type === 'text')?.text ?? ''
    const article = /(?:PO|ЗК)-\d+/.exec(caption)?.[0] ?? null
    ai.requests.push({
      article,
      model: body.model,
      effort: body.output_config?.effort,
      format: body.output_config?.format?.type,
      system: typeof body.system === 'string' && body.system.startsWith('Ты читаешь посты'),
      images: content.filter(b => b.type === 'image').map(b => `${b.source?.media_type}${b.source?.data === PNG_B64 ? ' как отдано' : ''}`),
    })
    if (ai.mode === 'down')
      return req.socket.destroy()
    // Лимиты — как в заголовках Anthropic: на 429 запросов не осталось
    const limits = (remaining, tokens) => ({
      'anthropic-ratelimit-requests-limit': '50',
      'anthropic-ratelimit-requests-remaining': String(remaining),
      'anthropic-ratelimit-requests-reset': new Date(Date.now() + 30_000).toISOString(),
      'anthropic-ratelimit-input-tokens-limit': '50000',
      'anthropic-ratelimit-input-tokens-remaining': String(tokens),
      'anthropic-ratelimit-input-tokens-reset': new Date(Date.now() + 20_000).toISOString(),
    })
    if (ai.mode === 'limit')
      return send(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your rate limit' } }, { 'retry-after': '0', ...limits(0, 0) })
    const answer = aiAnswer(article, caption)
    send(200, {
      id: `msg_probe_${ai.requests.length}`,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: answer === 'refusal' ? [] : [{ type: 'text', text: answer === 'garbage' ? 'Не могу прочитать этот пост' : JSON.stringify(answer) }],
      stop_reason: answer === 'refusal' ? 'refusal' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 2000, output_tokens: 300 },
    }, limits(45, 40000))
  })
})
await new Promise(r => aiServer.listen(AI_PORT, '127.0.0.1', r))

// ---------- данные ----------

const stamp = Date.now()
const emails = { admin: `offers-admin-${stamp}@example.test`, buyer: `offers-buyer-${stamp}@example.test` }
const users = []
const vaultNames = () => psql(`SELECT coalesce(string_agg(substr(name, 10), ',' ORDER BY name), '') FROM vault.secrets WHERE name LIKE 'telegram\\_%';`)
const aiKeyNames = () => psql(`SELECT coalesce(string_agg(name, ',' ORDER BY name), '') FROM vault.secrets WHERE name LIKE 'ai\\_key\\_%';`)
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

// Товары сайта, созданные «На сайт», и их фото в product-images
const PROBE_PRODUCTS = `sku IN ('PO-1013', 'PO-1014') AND name IN ('Игрушка PO-1013', 'Проверка дубля')`
async function removeProbeProducts() {
  const ids = psql(`SELECT coalesce(string_agg(id::text, ','), '') FROM public.products WHERE ${PROBE_PRODUCTS};`).split(',').filter(Boolean)
  for (const id of ids) {
    const res = await fetch(`${SUPA}/storage/v1/object/list/product-images`, { method: 'POST', headers: serviceHeaders, body: JSON.stringify({ prefix: `products/${id}`, limit: 1000 }) })
    const files = res.ok ? (await res.json()).filter(f => f.id).map(f => `products/${id}/${f.name}`) : []
    if (files.length)
      await fetch(`${SUPA}/storage/v1/object/product-images`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: files }) })
  }
  psql(`DELETE FROM public.products WHERE ${PROBE_PRODUCTS};`)
}

async function cleanup() {
  await removeProbeProducts()
  const ids = psql(`SELECT coalesce(string_agg(c.id::text, ','), '') FROM public.supplier_channels c JOIN public.suppliers s ON s.id = c.supplier_id WHERE s.name IN ('${SUPPLIER_OPEN}', '${SUPPLIER_CLOSED}');`)
  for (const id of new Set([...channelIds, ...ids.split(',').filter(Boolean), ORPHAN]))
    await removeFiles(await bucketFiles(id))
  psql(`DELETE FROM public.suppliers WHERE name IN ('${SUPPLIER_OPEN}', '${SUPPLIER_CLOSED}');`)
  if (started)
    psql(`DELETE FROM public.ai_usage_daily; DELETE FROM public.service_meters; DELETE FROM public.ai_settings WHERE key = 'ai_budget';`)
  if (started)
    psql(`DELETE FROM vault.secrets WHERE name LIKE 'telegram\\_%' OR name LIKE 'ai\\_key\\_%'; DELETE FROM public.telegram_account;`)
}

const offersOf = channel => Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE channel_id = '${channel}';`))

function renameRead(back) {
  const [from, to] = back ? ['_check_off', ''] : ['', '_check_off']
  psql(`BEGIN;
${READ_COLS.map(c => `ALTER TABLE public.supplier_offers RENAME COLUMN ${c}${from} TO ${c}${to};`).join('\n')}
ALTER FUNCTION public.supplier_offers_read_summary${from}() RENAME TO supplier_offers_read_summary${to};
COMMIT;
NOTIFY pgrst, 'reload schema';`)
}

const browser = await chromium.launch()
let renamed = false
let readRenamed = false
try {
  if (psql(`SELECT to_regclass('public.supplier_offers') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261104160000_supplier_offers')
  if (vaultNames())
    throw new Error(`На локальной базе уже есть секреты Telegram (${vaultNames()}) — страж их не трогает`)
  if (psql(`SELECT to_regclass('public.service_meters') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261106120000_usage_meters')
  if (psql(`SELECT (SELECT count(*) FROM public.ai_usage_daily) + (SELECT count(*) FROM public.service_meters) + (SELECT count(*) FROM public.ai_settings WHERE key = 'ai_budget');`) !== '0')
    throw new Error('На локальной базе уже есть расход ИИ, показания или бюджет — страж их не трогает')
  if (aiKeyNames())
    throw new Error(`На локальной базе уже есть ключи ИИ (${aiKeyNames()}) — страж их не трогает`)
  started = true
  await cleanup()
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}, заглушки t.me ${WEB} и ИИ ${AI_WEB}`)

  const first = await api('/api/admin/supplier-offers', adminToken)
  if (first.json?.fake !== true || first.json?.web !== WEB || first.json?.aiStub !== AI_WEB)
    throw new Error(`Стенд без подделки Telegram и заглушек t.me и ИИ (fake: ${first.json?.fake}, web: ${first.json?.web}, aiStub: ${first.json?.aiStub}) — запустите сервер с TELEGRAM_FAKE=1, TELEGRAM_WEB=${WEB} и AI_STUB_URL=${AI_WEB}. Ничего не собиралось`)
  if (first.json?.reading?.model !== `anthropic/${VISION}`)
    throw new Error(`Чтение ИИ: ${first.json?.reading ? `выбрана модель ${first.json.reading.model}` : 'нет миграции 20261105120000_supplier_offers_read'} — страж ждёт anthropic/${VISION} и чужой выбор не трогает`)

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
    ['POST', '/api/admin/supplier-offers/read', { before: new Date().toISOString() }],
  ]
  for (const [method, path, body] of routes) {
    const guest = await api(path, null, body, method)
    const buyer = await api(path, buyerToken, body, method)
    check(guest.status === 401 && buyer.status === 403, `${method} ${path}: гость — ${guest.status}, не-администратор — ${buyer.status}`)
  }
  check(!stub.requests.length && !ai.requests.length && offersOf(openId) === 0, 'отказанные запросы в t.me и к модели не ходили и ничего не записали')
  const bad = [
    await api('/api/admin/supplier-offers?status=all', adminToken),
    await api('/api/admin/supplier-offers/collect', adminToken, { channelId: 'x' }),
    await api('/api/admin/supplier-offers/status', adminToken, { ids: ['x'], status: 'skipped' }),
    await api('/api/admin/supplier-offers/status', adminToken, { ids: [openId], status: 'ordered' }),
    await api('/api/admin/supplier-offers/read', adminToken, { before: 'вчера' }),
  ]
  check(bad.every(r => r.status === 400), `негодный статус, канал, товары, начало прохода — 400: ${bad.map(r => `${r.status} «${r.json?.message}»`).join(', ')}`)
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
      if (r.url().includes('/api/admin/supplier-offers')) {
        const text = await r.text().catch(() => '')
        bodies.push(text)
        offerBodies.push(text)
      }
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
  // Прежние уведомления (4 с) уходят до нового сбора: текст берётся у своего
  const noToasts = page => page.waitForFunction(() => !document.querySelector('[data-sonner-toast]'), null, { timeout: 30000 })
  async function collect(page, toastText) {
    await noToasts(page)
    const reread = listed(page)
    await page.locator('[data-testid=offers-collect]').click()
    const toast = toastWith(page, toastText).last()
    await toast.waitFor({ timeout: 180000 })
    const text = sp(await toast.textContent())
    await reread
    await painted(page)
    return text
  }
  // «Прочитать»: текст уведомления и сколько раз страница позвала сервер
  async function reread(page, toastText) {
    await noToasts(page)
    let calls = 0
    const onRequest = r => new URL(r.url()).pathname === '/api/admin/supplier-offers/read' && calls++
    page.on('request', onRequest)
    const relisted = listed(page)
    await page.locator('[data-testid=offers-reread]').click()
    const toast = toastWith(page, toastText).last()
    await toast.waitFor({ timeout: 180000 })
    const text = sp(await toast.textContent())
    await relisted
    await painted(page)
    page.off('request', onRequest)
    return { text, calls }
  }
  // Карточка товара по артикулу из подписи — прочитанное ИИ
  const cardOf = (page, article) => page.locator('[data-testid=offer-card]', { hasText: article }).evaluate((el) => {
    const t = s => [...el.querySelectorAll(`[data-testid=${s}]`)].map(e => e.textContent.replace(/\s+/g, ' ').trim())
    return { names: t('offer-name'), articles: t('offer-article'), prices: t('offer-price'), from: t('offer-price-from'), conflict: t('offer-price-conflict'), doubt: t('offer-doubt'), none: t('offer-no-items'), error: t('offer-read-error'), items: t('offer-item').length, text: el.textContent.replace(/\s+/g, ' ').trim() }
  })
  const readLine = async page => sp(await page.locator('[data-testid=offers-reading]').textContent())
  // Не прочитано и не прочлось — у своих каналов стража
  const ownUnread = () => JSON.parse(psql(`SELECT json_build_object('unread', count(*) FILTER (WHERE read_items IS NULL), 'failed', count(*) FILTER (WHERE read_items IS NULL AND read_error IS NOT NULL)) FROM public.supplier_offers o JOIN public.supplier_channels c ON c.id = o.channel_id JOIN public.suppliers s ON s.id = c.supplier_id WHERE s.name IN ('${SUPPLIER_OPEN}', '${SUPPLIER_CLOSED}') AND o.status = 'new' AND o.photo_path IS NOT NULL;`))
  const stepAi = page => page.evaluate(() => {
    const el = document.querySelector('[data-testid=purchasing-steps] > li[data-testid=step-ai]')
    const t = s => el?.querySelector(`[data-testid=${s}]`)?.textContent.replace(/\s+/g, ' ').trim()
    return { state: el?.dataset.state, facts: t('step-facts'), next: t('step-next'), spend: document.querySelector('[data-testid=usage-ai-spend]')?.textContent.replace(/\s+/g, ' ').trim() }
  })
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
  const keyless = await readLine(page)
  check(keyless.includes('задайте ключ для Claude Haiku 5.5') && await page.locator('[data-testid=offers-reading] a[href="/admin/ai"]').count() === 1 && await page.locator('[data-testid=offers-reread]').count() === 0, `без ключа ИИ — «${keyless}», кнопка «Модели ИИ»`)

  // Вход подделки Telegram — как на странице «Аккаунт Telegram»
  await api('/api/admin/telegram/app', adminToken, { apiId: '1234567', apiHash: API_HASH }, 'PUT')
  await api('/api/admin/telegram/login', adminToken, { phone: '+7 777 123 45 67' })
  const code = await api('/api/admin/telegram/login/code', adminToken, { code: '12345' })
  check(code.status === 200 && vaultNames().includes('session'), 'аккаунт подделки Telegram подключён')
  // Ключ — как на странице «Модели ИИ»: сервер проверяет его у заглушки
  const keySet = await api('/api/admin/ai-settings/key', adminToken, { provider: 'anthropic', key: AI_KEY })
  check(keySet.status === 200 && aiKeyNames() === 'ai_key_anthropic', `ключ ИИ проверен заглушкой и лёг в Vault: ${keySet.status}`)

  console.log('\n== сбор')
  await reload(page)
  check(await page.locator('[data-testid=offers-no-account]').count() === 0, 'с аккаунтом подсказки нет')
  const firstToast = await collect(page, 'Не собрано: 1 канал')
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

  console.log('\n== чтение ИИ при сборе')
  const read = JSON.parse(psql(`SELECT json_agg(json_build_object('m', message_id, 'items', read_items, 'error', read_error, 'model', read_model, 'at', read_at, 'in', read_input_tokens, 'out', read_output_tokens, 'path', photo_path, 'caption', caption)) FROM public.supplier_offers WHERE channel_id IN ('${openId}', '${memberId}');`))
  const withFile = read.filter(r => r.path)
  const readOk = read.filter(r => r.items)
  const readBad = read.filter(r => r.error)
  check(withFile.length && withFile.every(r => r.at && r.model === `anthropic/${VISION}`) && read.filter(r => !r.path).every(r => !r.at), `товары с фото прочитаны при сборе — ${withFile.filter(r => r.at).length} из ${withFile.length}, без фото — не читались`)
  check(readBad.length === 2 && readBad.map(r => r.error).sort().join(' | ').startsWith('Модель отказалась читать пост | Ответ модели — не JSON') && readBad.every(r => r.in === null && !r.items), `не прочлись двое — отказ модели и ответ не JSON, причина записана: ${readBad.map(r => r.m).join(', ')}`)
  check(readOk.length === withFile.length - 2 && readOk.every(r => r.in === 2000 && r.out === 300), `прочитано ${readOk.length}, токены записаны`)
  check(read.find(r => r.m === 1013)?.items?.[0]?.article === 'PO-1013', `подпись «Арт.» срезана при разборе ответа: ${read.find(r => r.m === 1013)?.items?.[0]?.article}`)
  check(firstToast.includes(`ИИ прочёл ${readOk.length}`) && firstToast.includes('не прочлось 2 — причина на карточке'), `уведомление сбора: «${firstToast}»`)
  check(ai.requests.length === withFile.length, `один запрос к модели на товар: ${ai.requests.length}`)
  const shapes = [...new Set(ai.requests.map(r => `${r.model} ${r.effort} ${r.format} ${r.system} ${r.images.join('+')}`))]
  check(shapes.length === 1 && shapes[0] === `${VISION} low json_schema true image/png как отдано`, `запрос: модель, уровень low, схема ответа, подсказка, одно фото: ${shapes.join(' / ')}`)
  check(ai.retrieved <= 1, `справка о модели — не больше одной на сервер: ${ai.retrieved}`)

  const c13 = await cardOf(page, 'PO-1013')
  check(c13.names[0] === 'Игрушка PO-1013' && c13.articles[0] === 'Арт. PO-1013' && c13.prices[0] === '1 013 ₸' && c13.from[0] === 'в подписи', `карточка: название, артикул без второй «Арт.», цена из подписи — ${c13.names[0]} · ${c13.articles[0]} · ${c13.prices[0]} ${c13.from[0]}`)
  const c14 = await cardOf(page, 'PO-1014')
  check(c14.prices[0] === '2 500 ₸' && c14.from[0] === 'на фото', `в подписи цены нет — с фото: ${c14.prices[0]} ${c14.from[0]}`)
  const c16 = await cardOf(page, 'PO-1016')
  check(c16.prices[0] === '1 016 ₸' && c16.from[0] === 'в подписи' && c16.conflict[0] === 'На фото другая: 1 200 ₸', `цены расходятся — главная из подписи, с фото рядом: ${c16.prices[0]} · ${c16.conflict[0]}`)
  const c18 = await cardOf(page, 'PO-1018')
  check(c18.doubt[0] === 'ИИ не уверен: последняя цифра артикула не читается', `сомнение модели — на карточке: ${c18.doubt[0]}`)
  const c19 = await cardOf(page, 'PO-1019')
  check(c19.items === 0 && c19.none[0] === 'ИИ не нашёл на фото товара' && !c19.error.length, 'товара на фото нет — так и сказано')
  const c21 = await cardOf(page, 'PO-1021')
  const c22 = await cardOf(page, 'PO-1022')
  check(c21.error[0] === 'Не прочитано: Модель отказалась читать пост' && c22.error[0]?.startsWith('Не прочитано: Ответ модели — не JSON'), `не прочлось — причина на карточке: ${c21.error[0]} | ${c22.error[0]}`)
  const c23 = await cardOf(page, 'PO-1023')
  check(c23.items === 3 && c23.text.includes('И ещё 1 товар — в посте'), `несколько товаров в посте — три и «ещё 1»: ${c23.items}`)
  check((await cardOf(page, 'PO-1024')).text.includes('от 3 шт'), 'уточнение к цене — дословно')
  const zk = await cardOf(page, 'ЗК-50')
  check(zk.articles[0] === 'Арт. ЗК-50' && zk.prices[0] === '5 000 ₸', `закрытый канал — тоже прочитан: ${zk.articles[0]} · ${zk.prices[0]}`)
  const c30 = await cardOf(page, 'PO-1030')
  check(!c30.items && !c30.none.length && !c30.error.length, 'товар без фото — без чтения и без ошибки')
  const line = await readLine(page)
  check(line.startsWith('Артикул и цену с фото читает Claude Haiku 5.5 — при «Собрать новые».') && line.includes('Не прочлось: 2 — причина на карточке.') && await page.locator('[data-testid=offers-reread]').isVisible(), `строка чтения — модель и непрочитанное: «${line}»`)
  if (SHOTS) {
    await page.locator('[data-testid=offer-card]', { hasText: 'PO-1016' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${SHOTS}/offers-1366-items.png` })
  }

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
  const twoToast = await collect(page, 'Новых товаров: 2')
  check(offersOf(openId) === openPosts.length + 2, 'новые посты — только они: 2 с фото, текст мимо')
  check(twoToast.includes('ИИ прочёл 2') && ai.requests.filter(r => r.article === 'PO-1061' || r.article === 'PO-1068').length === 2, `новые прочитаны сразу, прежние второй раз — нет: «${twoToast}»`)

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
  const firstCaption = sp(await firstCard.locator('[data-testid=offer-caption]').textContent())
  await firstCard.locator('[data-testid=offer-skipped]').click()
  await toastWith(page, 'Отмечено: не брать').waitFor({ timeout: 15000 })
  check(await statusCount(page, 'new') === newTotal - 1 && await statusCount(page, 'skipped') === 1 && await cards(page).count() === newTotal - 1, '«Не брать» — карточка ушла, счётчики сдвинулись')
  await toastWith(page, 'Отмечено: не брать').getByRole('button', { name: 'Отменить' }).click()
  await page.waitForFunction(n => document.querySelectorAll('[data-testid=offer-card]').length === n, newTotal, { timeout: 15000 })
  check(await statusCount(page, 'skipped') === 0 && sp(await cards(page).first().locator('[data-testid=offer-caption]').textContent()) === firstCaption, '«Отменить» — карточка вернулась на место')
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

  console.log('\n== без ключа и «Прочитать»')
  const backToNew = listed(page)
  await page.locator('[data-testid=offers-status-new]').click()
  await backToNew
  await painted(page)
  const keyOff = await api('/api/admin/ai-settings/key?provider=anthropic', adminToken, null, 'DELETE')
  check(keyOff.status === 200 && !aiKeyNames(), 'ключ ИИ удалён')
  let asked = ai.requests.length
  for (let id = 1071; id <= 1082; id++)
    addPost(id, Date.now() - (1083 - id) * 60_000)
  const keylessToast = await collect(page, 'Новых товаров: 11')
  const unreadNew = JSON.parse(psql(`SELECT json_agg(read_at) FROM public.supplier_offers WHERE channel_id = '${openId}' AND message_id BETWEEN 1071 AND 1082;`))
  check(unreadNew.length === 11 && unreadNew.every(a => a === null) && ai.requests.length === asked && !keylessToast.includes('ИИ'), `без ключа — собрано, не прочитано, к модели не ходили: «${keylessToast}»`)
  check((await readLine(page)).includes('задайте ключ') && await page.locator('[data-testid=offers-reread]').count() === 0, 'без ключа — «задайте ключ», «Прочитать» нет')
  const noKeyRead = await api('/api/admin/supplier-offers/read', adminToken, { before: new Date().toISOString() })
  check(noKeyRead.status === 409 && /Модели ИИ/.test(noKeyRead.json?.message ?? '') && ai.requests.length === asked, `«Прочитать» без ключа — 409: «${noKeyRead.json?.message}»`)
  check((await api('/api/admin/ai-settings/key', adminToken, { provider: 'anthropic', key: AI_KEY })).status === 200, 'ключ ИИ задан снова')
  await reload(page)
  const own = ownUnread()
  const summary = JSON.parse(psql(`SELECT public.supplier_offers_read_summary();`))
  check(own.unread === 13 && own.failed === 2, `у своих каналов — не прочитано 13 (11 без ключа, отказ, не JSON), не прочлось 2: ${own.unread}, ${own.failed}`)
  check(sp(await page.locator('[data-testid=offers-unread]').textContent()) === `Не прочитано: ${summary.unread}, из них не прочлось — ${summary.failed}.`, `строка — как в сводке базы: «${sp(await page.locator('[data-testid=offers-unread]').textContent())}»`)

  ai.mode = 'limit'
  asked = ai.requests.length
  const limited = await reread(page, 'не прочлось')
  const limitedArticles = new Set(ai.requests.slice(asked).map(r => r.article))
  check(limited.text === 'не прочлось 2 — причина на карточке, осталось 8 — нажмите «Прочитать»' && limited.calls === 1 && limitedArticles.size === 2, `лимит провайдера — дальше не читает: «${limited.text}», запросов страницы ${limited.calls}, к модели — ${ai.requests.length - asked} по ${limitedArticles.size} товарам`)
  check(await page.locator('[data-testid=offer-read-error]', { hasText: 'Лимит запросов провайдера — прочитайте позже' }).count() === 2, 'причина — на двух карточках')
  const atLimit = JSON.parse(psql(`SELECT value FROM public.service_meters WHERE key = 'ai_limits:anthropic';`) || 'null')
  check(atLimit?.requests?.remaining === 0 && atLimit?.inputTokens?.limit === 50000 && atLimit.model === `anthropic/${VISION}`, `лимиты из отказа 429 — записаны: запросов осталось ${atLimit?.requests?.remaining}`)
  ai.mode = 'down'
  asked = ai.requests.length
  const down = await reread(page, 'не прочлось')
  check(down.text === limited.text && new Set(ai.requests.slice(asked).map(r => r.article)).size === 2 && await page.locator('[data-testid=offer-read-error]', { hasText: 'Не удалось связаться с провайдером — прочитайте позже' }).count() === 2, `связь с провайдером оборвалась — тоже: «${down.text}»`)
  ai.mode = 'ok'
  asked = ai.requests.length
  const done = await reread(page, 'ИИ прочёл')
  const passed = ai.requests.slice(asked)
  check(done.text === 'ИИ прочёл 12, не прочлось 1 — причина на карточке' && done.calls === 2, `«Прочитать» — порциями по 10, пока есть: «${done.text}», запросов страницы ${done.calls}`)
  check(passed.filter(r => r.article === 'PO-1022').length === 1 && passed.length === 13, `непрочитываемый товар за проход — один раз, проход кончился: запросов к модели ${passed.length}`)
  check(passed.every(r => r.images.length === 1 && r.images[0] === 'image/png как отдано'), 'фото — из бакета, те же байты')
  check(ownUnread().unread === 1 && sp(await page.locator('[data-testid=offers-unread]').textContent()) === 'Не прочлось: 1 — причина на карточке.', `остался один, что не читается: «${sp(await page.locator('[data-testid=offers-unread]').textContent())}»`)
  check((await cardOf(page, 'PO-1021')).prices[0] === '1 021 ₸' && (await cardOf(page, 'PO-1082')).prices[0] === '1 082 ₸', 'дочитанные — с ценой на карточке')

  console.log('\n== «На сайт»')
  const offerIdOf = m => psql(`SELECT id FROM public.supplier_offers WHERE channel_id = :'c' AND message_id = ${m};`, { c: openId })
  check(await page.locator('[data-testid=offer-card]', { hasText: 'PO-1023' }).locator('[data-testid=offer-to-site]').count() === 3, 'несколько товаров в посте — «На сайт» у каждого из показанных')
  const dupId = psql(`INSERT INTO public.products (name, slug, price, sku) VALUES ('Проверка дубля', :'s', 100, 'PO-1014') RETURNING id;`, { s: `probe-offer-dup-${stamp}` }).split('\n')[0]
  const form = await newPage({ width: 1366, height: 900 }, `/admin/products/new?offer=${offerIdOf(1014)}`)
  await form.locator('[data-testid=draft-duplicate]').waitFor({ timeout: 30000 })
  check(sp(await form.locator('[data-testid=draft-duplicate]').textContent()).startsWith('Артикул PO-1014 уже есть на сайте: «Проверка дубля».') && await form.locator(`[data-testid=draft-duplicate] a[href="/admin/products/${dupId}"]`).count() === 1, 'артикул уже на сайте — предупреждение и ссылка на товар')
  check(await form.locator('#cost_price').inputValue() === '2500', `цена с фото — тоже в закупочную: ${await form.locator('#cost_price').inputValue()}`)
  await form.context().close()

  // Клик со страницы, а не переход по адресу: ссылка ведёт куда надо
  await page.route('**/api/seo/notify-indexing', r => r.fulfill({ json: { success: true, indexnow: { submitted: false, urls_count: 0 }, yandex_ping: { submitted: false }, bing_ping: { submitted: false } } }))
  await page.locator('[data-testid=offer-card]', { hasText: 'PO-1013' }).locator('[data-testid=offer-to-site]').click()
  await page.waitForURL(u => u.pathname === '/admin/products/new' && u.searchParams.get('offer') === offerIdOf(1013), { timeout: 30000 })
  await page.waitForFunction(() => document.querySelector('#name')?.value === 'Игрушка PO-1013', null, { timeout: 30000 })
  await page.locator('img[src^="blob:"]').first().waitFor({ timeout: 30000 })
  const filled = await page.evaluate(() => ({
    sku: document.querySelector('#sku')?.value,
    slug: document.querySelector('#slug')?.value,
    cost: document.querySelector('#cost_price')?.value,
    price: document.querySelector('#price')?.value,
    photos: document.querySelectorAll('img[src^="blob:"]').length,
  }))
  const supplierShown = await page.getByRole('combobox').filter({ hasText: SUPPLIER_OPEN }).count()
  check(filled.sku === 'PO-1013' && filled.slug && filled.cost === '1013' && supplierShown === 1, `форма — название, артикул, закупочная цена, поставщик: ${filled.sku} · ${filled.cost} · поставщик ${supplierShown ? 'выбран' : 'нет'} · слаг ${filled.slug}`)
  check(filled.photos >= 1 && filled.price === '0', `фото поста — в галерее (${filled.photos}), розничная цена не подставлена: ${filled.price}`)
  check(sp(await page.locator('[data-testid=draft-source]').textContent()).startsWith(`Из поста поставщика — ${SUPPLIER_OPEN}`) && await page.locator('[data-testid=draft-duplicate]').count() === 0, 'над формой — откуда товар; дубля нет')
  await page.locator('#price').fill('1990')
  await page.getByRole('button', { name: 'Создать товар' }).click()
  await page.waitForURL(u => u.pathname === '/admin/products', { timeout: 60000 })
  const made = JSON.parse(psql(`SELECT json_build_object('n', count(*), 'cost', max(cost_price), 'price', max(price), 'supplier', max(supplier_id::text), 'images', (SELECT count(*) FROM public.product_images i JOIN public.products p ON p.id = i.product_id WHERE p.sku = 'PO-1013' AND p.name = 'Игрушка PO-1013')) FROM public.products WHERE sku = 'PO-1013' AND name = 'Игрушка PO-1013';`))
  const supplierOpenId = psql(`SELECT id FROM public.suppliers WHERE name = '${SUPPLIER_OPEN}';`)
  check(made.n === 1 && Number(made.cost) === 1013 && Number(made.price) === 1990 && made.supplier === supplierOpenId && made.images === 1, `товар создан: закупочная ${made.cost}, розничная ${made.price}, поставщик свой, фото ${made.images}`)
  check(psql(`SELECT status FROM public.supplier_offers WHERE id = '${offerIdOf(1013)}';`) === 'added', 'у поставщика товар отмечен «Добавлен»')
  await page.unroute('**/api/seo/notify-indexing')

  console.log('\n== заказ поставщику')
  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle', timeout: 120000 })
  await painted(page)
  check(await page.locator('[data-testid=offer-card]', { hasText: 'PO-1013' }).count() === 0 && await page.locator('[data-testid=order-bar]').count() === 0, 'добавленный ушёл из «Новых»; заказа ещё нет — панели нет')
  const pick16 = page.locator('[data-testid=offer-card]', { hasText: 'PO-1016' })
  await pick16.locator('[data-testid=offer-order-add]').click()
  await pick16.locator('[data-testid=offer-order-qty]').fill('5')
  const pick23 = page.locator('[data-testid=offer-card]', { hasText: 'PO-1023' })
  await pick23.locator('[data-testid=offer-order-add]').nth(0).click()
  await pick23.locator('[data-testid=offer-order-add]').nth(0).click()
  const pick22 = page.locator('[data-testid=offer-card]', { hasText: 'PO-1022' })
  check(await pick22.locator('[data-testid=offer-order-post] [data-testid=offer-order-add]').count() === 1, 'непрочитанный пост — «В заказ» на весь пост')
  await pick22.locator('[data-testid=offer-order-add]').click()
  await page.locator('[data-testid=offer-card]', { hasText: 'ЗК-50' }).locator('[data-testid=offer-order-add]').first().click()
  const bar = async () => ({ head: sp(await page.locator('[data-testid=order-bar] p').first().textContent()), rows: (await page.locator('[data-testid=order-supplier]').allTextContents()).map(sp) })
  const b1 = await bar()
  check(b1.head === 'В заказе 5 товаров · 2 поставщика', `панель заказа: «${b1.head}»`)
  check(b1.rows.some(r => r.startsWith(SUPPLIER_OPEN) && r.includes('4 товара, 8 шт.') && r.includes('без цены: 1')) && b1.rows.some(r => r.startsWith(SUPPLIER_CLOSED) && r.includes('1 товар, 1 шт.')), `по поставщикам — товары, штуки, сумма, без цены: ${b1.rows.join(' | ')}`)
  await reload(page)
  check((await bar()).head === b1.head && await pick16.locator('[data-testid=offer-order-qty]').inputValue() === '5', 'выбранное и количество — пережили перезагрузку')

  const got = page.waitForEvent('download', { timeout: 60000 })
  await page.locator('[data-testid=order-download]').click()
  const file = await got
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date())
  check(file.suggestedFilename() === `zakaz-${today}.xlsx`, `имя файла: ${file.suggestedFilename()}`)
  const book = new ExcelJS.Workbook()
  const parts = []
  for await (const c of await file.createReadStream())
    parts.push(c)
  await book.xlsx.load(Buffer.concat(parts))
  const sheets = book.worksheets.map(w => ({ name: w.name, rows: w.rowCount, images: w.getImages().length, title: w.getCell('A1').value, qty: w.getCell('F4').value, names: [4, 5, 6, 7].map(r => w.getCell(`C${r}`).value) }))
  const open = sheets.find(w => SUPPLIER_OPEN.startsWith(w.name))
  check(sheets.length === 2 && open && sheets.some(w => w.name === SUPPLIER_CLOSED.slice(0, 31)), `листы — по поставщику, имена до 31 знака: ${sheets.map(w => w.name).join(' | ')}`)
  check(open?.title?.startsWith(`Заказ магазина «Ухтышка» — ${SUPPLIER_OPEN}, `) && open.qty === 5 && open.names.includes('Игрушка PO-1016'), `лист открытого: заголовок, количество 5, товары: ${open?.names.join(' / ')}`)
  check(open?.images === 4 && sheets.find(w => w !== open)?.images === 1, `фото в таблице — у каждой строки: ${sheets.map(w => w.images).join(' и ')}`)
  check(await toastWith(page, 'Таблица скачана').count() >= 1, 'уведомление «Таблица скачана»')
  if (SHOTS)
    await page.locator('[data-testid=order-bar]').screenshot({ path: `${SHOTS}/order-bar.png` })

  await pick16.locator('[data-testid=offer-order-remove]').click()
  check((await bar()).head === 'В заказе 4 товара · 2 поставщика' && await pick16.locator('[data-testid=offer-order-add]').count() === 1, '«Убрать» — строка ушла из заказа')
  await page.locator('[data-testid=order-clear]').click()
  check(await page.locator('[data-testid=order-bar]').count() === 0 && await page.locator('[data-testid=offer-order-qty]').count() === 0, '«Очистить» — заказ пуст, панели нет')

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
  const spent = JSON.parse(psql(`SELECT json_build_object('posts', count(*), 'in', coalesce(sum(read_input_tokens), 0), 'out', coalesce(sum(read_output_tokens), 0), 'models', coalesce(json_agg(DISTINCT read_model), '[]')) FROM public.supplier_offers WHERE read_items IS NOT NULL AND read_at >= now() - interval '30 days';`))
  const aiStep = await stepAi(page)
  check(aiStep.state === 'done' && aiStep.facts?.includes(`прочитано за 30 дней: ${spent.posts} `) && aiStep.next?.startsWith('ИИ читает артикул и цену'), `шаг «ИИ читает посты» — «Готово»: «${aiStep.facts}»`)
  // Haiku 5.5: $0,10 за миллион токенов входа, $0,50 — выхода
  const usd = (spent.in * 0.10 + spent.out * 0.50) / 1e6
  const cost = spent.models.length === 1 && spent.models[0] === `anthropic/${VISION}` ? (usd < 0.01 ? 'меньше $0,01' : `≈ $${usd.toFixed(2).replace('.', ',')}`) : null
  check(aiStep.spend?.startsWith(`за 30 дней — ${spent.posts} `) && (!cost || aiStep.spend.endsWith(cost)), `расход на чтение: «${aiStep.spend}»${cost ? `, ждали ${cost}` : ''}`)

  console.log('\n== батарейки')
  const battery = id => page.evaluate((id) => {
    const el = document.querySelector(`[data-testid=battery-${id}]`)
    const t = s => el?.querySelector(`[data-testid=${s}]`)?.textContent.replace(/\s+/g, ' ').trim() ?? null
    return { state: el?.dataset.state, value: t('battery-value'), reset: t('battery-reset'), note: t('battery-note'), width: el?.querySelector('[data-testid=battery-bar]')?.style.width, now: el?.querySelector('[role=meter]')?.getAttribute('aria-valuenow') }
  }, id)
  const usage = JSON.parse(psql(`SELECT json_build_object('posts', coalesce(sum(posts), 0), 'in', coalesce(sum(input_tokens), 0), 'out', coalesce(sum(output_tokens), 0), 'rows', count(*)) FROM public.ai_usage_daily;`))
  const readNow = Number(psql(`SELECT count(*) FROM public.supplier_offers WHERE read_items IS NOT NULL;`))
  check(usage.posts === readNow && usage.in === readNow * 2000 && usage.out === readNow * 300 && usage.rows === 1, `журнал расхода — все удачные чтения, одной строкой за день: ${usage.posts} из ${readNow}, токены ${usage.in}/${usage.out}`)
  const lim = await battery('ai_limits')
  check(lim.state === 'ok' && lim.value === '40 000 из 50 000 токенов входа' && lim.now === '80' && /^сброс в \d\d:\d\d$/.test(lim.reset ?? ''), `лимит ИИ — по слабому месту, со сбросом: ${lim.value} · ${lim.reset} · ${lim.now}%`)
  const noBudget = await battery('ai_budget')
  check(noBudget.state === 'off' && noBudget.value === 'не задан' && await page.locator('[data-testid=budget-edit]').textContent().then(sp) === 'Задать бюджет', 'бюджет не задан — «Задать бюджет»')
  await page.locator('[data-testid=budget-edit]').click()
  await page.locator('[data-testid=budget-usd]').fill('1')
  await page.locator('[data-testid=budget-reset]').fill('1')
  const saved = page.waitForResponse(r => r.url().includes('/api/admin/ai-settings/budget'))
  await page.locator('[data-testid=budget-save]').click()
  await saved
  await toastWith(page, 'Бюджет ИИ сохранён').waitFor({ timeout: 15000 })
  await page.locator('[data-testid=battery-ai_budget][data-state=ok]').waitFor({ timeout: 15000 })
  const left = 1 - usage.posts * (2000 * 0.10 + 300 * 0.50) / 1e6
  const budget = await battery('ai_budget')
  const nextMonth = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1, 12)))
  check(budget.value === `$${left.toFixed(2).replace('.', ',')} из $1,00` && budget.reset === `сброс ${nextMonth}` && budget.note?.includes(`${usage.posts} чтени`), `бюджет $1 со сбросом 1-го: ${budget.value} · ${budget.reset} · ${budget.note}`)
  const stored = JSON.parse(psql(`SELECT value FROM public.ai_settings WHERE key = 'ai_budget';`))
  check(stored.usd === 1 && stored.resetDay === 1 && stored.since === new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(new Date()), `бюджет в ai_settings — с сегодняшнего дня: ${JSON.stringify(stored)}`)
  const badBudget = await Promise.all([{ usd: -1 }, { usd: 'x' }, { usd: 5, resetDay: 31 }, { usd: 5, resetDay: 1.5 }].map(b => api('/api/admin/ai-settings/budget', adminToken, b, 'PUT')))
  check(badBudget.every(r => r.status === 400), `негодный бюджет — 400: ${badBudget.map(r => r.status).join(', ')}`)
  check((await api('/api/admin/ai-settings/budget', buyerToken, { usd: 5 }, 'PUT')).status === 403, 'бюджет — только администратору')

  const channelsAll = JSON.parse(psql(`SELECT json_build_object('n', count(*), 'today', count(*) FILTER (WHERE (collected_at AT TIME ZONE 'Asia/Almaty')::date = (now() AT TIME ZONE 'Asia/Almaty')::date)) FROM public.supplier_channels;`))
  const tg = await battery('telegram')
  check(tg.state === 'ok' && tg.value?.startsWith(`сегодня ${channelsAll.today} из ${channelsAll.n} `) && tg.note?.startsWith('Ограничений Telegram нет; последний сбор в '), `сбор Telegram: ${tg.value} · ${tg.note}`)
  const floodId = psql(`INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type) VALUES ((SELECT id FROM public.suppliers WHERE name = '${SUPPLIER_CLOSED}'), 'FloodProbe_offers', 'Проверка — ограничение', 'channel') RETURNING id;`).split('\n')[0]
  const flood = await api('/api/admin/supplier-offers/collect', adminToken, { channelId: floodId })
  const floodRow = JSON.parse(psql(`SELECT value FROM public.service_meters WHERE key = 'telegram_flood';`) || 'null')
  const floodLeft = floodRow ? Date.parse(floodRow.until) - Date.now() : 0
  check(flood.status === 400 && /подождать/.test(flood.json?.message ?? '') && floodRow?.channel === 'Проверка — ограничение' && floodLeft > 880_000 && floodLeft <= 900_000, `FLOOD_WAIT — запомнено, до какого времени: ${flood.status} «${flood.json?.message}», осталось ${Math.round(floodLeft / 1000)} с`)
  await page.reload({ waitUntil: 'load' })
  await page.locator('[data-testid=battery-telegram][data-state=empty]').waitFor({ timeout: 30000 })
  const tgFlood = await battery('telegram')
  check(tgFlood.value === 'Telegram просит подождать' && /^можно в \d\d:\d\d$/.test(tgFlood.reset ?? '') && tgFlood.note?.startsWith('Канал «Проверка — ограничение».'), `ограничение — на батарейке: ${tgFlood.value} · ${tgFlood.reset}`)
  psql(`DELETE FROM public.supplier_channels WHERE id = '${floodId}'; DELETE FROM public.service_meters WHERE key = 'telegram_flood';`)
  check((await battery('dataforseo')).value === 'ключа нет', 'DataForSEO без ключа — «ключа нет»')
  if (SHOTS)
    await page.locator('[data-testid=batteries]').screenshot({ path: `${SHOTS}/batteries-1366.png` })
  await page.locator('[data-testid=budget-edit]').click()
  await page.locator('[data-testid=budget-remove]').click()
  await toastWith(page, 'Бюджет ИИ убран').waitFor({ timeout: 15000 })
  await page.locator('[data-testid=battery-ai_budget][data-state=off]').waitFor({ timeout: 15000 })
  check(psql(`SELECT count(*) FROM public.ai_settings WHERE key = 'ai_budget';`) === '0', '«Убрать» — бюджета нет и в базе')

  console.log('\n== телефон 390 px')
  const phone = await newPage({ width: 390, height: 844 })
  check(await noScroll(phone), 'без горизонтальной прокрутки')
  const box = await cards(phone).first().boundingBox()
  check(box && box.width > 150 && box.width < 200, `карточки в два столбца: ${Math.round(box?.width ?? 0)} px`)
  const buttons = await cards(phone).locator('button, a[data-testid=offer-to-site]').evaluateAll(bs => bs.slice(0, 24).map(b => b.scrollWidth <= b.clientWidth + 1))
  check(buttons.length === 24 && buttons.every(Boolean), `надписи кнопок помещаются — «На сайт», «В заказ», «Добавил», «Не брать»: ${buttons.filter(Boolean).length} из ${buttons.length}`)
  const prices = await cards(phone).locator('[data-testid=offer-price]').evaluateAll(ps => ps.slice(0, 12).map(p => p.getClientRects().length === 1 && p.getBoundingClientRect().right <= p.closest('[data-testid=offer-card]').getBoundingClientRect().right + 0.5))
  check(prices.length === 12 && prices.every(Boolean), `цена с ₸ — одной строкой и в карточке: ${prices.filter(Boolean).length} из ${prices.length}`)
  check(await phone.locator('[data-testid=offers-reread]').evaluate(b => b.scrollWidth <= b.clientWidth + 1), '«Прочитать» помещается в кнопку')
  if (SHOTS) {
    await phone.screenshot({ path: `${SHOTS}/offers-390.png` })
    // Прочитанное в узкой карточке — второй кадр, ниже строки чтения
    await cards(phone).nth(2).scrollIntoViewIfNeeded()
    await phone.screenshot({ path: `${SHOTS}/offers-390-cards.png` })
  }
  await phone.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await phone.locator('[data-testid=batteries] [data-testid=battery-ai_limits]').waitFor({ timeout: 30000 })
  check(await noScroll(phone), 'дашборд с батарейками на телефоне — без горизонтальной прокрутки')
  if (SHOTS)
    await phone.locator('[data-testid=batteries]').screenshot({ path: `${SHOTS}/batteries-390.png` })
  await phone.context().close()

  console.log('\n== секреты')
  const leaked = SECRETS.filter(s => bodies.some(b => b.includes(s)))
  check(!leaked.length, `ни один ответ маршрутов не несёт секретов${leaked.length ? ` — нашлось: ${leaked.join(', ')}` : ''}`)
  check(offerBodies.length && !offerBodies.some(b => b.includes('last4')), `ответы «Товаров поставщиков» — без последних знаков ключа ИИ: ${offerBodies.length} ответов`)

  console.log('\n== без миграции чтения')
  renameRead(false)
  readRenamed = true
  await new Promise(r => setTimeout(r, 1500))
  const unread = await api('/api/admin/supplier-offers', adminToken)
  check(unread.status === 200 && unread.json?.installed === true && unread.json.reading === null && unread.json.offers?.length > 0 && unread.json.offers.every(o => o.items === null && o.readError === null), `список без миграции чтения — товары есть, прочитанного нет, не 500: ${unread.status}`)
  const rereadOff = await api('/api/admin/supplier-offers/read', adminToken, { before: new Date().toISOString() })
  check(rereadOff.status === 409 && /20261105120000/.test(rereadOff.json?.message ?? ''), `«Прочитать» без миграции — 409: «${rereadOff.json?.message}»`)
  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle', timeout: 120000 })
  check(/после миграции базы 20261105120000_supplier_offers_read/.test(await readLine(page)) && await page.locator('[data-testid=offer-items]').count() === 0, 'страница без миграции чтения — про миграцию, карточки без прочитанного')
  asked = ai.requests.length
  addPost(1083, Date.now() - 2 * 60_000)
  addPost(1084, Date.now() - 60_000)
  const offToast = await collect(page, 'Новых товаров: 2')
  check(!offToast.includes('ИИ') && ai.requests.length === asked, `сбор без миграции чтения — собрано, к модели не ходили: «${offToast}»`)
  await page.goto(`${BASE}/admin/purchasing`, { waitUntil: 'load', timeout: 120000 })
  await page.locator('[data-testid=purchasing-steps]').waitFor({ timeout: 30000 })
  const aiOff = await stepAi(page)
  check(aiOff.state === 'later' && aiOff.next === 'Ключ есть. Чтение при сборе «Товаров поставщиков» заработает после миграции базы.' && aiOff.spend === 'появится после миграции базы', `дашборд без миграции чтения — «${aiOff.next}», расход: «${aiOff.spend}»`)
  renameRead(true)
  readRenamed = false
  await new Promise(r => setTimeout(r, 1500))

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
  aiServer.close()
  if (renamed) {
    psql(`ALTER TABLE public.supplier_offers_check_off RENAME TO supplier_offers;
NOTIFY pgrst, 'reload schema';`)
  }
  if (readRenamed)
    renameRead(true)
  await cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

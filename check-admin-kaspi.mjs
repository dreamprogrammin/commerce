/*
 * «Цифры Kaspi» (20.11.2026) — только на ЛОКАЛЬНОЙ базе с миграцией
 * 20261120120000_kaspi_snapshots и только на стенде с заглушкой ИИ: сервер
 * запущен с TELEGRAM_FAKE=1 и AI_STUB_URL=http://127.0.0.1:8788 (заглушку
 * Anthropic поднимает сам страж). Настоящих Kaspi и провайдера ИИ страж не
 * трогает: страницы kaspi.kz браузеру отдаёт он сам (перехват ctx.route —
 * запрос из браузера не уходит), а без `aiStub` в ответе страницы
 * останавливается, не задав ключа.
 *
 * Проверяет:
 *  1) маршруты: гость — 401, покупатель — 403; негодный замер — 400 с
 *     понятным текстом; скриншот не картинкой — 400;
 *  2) закладка «Uhti ← Kaspi»: «Найти на Kaspi» открывает поиск в браузере;
 *     на странице товара закладка возвращает цифры во вкладку «Kaspi» —
 *     цена, отзывы, рейтинг, продавцы; ссылка без меток; «нашлось 4 из 4»;
 *     сырьё из адреса убрано; сохранено с источником «кнопка»;
 *  3) закладка из новой вкладки без цели — цель последняя выбранная;
 *     страница без JSON-LD — цифры по тексту, рассрочка не принята за цену;
 *  4) скриншот: «Прочитать» — модель «Моделей ИИ», схема ответа, картинка
 *     JPEG; один товар — поля заполнены; несколько — выбор; расход — в
 *     «Бюджет ИИ»; без ключа ИИ — подсказка;
 *  5) прирост отзывов по двум замерам того же товара; удаление замера —
 *     двумя нажатиями;
 *  6) строка «Kaspi» на карточке товара поставщика (у своего товара поста)
 *     и у темы на «Спросе на рынке», ведёт на страницу «Kaspi» с целью;
 *  7) без миграции: страница говорит про миграцию, сохранение — 409,
 *     «Товары поставщиков» и «Спрос на рынке» работают без строки «Kaspi»;
 *  8) телефон 390px — без горизонтальной прокрутки; без ошибок консоли;
 *     ключ ИИ ни в одном ответе.
 *
 *   sg docker -c "node check-admin-kaspi.mjs --base=http://localhost:3141"
 *
 * Стенд — как у check-admin-supplier-offers.mjs. SHOTS=<папка> — скриншоты.
 */
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const AI_PORT = 8788
const AI_WEB = `http://127.0.0.1:${AI_PORT}`
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
const VISION = 'claude-haiku-5-5'
const AI_KEY = `sk-ant-api03-PROBEkaspi${'x'.repeat(24)}K9wZ`
const SUPPLIER = 'Проверка Kaspi — поставщик'
const TOPIC = 'Проверка Kaspi — тема'
const PRODUCT = 'https://kaspi.kz/shop/p/probe-kukla-100500/'
const PRODUCT_TEXT = 'https://kaspi.kz/shop/p/probe-mashinka-200600/'
const SHOTS = process.env.SHOTS
// Картинка 1×1 — «скриншот»; что на ней, заглушке всё равно
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mPo33EDAAP5AiCMelXAAAAAAElFTkSuQmCC', 'base64')

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей, поставщика и ключ ИИ')

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

// ---------- заглушка ИИ ----------

const ai = { kaspi: [], photo: [], mode: 'one' }
const aiServer = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, AI_WEB)
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    if (req.headers['x-api-key'] !== AI_KEY)
      return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })
    const model = { type: 'model', id: VISION, display_name: 'Claude Haiku 5.5', created_at: '2026-01-01T00:00:00Z' }
    if (req.method === 'GET' && pathname === '/v1/models')
      return send(200, { data: [{ ...model, capabilities: { image_input: { supported: true } } }], has_more: false, first_id: VISION, last_id: VISION })
    if (req.method === 'GET' && pathname === `/v1/models/${VISION}`)
      return send(200, { ...model, capabilities: { image_input: { supported: true }, effort: { low: { supported: true } } } })
    if (req.method !== 'POST' || pathname !== '/v1/messages')
      return send(404, { type: 'error', error: { type: 'not_found_error', message: pathname } })
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const content = body.messages?.[0]?.content ?? []
    // Сверка с выдачей по фото: «Конструктор» — второй из списка, «Пазл» — ни один
    if (typeof body.system === 'string' && body.system.startsWith('Ты сверяешь товар')) {
      const text = content.find(b => b.type === 'text')?.text ?? ''
      ai.photo.push({ model: body.model, format: body.output_config?.format?.type, text, images: content.filter(b => b.type === 'image').map(b => b.source?.type === 'url' ? b.source.url : `${b.source?.type}:${b.source?.media_type}`) })
      const answer = text.includes('Конструктор') ? { match: 2, confidence: 'high' } : { match: null, confidence: 'low' }
      return send(200, { id: `msg_p_${ai.photo.length}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify(answer) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 20 } })
    }
    ai.kaspi.push({
      model: body.model,
      effort: body.output_config?.effort,
      format: body.output_config?.format?.type,
      schema: Object.keys(body.output_config?.format?.schema?.properties?.items?.items?.properties ?? {}).join(','),
      system: typeof body.system === 'string' && body.system.startsWith('Ты читаешь скриншот Kaspi'),
      images: content.filter(b => b.type === 'image').map(b => b.source?.media_type),
    })
    const one = { title: 'Кукла проверочная со скриншота', price: 15990, reviews: 321, rating: 4.7, sellers: 5 }
    const items = ai.mode === 'one' ? [one] : ai.mode === 'none' ? [] : [one, { title: 'Машинка проверочная', price: 4990, reviews: 88, rating: 4.9, sellers: null }]
    send(200, { id: `msg_k_${ai.kaspi.length}`, type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text: JSON.stringify({ items }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1500, output_tokens: 120 } })
  })
})
await new Promise(r => aiServer.listen(AI_PORT, '127.0.0.1', r))

// ---------- подставные страницы «Kaspi» ----------
// Вёрстка придумана: настоящую страницу Kaspi страж не открывает и не повторяет

const KASPI_PAGES = {
  '/shop/search/': '<!doctype html><meta charset="utf-8"><title>Поиск</title><body><a id="go" href="/shop/p/probe-kukla-100500/?c=750000000">Кукла</a></body>',
  '/shop/p/probe-kukla-100500/': `<!doctype html><meta charset="utf-8"><title>Кукла проверочная – купить | Kaspi Магазин</title>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', 'name': 'Кукла проверочная', 'offers': { '@type': 'AggregateOffer', 'lowPrice': 12990, 'offerCount': 7 }, 'aggregateRating': { '@type': 'AggregateRating', 'ratingValue': 4.8, 'reviewCount': 1234 } })}</script>
<body><h1>Кукла проверочная</h1><p>Покупатель Иван Иванов</p></body>`,
  '/shop/p/probe-mashinka-200600/': `<!doctype html><meta charset="utf-8"><title>Машинка проверочная | Kaspi</title>
<body><h1>Машинка проверочная</h1><div>4,6 (2 045 отзывов)</div><div>812 ₸ × 24</div><div>Цена 19 490 ₸</div><div>Продавцы (12)</div></body>`,
}
// Выдача поиска: карточка — ссылка-картинка, ссылка-название, отзывы, цена (вёрстка придумана)
const CDN = 'https://resources.cdn-kaspi.kz/img/probe'
const card = (slug, title, reviews, price) => `<div class="card"><a href="/shop/p/${slug}/?c=750000000"><img src="${CDN}/${slug}.jpg" alt=""></a><a href="/shop/p/${slug}/?c=750000000">${title}</a><div>4,7 (${reviews} отзывов)</div><div>${price} ₸</div></div>`
const SEARCH = {
  'Кукла проверочная': [card('kukla-hasbro-1', 'Кукла Hasbro принцесса KP 7731 розовая', '1 234', '12 990'), card('kukla-2', 'Кукла модница', '15', '4 990'), card('kukla-3', 'Кукла малышка', '8', '3 490')],
  'Конструктор проверочный': [card('konstr-red', 'Конструктор проверочный красный', '40', '9 990'), card('konstr-blue', 'Конструктор проверочный синий', '640', '9 490')],
  'Пазл проверочный': [card('myach', 'Мяч футбольный', '300', '2 990'), card('samokat', 'Самокат детский', '90', '19 990')],
}
const searchPage = text => `<!doctype html><meta charset="utf-8"><title>${text} — Kaspi</title><body><h1>Результаты</h1><section>${SEARCH[text].join('')}</section></body>`
const kaspiRequests = []
const cdnRequests = []

// ---------- данные ----------

const stamp = Date.now()
const emails = { admin: `kaspi-admin-${stamp}@example.test`, buyer: `kaspi-buyer-${stamp}@example.test` }
const users = []
const aiKeyNames = () => psql(`SELECT coalesce(string_agg(name, ',' ORDER BY name), '') FROM vault.secrets WHERE name LIKE 'ai\\_key\\_%';`)
let started = false
const photoPaths = []

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

async function removePhotos() {
  if (photoPaths.length)
    await fetch(`${SUPA}/storage/v1/object/supplier-photos`, { method: 'DELETE', headers: serviceHeaders, body: JSON.stringify({ prefixes: photoPaths }) })
}

function cleanup() {
  psql(`DELETE FROM public.market_demand_topics WHERE name = '${TOPIC}'; DELETE FROM public.suppliers WHERE name = '${SUPPLIER}';`)
  if (started)
    psql(`DELETE FROM public.ai_usage_daily; DELETE FROM public.service_meters; DELETE FROM vault.secrets WHERE name LIKE 'ai\\_key\\_%';`)
}

// Миграцию на локальной базе применяют от supabase_admin — переименовывает он же
function psqlSuper(sql) {
  return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', DB_CONTAINER, 'psql', '-w', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1'], { input: sql, encoding: 'utf8' }).trim()
}

let renamed = false
function renameTable(back) {
  psqlSuper(back
    ? `ALTER TABLE public.kaspi_snapshots_check_off RENAME TO kaspi_snapshots; NOTIFY pgrst, 'reload schema';`
    : `ALTER TABLE public.kaspi_snapshots RENAME TO kaspi_snapshots_check_off; NOTIFY pgrst, 'reload schema';`)
  renamed = !back
}

const browser = await chromium.launch()
const errors = []
const failedResponses = []
try {
  if (psql(`SELECT to_regclass('public.kaspi_snapshots') IS NOT NULL;`) !== 't')
    throw new Error('На локальной базе нет миграции 20261120120000_kaspi_snapshots')
  if (aiKeyNames())
    throw new Error(`На локальной базе уже есть ключи ИИ (${aiKeyNames()}) — страж их не трогает`)
  if (psql(`SELECT (SELECT count(*) FROM public.ai_usage_daily) + (SELECT count(*) FROM public.service_meters);`) !== '0')
    throw new Error('На локальной базе уже есть расход ИИ или показания — страж их не трогает')
  if (psql(`SELECT count(*) FROM public.ai_settings WHERE key = 'supplier_vision_model';`) !== '0')
    throw new Error('На локальной базе выбрана модель чтения — страж ждёт модель по умолчанию и чужой выбор не трогает')
  started = true
  cleanup()
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)

  const first = await api('/api/admin/kaspi', adminToken)
  if (first.json?.aiStub !== AI_WEB)
    throw new Error(`Стенд без заглушки ИИ (aiStub: ${first.json?.aiStub}) — запустите сервер с TELEGRAM_FAKE=1 и AI_STUB_URL=${AI_WEB}. Ключ не задавался`)
  check(first.json.installed === true && first.json.reading.model === `anthropic/${VISION}` && first.json.reading.key === false, 'страница: миграция есть, модель по умолчанию, ключа ИИ нет')

  const topicId = psql(`INSERT INTO public.market_demand_topics (name, keywords) VALUES ('${TOPIC}', ARRAY['проверка kaspi кукла']) RETURNING id;`)
  const supId = psql(`INSERT INTO public.suppliers (name) VALUES ('${SUPPLIER}') RETURNING id;`)
  const chId = psql(`INSERT INTO public.supplier_channels (supplier_id, title, chat_type, username) VALUES ('${supId}', '${SUPPLIER}', 'channel', 'probe_kaspi') RETURNING id;`)
  const hasRead = psql(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'supplier_offers' AND column_name = 'read_items';`) === '1'
  if (!hasRead)
    throw new Error('Нет миграции чтения ИИ (20261105120000) — товары поста не проверить')
  const offerId = psql(`INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url, caption, read_items, read_at, read_model) VALUES ('${chId}', 1, now() - interval '1 hour', 'https://t.me/probe_kaspi/1', 'Пост', '[{"name":"Кукла проверочная","article":"KP-7731","price_text":9000,"confidence":"high"},{"name":"Машинка проверочная","price_text":3000,"confidence":"high"},{"name":"Конструктор проверочный","price_text":5000,"confidence":"high"},{"name":"Пазл проверочный","price_text":1000,"confidence":"high"}]', now(), 'anthropic/${VISION}') RETURNING id;`)

  // Фото товара поставщика — в закрытом бакете, как после сбора: по нему сверка с выдачей
  const photoPath = `${chId}/kaspi-probe.png`
  const up = await fetch(`${SUPA}/storage/v1/object/supplier-photos/${photoPath}`, { method: 'POST', headers: { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: PNG })
  if (!up.ok)
    throw new Error(`фото в бакет: ${up.status}`)
  photoPaths.push(photoPath)
  psql(`UPDATE public.supplier_offers SET photo_path = '${photoPath}', photo_url = 'data:image/png;base64,${PNG.toString('base64')}' WHERE id = '${offerId}';`)

  // 1) маршруты
  check((await api('/api/admin/kaspi', null)).status === 401, 'гость — 401')
  check((await api('/api/admin/kaspi', buyerToken)).status === 403, 'покупатель — 403')
  check((await api('/api/admin/kaspi/snapshots', buyerToken, { topicId, reviews: 1, source: 'manual' })).status === 403, 'покупатель не сохраняет — 403')
  check((await api('/api/admin/kaspi/read', buyerToken, { mediaType: 'image/png', data: PNG.toString('base64') })).status === 403, 'покупатель не читает скриншот — 403')
  check((await api('/api/admin/kaspi/snapshots/1', buyerToken, null, 'DELETE')).status === 403, 'покупатель не удаляет — 403')
  const bad = [
    [{ reviews: 1, source: 'manual' }, 'Выберите тему или товар поставщика'],
    [{ topicId, source: 'manual' }, 'Нет ни одной цифры'],
    [{ topicId, reviews: 1, rating: 9, source: 'manual' }, 'Рейтинг — от 0 до 5'],
    [{ topicId, reviews: 1, url: 'https://evil.example/', source: 'manual' }, 'Ссылка — только на kaspi.kz'],
    [{ topicId, offerId, reviews: 1, source: 'manual' }, 'Выберите тему или товар поставщика'],
  ]
  for (const [body, text] of bad) {
    const r = await api('/api/admin/kaspi/snapshots', adminToken, body)
    check(r.status === 400 && r.json?.message === text, `негодный замер — 400 «${text}» (${r.status} ${r.json?.message})`)
  }
  check((await api('/api/admin/kaspi/read', adminToken, { mediaType: 'text/html', data: 'PGh0bWw+' })).status === 400, 'скриншот не картинкой — 400')
  check((await api('/api/admin/kaspi/snapshots/abc', adminToken, null, 'DELETE')).status === 400, 'удалить негодный замер — 400')
  const noKey = await api('/api/admin/kaspi/read', adminToken, { mediaType: 'image/png', data: PNG.toString('base64') })
  check(noKey.status === 200 && noKey.json?.off === 'key' && ai.kaspi.length === 0, 'без ключа ИИ скриншот не читается — off: key, к модели не ходили')

  // Ключ ИИ — для заглушки
  check((await api('/api/admin/ai-settings/key', adminToken, { provider: 'anthropic', key: AI_KEY })).status === 200, 'ключ ИИ задан (заглушка)')

  // ---------- браузер ----------
  async function newContext(viewport = { width: 1366, height: 900 }) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    // kaspi.kz — только подставные страницы, наружу ни одного запроса
    await ctx.route('https://kaspi.kz/**', (route) => {
      const { pathname } = new URL(route.request().url())
      kaspiRequests.push(pathname)
      const text = new URL(route.request().url()).searchParams.get('text')
      const html = pathname === '/shop/search/' && SEARCH[text] ? searchPage(text) : KASPI_PAGES[pathname]
      return html ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }) : route.fulfill({ status: 404, body: 'nope' })
    })
    // Картинки выдачи с CDN Kaspi — тоже подставные
    await ctx.route('https://resources.cdn-kaspi.kz/**', (route) => {
      cdnRequests.push(new URL(route.request().url()).pathname)
      return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
    })
    ctx.on('page', (page) => {
      page.on('pageerror', e => page.url().startsWith(BASE) && errors.push(`${page.url().replace(BASE, '')}: ${e.message}`))
      // Подставные страницы Kaspi — не наши: их консоль не считаем
      page.on('console', m => m.type() === 'error' && page.url().startsWith(BASE) && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(`${page.url().replace(BASE, '')}: ${m.text()}`))
      page.on('response', (r) => {
        if (r.url().startsWith(BASE) && r.status() >= 400 && !/\/_payload\.json/.test(r.url()) && !(r.status() === 406 && r.url().includes('/rest/v1/server_carts')))
          failedResponses.push(`${r.status()} ${r.url().replace(BASE, '')}`)
        if (r.url().startsWith(`${BASE}/api/admin/`))
          r.text().then(t => bodies.push(t), () => {})
      })
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
    return { ctx, page }
  }
  const val = (page, id) => page.locator(`[data-testid=${id}]`).inputValue()
  const sp = s => (s ?? '').replace(/\s+/g, ' ').trim()
  const toastWith = (page, text) => page.locator('[data-sonner-toast]', { hasText: text })
  const rows = () => JSON.parse(psql(`SELECT coalesce(json_agg(k ORDER BY id), '[]') FROM public.kaspi_snapshots k WHERE topic_id = '${topicId}' OR offer_id = '${offerId}';`))

  // 2) закладка: тема → «Найти на Kaspi» → товар → закладка
  const { ctx, page } = await newContext()
  await page.goto(`${BASE}/admin/kaspi?topic=${topicId}`, { waitUntil: 'networkidle' })
  check(await page.locator('[data-testid=kaspi-topic]').inputValue() === topicId, 'тема из адреса выбрана')
  const search = page.locator('[data-testid=kaspi-search]')
  check(await search.getAttribute('href') === `https://kaspi.kz/shop/search/?text=${encodeURIComponent(TOPIC)}`, '«Найти на Kaspi» — обычная ссылка на поиск с названием темы')
  const bookmarklet = await page.locator('[data-testid=kaspi-bookmarklet]').getAttribute('href')
  check(bookmarklet.startsWith('javascript:') && decodeURIComponent(bookmarklet).includes(`"${BASE}/admin/kaspi#kaspi="`), 'закладка ведёт на «Kaspi» этого сайта')
  const bookmarkSrc = decodeURIComponent(bookmarklet.slice('javascript:'.length))
  check(await page.evaluate(() => window.name) === 'uhti-kaspi', 'вкладка «Kaspi» названа — закладка откроет цифры в ней')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/kaspi-empty-1366.png`, fullPage: true })

  const [kaspiTab] = await Promise.all([ctx.waitForEvent('page'), search.click()])
  await kaspiTab.waitForLoadState('load')
  await kaspiTab.click('#go')
  await kaspiTab.waitForURL('**/shop/p/probe-kukla-100500/**')
  const pagesBefore = ctx.pages().length
  // «Нажатие закладки» — её код на странице товара
  await kaspiTab.evaluate(src => (0, eval)(src), bookmarkSrc)
  await page.waitForFunction(() => document.querySelector('[data-testid=kaspi-from-page]'), null, { timeout: 15000 })
  check(ctx.pages().length === pagesBefore, `цифры пришли в ту же вкладку «Kaspi», новой не открылось (вкладок ${ctx.pages().length})`)
  check(await val(page, 'kaspi-price') === '12990' && await val(page, 'kaspi-reviews') === '1234' && await val(page, 'kaspi-rating') === '4,8' && await val(page, 'kaspi-sellers') === '7', `закладка: цена, отзывы, рейтинг, продавцы из JSON-LD (${await val(page, 'kaspi-price')}, ${await val(page, 'kaspi-reviews')}, ${await val(page, 'kaspi-rating')}, ${await val(page, 'kaspi-sellers')})`)
  check(await val(page, 'kaspi-url') === PRODUCT && await val(page, 'kaspi-title') === 'Кукла проверочная', 'ссылка без метки города, название без «| Kaspi»')
  check(sp(await page.locator('[data-testid=kaspi-from-page]').textContent()).includes('нашлось 4 из 4'), '«нашлось 4 из 4 цифр»')
  check(!page.url().includes('#') && page.url().includes(`topic=${topicId}`), 'сырьё из адреса убрано, тема осталась')
  check(!bodies.some(b => b.includes('Иван Иванов')), 'текст страницы Kaspi на сервер не ушёл')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/kaspi-from-page-1366.png`, fullPage: true })
  await page.click('[data-testid=kaspi-save]')
  await toastWith(page, 'Цифры Kaspi сохранены').waitFor({ timeout: 10000 })
  await page.locator('[data-testid=kaspi-snapshot]').first().waitFor()
  let saved = rows()
  check(saved.length === 1 && saved[0].source === 'page' && saved[0].kaspi_url === PRODUCT && saved[0].price === 12990 && saved[0].reviews === 1234 && Number(saved[0].rating) === 4.8 && saved[0].sellers === 7 && saved[0].created_by === adminId, `в базе замер: источник «кнопка», цифры, кто (${JSON.stringify(saved[0] ?? null)})`)
  check(await val(page, 'kaspi-price') === '' && await page.locator('[data-testid=kaspi-from-page]').count() === 0, 'после сохранения форма пустая')

  // 5) прирост: тот же товар 14 дней назад — 1100 отзывов
  psql(`INSERT INTO public.kaspi_snapshots (topic_id, kaspi_url, title, reviews, source, taken_at) VALUES ('${topicId}', '${PRODUCT}', 'Кукла проверочная', 1100, 'manual', now() - interval '14 days');`)
  await page.reload({ waitUntil: 'networkidle' })
  const summaryText = sp(await page.locator('[data-testid=kaspi-summary]').textContent())
  check(summaryText.includes('+134 за 14 дн.') && summaryText.includes('12 990 ₸') && summaryText.includes('7 продавцов'), `прирост отзывов за 14 дней: «${summaryText}»`)
  check(await page.locator('[data-testid=kaspi-snapshot]').count() === 2, 'в списке два замера')

  // 3) закладка из вкладки, не связанной со страницей «Kaspi», — без JSON-LD
  const { ctx: other, page: otherPage } = await newContext()
  await otherPage.goto(`${BASE}/admin/kaspi?offer=${offerId}&item=1`, { waitUntil: 'networkidle' })
  check(await otherPage.locator('[data-testid=kaspi-offer-item]').inputValue() === '1', 'товар поставщика: выбран второй товар поста')
  check(await otherPage.locator('[data-testid=kaspi-search]').getAttribute('href') === `https://kaspi.kz/shop/search/?text=${encodeURIComponent('Машинка проверочная')}`, '«Найти на Kaspi» — по названию второго товара')
  // Тот же браузер, но вкладка Kaspi открыта сама по себе: закладка открывает новую вкладку, цель — последняя выбранная
  await otherPage.evaluate(() => { window.name = '' })
  const lone = await other.newPage()
  await lone.goto(`${PRODUCT_TEXT}?c=750000000`)
  const [opened] = await Promise.all([other.waitForEvent('page'), lone.evaluate(src => (0, eval)(src), bookmarkSrc)])
  await opened.waitForSelector('[data-testid=kaspi-from-page]', { timeout: 60000 })
  await opened.waitForLoadState('networkidle')
  check(opened.url().includes(`offer=${offerId}`) && opened.url().includes('item=1'), `новая вкладка — цель последняя выбранная (${opened.url().replace(BASE, '')})`)
  check(await val(opened, 'kaspi-price') === '19490' && await val(opened, 'kaspi-reviews') === '2045' && await val(opened, 'kaspi-rating') === '4,6' && await val(opened, 'kaspi-sellers') === '12', `без JSON-LD — по тексту, рассрочка «812 ₸ × 24» не цена (${await val(opened, 'kaspi-price')}, ${await val(opened, 'kaspi-reviews')}, ${await val(opened, 'kaspi-rating')}, ${await val(opened, 'kaspi-sellers')})`)
  await opened.click('[data-testid=kaspi-save]')
  await toastWith(opened, 'Цифры Kaspi сохранены').waitFor({ timeout: 10000 })
  saved = rows().filter(r => r.offer_id === offerId)
  check(saved.length === 1 && saved[0].offer_item === 1 && saved[0].price === 19490 && saved[0].kaspi_url === PRODUCT_TEXT, `замер у второго товара поста (${JSON.stringify(saved[0] ?? null)})`)
  await other.close()

  // 4) скриншот
  await page.goto(`${BASE}/admin/kaspi?topic=${topicId}`, { waitUntil: 'networkidle' })
  await page.setInputFiles('[data-testid=kaspi-shot-file]', { name: 'shot.png', mimeType: 'image/png', buffer: PNG })
  await page.locator('[data-testid=kaspi-shot-read]').click()
  await page.waitForFunction(() => document.querySelector('[data-testid=kaspi-price]')?.value === '15990', null, { timeout: 15000 })
  const call = ai.kaspi.at(-1)
  check(ai.kaspi.length === 1 && call.model === VISION && call.system && call.format === 'json_schema' && call.effort === 'low' && call.schema === 'title,price,reviews,rating,sellers' && call.images.join() === 'image/jpeg', `скриншот — модель «Моделей ИИ», промпт Kaspi, схема, low, одна картинка JPEG (${JSON.stringify(call)})`)
  check(await val(page, 'kaspi-reviews') === '321' && await val(page, 'kaspi-rating') === '4,7' && await val(page, 'kaspi-sellers') === '5' && await val(page, 'kaspi-title') === 'Кукла проверочная со скриншота', 'один товар со скриншота — поля заполнены')
  check(psql(`SELECT coalesce(sum(input_tokens), 0) || '/' || coalesce(sum(output_tokens), 0) FROM public.ai_usage_daily;`) === '1500/120', 'расход скриншота — в «Бюджете ИИ»')
  await page.click('[data-testid=kaspi-save]')
  await toastWith(page, 'Цифры Kaspi сохранены').waitFor({ timeout: 10000 })
  check(rows().filter(r => r.topic_id === topicId).at(-1)?.source === 'screenshot', 'замер со скриншота — источник «скриншот»')

  ai.mode = 'two'
  // Вставка из буфера — тот же путь, что выбор файла
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'paste.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt }))
  }, PNG.toString('base64'))
  await page.locator('[data-testid=kaspi-shot-read]').click()
  await page.locator('[data-testid=kaspi-shot-item]').first().waitFor({ timeout: 15000 })
  check(await page.locator('[data-testid=kaspi-shot-item]').count() === 2 && await val(page, 'kaspi-price') === '', 'вставка Ctrl+V; несколько товаров — выбор, поля не заполнены сами')
  await page.locator('[data-testid=kaspi-shot-item]').nth(1).click()
  check(await val(page, 'kaspi-price') === '4990' && await val(page, 'kaspi-sellers') === '', 'выбран второй товар — его цифры')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/kaspi-shot-1366.png`, fullPage: true })
  ai.mode = 'none'
  await page.locator('[data-testid=kaspi-shot-read]').click()
  await page.locator('[data-testid=kaspi-shot-error]').waitFor({ timeout: 15000 })
  check(sp(await page.locator('[data-testid=kaspi-shot-error]').textContent()) === 'На скриншоте не нашлось товаров Kaspi', 'нет товаров на скриншоте — так и сказано')

  // 5) удаление — двумя нажатиями
  const before = rows().length
  await page.locator('[data-testid=kaspi-snapshot-delete]').first().click()
  check(rows().length === before && sp(await page.locator('[data-testid=kaspi-snapshot-delete]').first().textContent()) === 'Точно?', 'первое нажатие — «Точно?», ничего не удалено')
  await page.locator('[data-testid=kaspi-snapshot-delete]').first().click()
  for (let i = 0; i < 20 && rows().length === before; i++)
    await sleep(250)
  check(rows().length === before - 1, 'второе нажатие — замер удалён')

  // 6) строка «Kaspi» на карточках
  await page.goto(`${BASE}/admin/demand`, { waitUntil: 'networkidle' })
  const topicRow = page.locator('[data-testid=demand-topic]', { hasText: TOPIC })
  await page.locator('input[aria-label="Найти тему"]').fill(TOPIC)
  const topicLine = topicRow.locator('[data-testid=kaspi-line]')
  check(await topicLine.count() === 1 && await topicLine.getAttribute('href') === `/admin/kaspi?topic=${topicId}`, '«Спрос на рынке»: у темы строка «Kaspi» со ссылкой на её замеры')
  check(/Kaspi.*отзыв/.test(sp(await topicLine.textContent())), `строка темы с цифрами: «${sp(await topicLine.textContent())}»`)
  const otherTopicLine = page.locator('[data-testid=demand-topic]').first().locator('[data-testid=kaspi-line]')
  await page.locator('input[aria-label="Найти тему"]').fill('')
  check(sp(await otherTopicLine.textContent()).includes('добавить цифры') || sp(await otherTopicLine.textContent()).includes('отзыв'), 'у темы без замеров — «добавить цифры»')

  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle' })
  const card = page.locator(`[data-offer-id="${offerId}"]`)
  await card.first().waitFor({ timeout: 20000 })
  const lines = card.first().locator('[data-testid=kaspi-line]')
  check(await lines.count() === 3, `карточка поста: строка «Kaspi» у каждого показанного товара (${await lines.count()})`)
  check(sp(await lines.nth(0).textContent()).includes('добавить цифры') && await lines.nth(0).getAttribute('href') === `/admin/kaspi?offer=${offerId}&item=0`, 'у первого товара замеров нет — «добавить цифры»')
  check(sp(await lines.nth(1).textContent()).includes('19 490') && await lines.nth(1).getAttribute('href') === `/admin/kaspi?offer=${offerId}&item=1`, `у второго — его цифры: «${sp(await lines.nth(1).textContent())}»`)
  if (SHOTS)
    await card.first().screenshot({ path: `${SHOTS}/kaspi-offer-card.png` })

  // 9) очередь: выдача поиска → сверка → сохранение само
  const board0 = await api('/api/admin/kaspi/board', adminToken)
  const queueKeys = board0.json?.queue?.map(r => r.key) ?? []
  check(board0.status === 200 && queueKeys.includes(`${offerId}:0`) && queueKeys.includes(`${offerId}:2`) && !queueKeys.includes(`${offerId}:1`), `очередь: товары без замера, с замером — нет (${queueKeys.filter(k => k.startsWith(offerId)).join(', ')})`)
  check((await api('/api/admin/kaspi/board', buyerToken)).status === 403, 'очередь покупателю — 403')
  check((await api('/api/admin/kaspi/match', adminToken, { offerId, item: 0, candidates: [] })).status === 400, 'сверка без выдачи — 400')
  check((await api('/api/admin/kaspi/match', buyerToken, { offerId, item: 0, candidates: [{ url: 'https://kaspi.kz/shop/p/x/', title: 'x' }] })).status === 403, 'сверка покупателю — 403')

  await page.goto(`${BASE}/admin/kaspi`, { waitUntil: 'networkidle' })
  const findRow = name => page.locator('[data-testid=kaspi-queue-row]', { hasText: name }).locator('[data-testid=kaspi-queue-find]')
  async function bookmarkOn(tab) {
    await tab.waitForLoadState('load')
    await tab.evaluate(src => (0, eval)(src), bookmarkSrc)
  }
  const offerRows = () => rows().filter(r => r.offer_id === offerId)

  // а) артикул
  // Вкладка поиска Kaspi уже открыта ссылкой «Найти на Kaspi» выше — «Найти» ведёт в неё же
  const searchTab = kaspiTab
  const tabsBefore = ctx.pages().length
  await findRow('Кукла проверочная').click()
  check(await searchTab.waitForURL(u => new URL(u).searchParams.get('text') === 'Кукла проверочная', { timeout: 15000 }).then(() => true, () => false), '«Найти» открыл поиск Kaspi по названию товара')
  check(ctx.pages().length === tabsBefore, `«Найти» — в той же вкладке Kaspi, новой нет (${ctx.pages().length})`)
  await bookmarkOn(searchTab)
  await page.locator('[data-testid=kaspi-match-saved]').waitFor({ timeout: 20000 })
  check(sp(await page.locator('[data-testid=kaspi-match-saved]').textContent()).includes('по артикулу'), `найден по артикулу: «${sp(await page.locator('[data-testid=kaspi-match-saved]').textContent())}»`)
  let mine = offerRows().filter(r => r.offer_item === 0)
  check(mine.length === 1 && mine[0].kaspi_url === 'https://kaspi.kz/shop/p/kukla-hasbro-1/' && mine[0].reviews === 1234 && mine[0].price === 12990 && mine[0].source === 'page', `в базе — товар с артикулом, его цифры (${JSON.stringify(mine[0] ?? null)})`)
  check(await page.locator('[data-testid=kaspi-result]').count() === 3, 'выдача: три товара на выбор')
  check(ai.photo.length === 0, 'по артикулу — к модели не ходили')

  // «Не то» — выбрать другой: прежний замер заменён
  await page.locator('[data-testid=kaspi-result]', { hasText: 'Кукла модница' }).click()
  await toastWith(page, 'выбрано вами').first().waitFor({ timeout: 10000 })
  mine = offerRows().filter(r => r.offer_item === 0)
  check(mine.length === 1 && mine[0].kaspi_url === 'https://kaspi.kz/shop/p/kukla-2/', `выбран другой — замер заменён, не добавлен (${mine.map(r => r.kaspi_url).join(', ')})`)
  await page.locator('[data-testid=kaspi-result]', { hasText: 'Кукла Hasbro' }).click()
  await toastWith(page, 'выбрано вами').nth(1).waitFor({ timeout: 10000 })

  // б) фото: два одинаковых названия — решает модель
  const nextBtn = page.locator('[data-testid=kaspi-next]')
  check(sp(await nextBtn.textContent()).includes('Конструктор проверочный'), `«Следующий» — следующий в очереди: «${sp(await nextBtn.textContent())}»`)
  await nextBtn.click()
  await searchTab.waitForURL(u => new URL(u).searchParams.get('text') === 'Конструктор проверочный', { timeout: 15000 })
  check(ctx.pages().length === tabsBefore, `поиск открылся в той же вкладке Kaspi (вкладок ${ctx.pages().length})`)
  await bookmarkOn(searchTab)
  await page.locator('[data-testid=kaspi-match-saved]').waitFor({ timeout: 20000 })
  check(sp(await page.locator('[data-testid=kaspi-match-saved]').textContent()).includes('по фото') && sp(await page.locator('[data-testid=kaspi-match-saved]').textContent()).includes('синий'), `найден по фото: «${sp(await page.locator('[data-testid=kaspi-match-saved]').textContent())}»`)
  const pc = ai.photo.at(-1)
  check(ai.photo.length === 1 && pc.model === VISION && pc.format === 'json_schema' && pc.images[0] === 'base64:image/png' && pc.images.slice(1).join() === `${CDN}/konstr-red.jpg,${CDN}/konstr-blue.jpg` && pc.text.includes('1. Конструктор проверочный красный'),
    `модель: фото поставщика из бакета и картинки выдачи по адресу (${JSON.stringify(pc)})`)
  check(offerRows().find(r => r.offer_item === 2)?.kaspi_url === 'https://kaspi.kz/shop/p/konstr-blue/', 'в базе — товар, выбранный по фото')

  // в) не нашлось — «На Kaspi такого нет»
  await page.locator('[data-testid=kaspi-next]').click()
  await searchTab.waitForURL(u => new URL(u).searchParams.get('text') === 'Пазл проверочный', { timeout: 15000 })
  await bookmarkOn(searchTab)
  await page.locator('[data-testid=kaspi-match-none]').waitFor({ timeout: 20000 })
  check(offerRows().filter(r => r.offer_item === 3).length === 0, 'не нашлось — ничего не сохранено само')
  await page.click('[data-testid=kaspi-absent]')
  await toastWith(page, 'на Kaspi такого нет').waitFor({ timeout: 10000 })
  const absent = offerRows().find(r => r.offer_item === 3)
  check(absent?.sellers === 0 && absent.price == null && absent.source === 'manual', `«нет на Kaspi» — замер «0 продавцов» (${JSON.stringify(absent ?? null)})`)
  check(cdnRequests.length > 0 && kaspiRequests.every(p => p in KASPI_PAGES || p === '/shop/search/'), 'картинки и страницы Kaspi — только подставные')

  // г) топ и «Хит Kaspi»
  const board1 = (await api('/api/admin/kaspi/board', adminToken)).json
  const myTop = board1.top.filter(r => r.offerId === offerId)
  check(!board1.queue.some(r => r.offerId === offerId), 'все товары поста проверены — в очереди их нет')
  // Машинка — 2 045 отзывов (шаг 3), кукла — 1 234, конструктор — 640; хит — верхняя треть: машинка
  check(myTop.map(r => r.item).join() === '1,0,2' && myTop[0].hit && !myTop[1].hit && !myTop.some(r => r.item === 3), `топ: больше отзывов — выше, «нет на Kaspi» — не в топе (${myTop.map(r => `${r.item}:${r.kaspi?.last.reviews}${r.hit ? ' хит' : ''}`).join(', ')})`)
  await page.reload({ waitUntil: 'networkidle' })
  check(await page.locator('[data-testid=kaspi-top-row]', { hasText: 'Машинка проверочная' }).locator('[data-testid=kaspi-hit]').count() >= 1
    && await page.locator('[data-testid=kaspi-top-row]', { hasText: 'Кукла проверочная' }).locator('[data-testid=kaspi-hit]').count() === 0, 'страница: «Хит Kaspi» у машинки, у куклы — нет')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/kaspi-board-1366.png`, fullPage: true })
  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle' })
  const card2 = page.locator(`[data-offer-id="${offerId}"]`).first()
  await card2.waitFor({ timeout: 20000 })
  check(await card2.locator('[data-testid=kaspi-line]').nth(1).locator('[data-testid=kaspi-hit]').count() === 1 && await card2.locator('[data-testid=kaspi-hit]').count() === 1, 'карточка поставщика: «Хит Kaspi» только у машинки')
  if (SHOTS)
    await card2.screenshot({ path: `${SHOTS}/kaspi-offer-card-hit.png` })

  // 8) телефон
  const { ctx: phone, page: phonePage } = await newContext({ width: 390, height: 844 })
  await phonePage.goto(`${BASE}/admin/kaspi?topic=${topicId}`, { waitUntil: 'networkidle' })
  const overflow = await phonePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check(overflow <= 0, `390px — без горизонтальной прокрутки (${overflow})`)
  if (SHOTS)
    await phonePage.screenshot({ path: `${SHOTS}/kaspi-390.png`, fullPage: true })
  await phone.close()

  // 7) без миграции
  renameTable(false)
  await sleep(1500)
  const off = await api('/api/admin/kaspi', adminToken)
  check(off.status === 200 && off.json?.installed === false, 'без миграции: страница без цели отвечает installed: false')
  const offTopic = await api(`/api/admin/kaspi?topic=${topicId}`, adminToken)
  check(offTopic.status === 200 && offTopic.json?.installed === false, 'без миграции: и с темой — installed: false')
  const offSave = await api('/api/admin/kaspi/snapshots', adminToken, { topicId, reviews: 1, source: 'manual' })
  check(offSave.status === 409 && /миграции/.test(offSave.json?.message ?? ''), `без миграции сохранение — 409 про миграцию (${offSave.status})`)
  const offOffers = await api('/api/admin/supplier-offers', adminToken)
  check(offOffers.status === 200 && offOffers.json?.kaspi === null && offOffers.json?.offers?.length > 0, '«Товары поставщиков» без миграции — работают, kaspi: null')
  const offDemand = await api('/api/admin/demand', adminToken)
  check(offDemand.status === 200 && offDemand.json?.kaspi === null, '«Спрос на рынке» без миграции — работает, kaspi: null')
  await page.goto(`${BASE}/admin/kaspi?topic=${topicId}`, { waitUntil: 'networkidle' })
  check(await page.locator('[data-testid=kaspi-not-installed]').count() === 1 && await page.locator('[data-testid=kaspi-save]').isDisabled(), 'страница: про миграцию, «Сохранить» выключена')
  await page.goto(`${BASE}/admin/supplier-offers`, { waitUntil: 'networkidle' })
  check(await page.locator('[data-testid=kaspi-line]').count() === 0, 'карточки без миграции — без строки «Kaspi»')
  renameTable(true)
  await ctx.close()

  check(kaspiRequests.length > 0 && kaspiRequests.every(p => p in KASPI_PAGES), `kaspi.kz — только подставные страницы (${[...new Set(kaspiRequests)].join(', ')})`)
  check(!bodies.some(b => b.includes(AI_KEY) || b.includes('PROBEkaspi')), 'ключа ИИ нет ни в одном ответе')
  // 409 без миграции — ожидаемый
  const unexpected = failedResponses.filter(r => !r.startsWith('409 /api/admin/kaspi/snapshots'))
  check(!unexpected.length, `нет неожиданных ошибок ответов${unexpected.length ? `: ${unexpected.join(', ')}` : ''}`)
  check(!errors.length, `нет ошибок консоли${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`)
}
catch (e) {
  fails.push(e.message)
  console.error(e)
}
finally {
  if (renamed)
    renameTable(true)
  cleanup()
  await removePhotos()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
  await browser.close()
  aiServer.close()
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nВсё зелёное')
process.exit(fails.length ? 1 : 0)

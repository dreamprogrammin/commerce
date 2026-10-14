/*
 * Отзыв по ссылке из письма — страница /review/<токен> и подпись гостя в
 * модерации. Только на ЛОКАЛЬНОЙ базе с применённой миграцией
 * 20261013120000_review_invites.
 *
 * Что проверяет (13 октября 2026):
 *  1) живая ссылка — 200 и на GET, и на HEAD (по HEAD эдж-функция решает,
 *     слать ли письмо), неизвестная — 404; страница закрыта от индексации;
 *  2) гость: имя из заказа подставлено, без оценки не отправить, отзыв
 *     уходит на модерацию с именем с формы, повторное открытие — «уже
 *     отправлен»;
 *  3) покупатель с аккаунтом: поля имени нет, отзыв ложится на профиль,
 *     обещаны 500 бонусов;
 *  4) просроченная и неизвестная ссылки — свои тексты;
 *  5) телефон 390 px: без горизонтальной прокрутки; без ошибок консоли;
 *     ни одного запроса к боевому Supabase;
 *  6) модерация: отзыв гостя подписан «… · гость, по ссылке из письма».
 *
 * Тестовые заказы заводятся через psql в контейнере базы с выключенными на
 * время вставки триггерами: их тела стучатся в БОЕВЫЕ эдж-функции
 * (docs/HANDOFF.md), и заказ, заведённый через REST, ушёл бы уведомлением в
 * рабочий Telegram. В конце всё заведённое удаляется.
 *
 *   node check-review-invite.mjs --base=http://localhost:3141
 *
 * Стенд: сборка на локальной базе — NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY локальные. SHOTS=<папка> — скриншоты.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import { chromium } from 'playwright'

// @supabase/ssr — зависимость @nuxtjs/supabase: pnpm не кладёт её в корневой
// node_modules, и прямой импорт (как в check-admin-carts.mjs) на macOS-машине
// падает с ERR_MODULE_NOT_FOUND. Берём её оттуда, где она лежит.
const { createServerClient } = createRequire(import.meta.resolve('@nuxtjs/supabase'))('@supabase/ssr')

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
// Имя куки сессии у браузерного клиента — `sb-<проект>-auth-token`, см. adminCookies
const BROWSER_COOKIE = 'sb-gvsdevsvzgcivpphcuai-auth-token'
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: скрипт заводит заказы и пользователей')

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
async function rest(path, init = {}) {
  const res = await fetch(`${SUPA}/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders, Prefer: 'return=representation', ...init.headers } })
  if (!res.ok)
    throw new Error(`REST ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function createUser(email, fullName) {
  const res = await fetch(`${SUPA}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders,
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName } }),
  })
  const user = await res.json()
  if (!res.ok)
    throw new Error(`пользователь ${email}: ${user.msg ?? res.status}`)
  return user.id
}
async function deleteUser(id) {
  await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

const stamp = Date.now()
const created = { users: [] }

async function setup() {
  const buyer = await createUser(`review-buyer-${stamp}@example.test`, 'Малик Тестов')
  const admin = await createUser(`review-admin-${stamp}@example.test`, 'Админ Проверки')
  created.users.push(buyer, admin)
  await rest(`profiles?id=eq.${buyer}`, { method: 'PATCH', body: JSON.stringify({ first_name: 'Малик', last_name: 'Тестов' }) })

  const out = psql(`
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.orders'::regclass, 'public.guest_checkouts'::regclass)
             AND NOT tgisinternal AND tgenabled = 'D') THEN
    RAISE EXCEPTION 'на заказах уже есть выключенные триггеры — ENABLE TRIGGER USER включил бы и их';
  END IF;
END $$;
-- Роль меняет только администратор (protect_profile_role_update), а на пустой
-- базе его нет — выдаём роль с выключенным на время транзакции триггером.
SELECT tgname AS role_trigger FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"role_trigger";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"role_trigger";
ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.guest_checkouts DISABLE TRIGGER USER;
SELECT (array_agg(id ORDER BY name, id))[1] AS pa, (array_agg(id ORDER BY name, id))[2] AS pb FROM public.products \\gset
INSERT INTO public.guest_checkouts (guest_name, guest_email, guest_phone, total_amount, final_amount, delivery_method, status)
VALUES ('Айгерим Нурланова', 'review-check@example.test', '+77000000000', 2000, 2000, 'pickup', 'delivered') RETURNING id AS gc \\gset
INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item) VALUES (:'gc', :'pa', 1, 1000), (:'gc', :'pb', 1, 1000);
INSERT INTO public.orders (user_id, total_amount, final_amount, delivery_method, status)
VALUES (:'uid', 1000, 1000, 'pickup', 'delivered') RETURNING id AS ord \\gset
INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase) VALUES (:'ord', :'pa', 1, 1000);
ALTER TABLE public.orders ENABLE TRIGGER USER;
ALTER TABLE public.guest_checkouts ENABLE TRIGGER USER;
COMMIT;
SELECT json_build_object('gc', :'gc', 'ord', :'ord', 'pa', :'pa', 'pb', :'pb',
  'guest', (SELECT json_object_agg(product_id, token) FROM public.create_review_invites('guest_checkouts', :'gc')),
  'user', (SELECT json_object_agg(product_id, token) FROM public.create_review_invites('orders', :'ord')),
  'names', (SELECT json_object_agg(id, name) FROM public.products));
`, { uid: buyer, admin })
  return { buyer, admin, ...JSON.parse(out) }
}

function cleanup(d) {
  if (d.gc || d.ord) {
    psql(`
BEGIN;
DELETE FROM public.product_reviews WHERE guest_checkout_id = :'gc' OR order_id = :'ord' OR user_id = :'uid';
DELETE FROM public.review_invites WHERE guest_checkout_id = :'gc' OR order_id = :'ord';
DELETE FROM public.guest_checkout_items WHERE checkout_id = :'gc';
DELETE FROM public.guest_checkouts WHERE id = :'gc';
DELETE FROM public.order_items WHERE order_id = :'ord';
DELETE FROM public.orders WHERE id = :'ord';
COMMIT;
`, { gc: d.gc, ord: d.ord, uid: d.buyer })
  }
}

async function adminCookies(userId) {
  const { email } = await (await fetch(`${SUPA}/auth/v1/admin/users/${userId}`, { headers: serviceHeaders })).json()
  const cookies = []
  // storageKey — как в nuxt.config.ts: под этим именем сайт хранит сессию в куке
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { error } = await ssr.auth.signInWithPassword({ email, password: PASSWORD })
  if (error)
    throw new Error(`вход администратора: ${error.message}`)
  /*
   * Браузерный клиент ищет сессию под другим именем: в @supabase/ssr 0.7
   * у createBrowserClient имя куки (`cookiePrefix`, зашит при сборке из
   * адреса базы) перебивает `auth.storageKey`, а у createServerClient — наоборот.
   * Модерация читает отзывы из браузера, поэтому кладём под оба имени.
   */
  return [...cookies, ...cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', BROWSER_COOKIE) }))]
}

let d = {}
const browser = await chromium.launch()
try {
  d = await setup()
  const tGuestA = d.guest[d.pa]
  const tGuestB = d.guest[d.pb]
  const tUser = d.user[d.pa]
  console.log(`стенд ${BASE}; товары «${d.names[d.pa]}», «${d.names[d.pb]}»`)

  console.log('\n== ответы сервера')
  const live = await fetch(`${BASE}/review/${tGuestA}`)
  check(live.status === 200, `живая ссылка: GET ${live.status}`)
  check((await fetch(`${BASE}/review/${tGuestA}`, { method: 'HEAD' })).status === 200, 'живая ссылка: HEAD 200 — по нему эдж-функция шлёт письмо')
  check(/noindex/.test(live.headers.get('x-robots-tag') ?? ''), `закрыта от индексации: X-Robots-Tag «${live.headers.get('x-robots-tag')}»`)
  const zeros = '0'.repeat(64)
  check((await fetch(`${BASE}/review/${zeros}`)).status === 404, 'неизвестная ссылка: GET 404')
  check((await fetch(`${BASE}/review/${zeros}`, { method: 'HEAD' })).status === 404, 'неизвестная ссылка: HEAD 404 — письмо со ссылкой в никуда не уйдёт')
  check((await fetch(`${BASE}/review/abc`)).status === 404, 'ссылка не того вида: 404')

  const prodHits = []
  const errors = []
  const failed = []
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    await ctx.route(/gvsdevsvzgcivpphcuai\.supabase\.co/, (route) => {
      prodHits.push(route.request().url())
      return route.abort()
    })
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', r => r.status() >= 400 && failed.push(`${r.status()} ${r.url().replace(BASE, '')} ← ${page.url().replace(BASE, '')}`))
    return page
  }
  const open = async (page, token) => {
    await page.goto(`${BASE}/review/${token}`, { waitUntil: 'load', timeout: 120000 })
    await page.waitForTimeout(1500)
  }
  const bodyText = page => page.evaluate(() => document.body.innerText)

  console.log('\n== гость, 1280 px')
  const desk = await newPage({ width: 1280, height: 900 })
  await open(desk, tGuestA)
  check((await bodyText(desk)).includes('Как вам товар?'), 'форма на месте')
  if (SHOTS)
    await desk.screenshot({ path: `${SHOTS}/review-form-1280.png`, fullPage: true })

  console.log('\n== гость, 390 px')
  const page = await newPage({ width: 390, height: 844 })
  await open(page, tGuestA)
  const text = await bodyText(page)
  check(text.includes(d.names[d.pa]), 'название купленного товара на странице')
  check(await page.inputValue('#review-name') === 'Айгерим', 'имя подставлено из заказа — только имя, без фамилии')
  check(await page.locator('button[type=submit]').isDisabled(), 'без оценки кнопка не нажимается')
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'нет горизонтальной прокрутки')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/review-form-390.png`, fullPage: true })
  await page.locator('form button[type=button]').nth(3).click()
  await page.fill('#review-text', 'Сын играет каждый день, всё целое.')
  await page.fill('#review-name', 'Айгерим Н.')
  await page.locator('button[type=submit]').click()
  await page.getByText('Спасибо за отзыв!').waitFor({ timeout: 15000 })
  check(!(await bodyText(page)).includes('500 бонусов'), 'гостю бонусы не обещаны')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/review-sent-390.png`, fullPage: true })
  const [guestReview] = await rest(`product_reviews?guest_checkout_id=eq.${d.gc}&product_id=eq.${d.pa}&select=user_id,rating,text,author_name,is_published`)
  check(guestReview?.user_id === null && guestReview.rating === 4 && guestReview.author_name === 'Айгерим Н.'
    && guestReview.text === 'Сын играет каждый день, всё целое.' && guestReview.is_published === false, `в базе: оценка ${guestReview?.rating}, имя «${guestReview?.author_name}», на модерации — ${guestReview?.is_published === false}`)
  await open(page, tGuestA)
  check((await bodyText(page)).includes('Отзыв уже отправлен'), 'повторное открытие ссылки — «уже отправлен»')

  console.log('\n== просроченная и неизвестная')
  await rest(`review_invites?token=eq.${tGuestB}`, { method: 'PATCH', body: JSON.stringify({ expires_at: new Date(Date.now() - 1000).toISOString() }) })
  await open(page, tGuestB)
  check((await bodyText(page)).includes('Ссылка устарела'), 'просроченная — «Ссылка устарела»')
  await open(page, zeros)
  check((await bodyText(page)).includes('Ссылка не найдена'), 'неизвестная — «Ссылка не найдена»')

  console.log('\n== покупатель с аккаунтом')
  await open(page, tUser)
  check(await page.locator('#review-name').count() === 0, 'поля имени нет — имя из профиля')
  await page.locator('form button[type=button]').nth(4).click()
  await page.locator('button[type=submit]').click()
  await page.getByText('Спасибо за отзыв!').waitFor({ timeout: 15000 })
  check((await bodyText(page)).includes('500 бонусов'), 'обещаны 500 бонусов после публикации')
  const [userReview] = await rest(`product_reviews?order_id=eq.${d.ord}&select=user_id,rating,author_name,is_published`)
  check(userReview?.user_id === d.buyer && userReview.rating === 5 && userReview.author_name === null && userReview.is_published === false, 'в базе: отзыв на профиле покупателя, без имени с формы, на модерации')

  console.log('\n== модерация')
  const cookies = await adminCookies(d.admin)
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  await adminCtx.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' })))
  const adminPage = await adminCtx.newPage()
  await adminPage.goto(`${BASE}/admin/reviews`, { waitUntil: 'load', timeout: 120000 })
  await adminPage.getByText('гость, по ссылке из письма').first().waitFor({ timeout: 20000 }).catch(() => {})
  const adminText = await bodyText(adminPage)
  check(adminText.includes('Айгерим Н. · гость, по ссылке из письма'), 'отзыв гостя подписан именем и пометкой')
  check(adminText.includes('Малик Тестов ·'), 'отзыв с аккаунтом — имя из профиля, как раньше')
  if (SHOTS)
    await adminPage.screenshot({ path: `${SHOTS}/admin-reviews.png`, fullPage: true })

  // Сбои загрузки сверяются по адресам ниже, в консоли их не считаем
  const consoleErrors = errors.filter(e => !e.startsWith('Failed to load resource'))
  check(!consoleErrors.length, `без ошибок консоли${consoleErrors.length ? ` — ${consoleErrors[0].slice(0, 160)}` : ''}`)
  /*
   * Ожидаемые 404: неизвестная ссылка из проверки выше и предзагрузка данных
   * ссылок шапки (`/brand/lego/_payload.json` и т. п.) — в локальной базе
   * этих брендов и разделов нет, на бою они есть.
   */
  const unexpected = [...new Set(failed)].filter(f => !f.startsWith(`404 /review/${zeros}`) && !/^404 \S+\/_payload\.json/.test(f))
  check(!unexpected.length, `лишних ответов с ошибкой нет${unexpected.length ? ` — ${unexpected[0]}` : ''}`)
  check(!prodHits.length, `ни одного запроса к боевому Supabase${prodHits.length ? ` — ${prodHits[0]}` : ''}`)
}
finally {
  await browser.close()
  cleanup(d)
  for (const id of created.users)
    await deleteUser(id)
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

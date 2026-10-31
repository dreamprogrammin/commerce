/*
 * Галочки и переключатели в админке — «Возвраты», «Акции», «Пункты
 * самовывоза» (1.11.2026) — только на ЛОКАЛЬНОЙ базе.
 *
 * Зачем. Галочки стояли как `:checked` / `@update:checked` — API radix-vue, а у
 * Checkbox из reka-ui 2 модель `modelValue`. Выбор жил в строке (клик по строке
 * его менял), а галочка его не показывала; клик по самой галочке менял только
 * её вид — выбор оставался прежним.
 *
 * Проверяет:
 *  1) «Возвраты»: клик по строке позиции ставит и галочку; клик по галочке
 *     выбирает и снимает позицию — строка и галочка всегда совпадают;
 *  2) «Акции»: то же для товаров (счётчик «Товары (N / M)») и галочка «выбрать
 *     все» в шапке таблицы;
 *  3) «Пункты самовывоза»: переключатель «Показывать в оформлении» (Switch, та
 *     же болезнь — `v-model:checked`) показывает и сохраняет `is_active` — и при
 *     создании, и при правке.
 *
 * Данные заводит сам — администратор, покупатель и доставленный заказ из двух
 * позиций (триггеры orders на время вставки выключены: их тела стучатся в
 * БОЕВЫЕ функции) — и в конце убирает. Ни возврат, ни акция не создаются;
 * тестовый пункт самовывоза создаётся и удаляется.
 *
 *   node check-admin-checkboxes.mjs --base=http://localhost:3141
 */
import { execFileSync } from 'node:child_process'
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
const DB_CONTAINER = 'supabase_db_gvsdevsvzgcivpphcuai'
// Стандартный демо-ключ локального Supabase — публичный
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PASSWORD = 'ProbaPassword123!'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей и заказ')

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

const stamp = Date.now()
const adminEmail = `checkbox-admin-${stamp}@example.test`
const pointName = `Пункт проверки ${stamp}`
const users = []
let d = null

const browser = await chromium.launch()
try {
  const adminId = await createUser(adminEmail)
  const buyerId = await createUser(`checkbox-buyer-${stamp}@example.test`)
  users.push(adminId, buyerId)
  d = JSON.parse(psql(`
SELECT tgname AS t FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass AND tgfoid = 'public.protect_profile_role_update()'::regprocedure \\gset
BEGIN;
ALTER TABLE public.profiles DISABLE TRIGGER :"t";
UPDATE public.profiles SET role = 'admin' WHERE id = :'admin';
ALTER TABLE public.profiles ENABLE TRIGGER :"t";
COMMIT;
SELECT (array_agg(id ORDER BY name, id))[1] AS pa, (array_agg(id ORDER BY name, id))[2] AS pb FROM public.products WHERE is_active \\gset
SELECT json_agg(json_build_object('id', id, 'stock_quantity', stock_quantity))::text AS saved FROM public.products WHERE id IN (:'pa', :'pb') \\gset
BEGIN;
ALTER TABLE public.orders DISABLE TRIGGER USER;
INSERT INTO public.orders (user_id, total_amount, final_amount, delivery_method, status)
VALUES (:'buyer', 3000, 3000, 'pickup', 'delivered') RETURNING id AS ord \\gset
INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase) VALUES (:'ord', :'pa', 2, 1000), (:'ord', :'pb', 1, 1000);
ALTER TABLE public.orders ENABLE TRIGGER USER;
COMMIT;
SELECT json_build_object('ord', :'ord', 'saved', :'saved'::json,
  'na', (SELECT btrim(name) FROM public.products WHERE id = :'pa'),
  'nb', (SELECT btrim(name) FROM public.products WHERE id = :'pb'),
  'cat', (SELECT c.name FROM public.categories c JOIN public.products p ON p.category_id = c.id WHERE p.id = :'pa'));
`, { admin: adminId, buyer: buyerId }).split('\n').pop())

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  // Окно подписки на Telegram — как будто в нём уже нажали «Не сейчас»
  await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
  await page.goto(`${BASE}/about`, { waitUntil: 'load', timeout: 120000 })
  await page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
  // Вход браузерным клиентом самого сайта — им же читает админка
  const loginError = await page.evaluate(async ({ email, password }) => {
    const nuxt = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
    const { error } = await nuxt.$supabase.client.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, { email: adminEmail, password: PASSWORD })
  if (loginError)
    throw new Error(`вход: ${loginError}`)

  console.log(`\n== «Возвраты» — заказ из двух позиций: «${d.na}», «${d.nb}»`)
  // Ввод до гидрации пропадает: v-model и обработчики ещё не подключены
  const hydrated = () => page.waitForFunction(() => document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 30000 })
  await page.goto(`${BASE}/admin/returns`, { waitUntil: 'load', timeout: 120000 })
  await hydrated()
  await page.waitForTimeout(500)
  const rpcAnswers = []
  page.on('response', r => r.url().includes('/rpc/get_order_for_return') && r.text().then(t => rpcAnswers.push(`${r.status()} ${t.slice(0, 200)}`)).catch(() => {}))
  await page.getByPlaceholder('Поиск по телефону, имени или UUID...').fill(d.ord)
  await page.getByPlaceholder('Поиск по телефону, имени или UUID...').press('Enter')
  try {
    await page.getByText(d.na, { exact: true }).waitFor({ timeout: 30000 })
  }
  catch (e) {
    console.log('  —   заказ не открылся; RPC:', rpcAnswers.join(' | ') || 'не вызывался')
    console.log('  —   на странице:', (await page.evaluate(() => document.querySelector('main')?.innerText ?? '')).replace(/\s+/g, ' ').slice(0, 300))
    throw e
  }
  const row = name => page.locator('div.rounded-lg.border', { has: page.getByText(name, { exact: true }) }).last()
  const rowState = async (name) => {
    const selected = (await row(name).getAttribute('class')).includes('border-primary')
    const box = await row(name).getByRole('checkbox').getAttribute('data-state')
    return { selected, box }
  }
  let a = await rowState(d.na)
  check(!a.selected && a.box === 'unchecked', 'сначала ничего не выбрано')
  await row(d.na).getByText(d.na, { exact: true }).click()
  a = await rowState(d.na)
  check(a.selected && a.box === 'checked', 'клик по строке — позиция выбрана, и галочка стоит')
  await row(d.nb).getByRole('checkbox').click()
  let b = await rowState(d.nb)
  check(b.selected && b.box === 'checked', 'клик по самой галочке — позиция выбрана')
  await row(d.nb).getByRole('checkbox').click()
  b = await rowState(d.nb)
  check(!b.selected && b.box === 'unchecked', 'повторный клик по галочке — снята, и выбор тоже')
  await row(d.na).getByText(d.na, { exact: true }).click()
  a = await rowState(d.na)
  check(!a.selected && a.box === 'unchecked', 'повторный клик по строке — снята и галочка')

  console.log(`\n== «Акции» — товары раздела «${d.cat}»`)
  await page.goto(`${BASE}/admin/promotions`, { waitUntil: 'load', timeout: 120000 })
  await hydrated()
  await page.waitForTimeout(500)
  await page.getByRole('combobox').filter({ hasText: 'Выберите категорию' }).click()
  await page.getByRole('option', { name: d.cat, exact: true }).click()
  const rows = page.locator('tbody tr')
  await rows.first().waitFor({ timeout: 30000 })
  const total = await rows.count()
  const counter = () => page.getByText(/^Товары \(\d+ \/ \d+\)$/).innerText()
  const boxes = () => rows.getByRole('checkbox').evaluateAll(els => els.map(e => e.getAttribute('data-state')))
  const header = page.locator('thead').getByRole('checkbox')
  check(await counter() === `Товары (0 / ${total})`, `товаров в разделе ${total}, выбрано 0`)
  await rows.nth(0).locator('td').nth(2).click()
  check(await counter() === `Товары (1 / ${total})` && (await boxes())[0] === 'checked', 'клик по строке — товар выбран, и галочка стоит')
  if (total > 1) {
    await rows.nth(1).getByRole('checkbox').click()
    check(await counter() === `Товары (2 / ${total})` && (await boxes())[1] === 'checked', 'клик по самой галочке — товар выбран')
  }
  await header.click()
  check(await counter() === `Товары (${total} / ${total})` && (await boxes()).every(s => s === 'checked') && await header.getAttribute('data-state') === 'checked', 'галочка в шапке — выбраны все, все галочки стоят')
  await header.click()
  check(await counter() === `Товары (0 / ${total})` && (await boxes()).every(s => s === 'unchecked') && await header.getAttribute('data-state') === 'unchecked', 'галочка в шапке ещё раз — сняты все')

  console.log('\n== «Пункты самовывоза» — переключатель «Показывать в оформлении»')
  await page.goto(`${BASE}/admin/pickup-points`, { waitUntil: 'load', timeout: 120000 })
  await hydrated()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()
  const toggle = page.locator('#pp-active')
  await toggle.waitFor()
  check(await toggle.getAttribute('data-state') === 'checked', 'новый пункт: переключатель включён — как и показ в форме')
  await toggle.click()
  check(await toggle.getAttribute('data-state') === 'unchecked', 'переключатель выключается')
  await page.fill('#pp-name', pointName)
  await page.fill('#pp-address', 'г. Алматы, ул. Проверочная, 1')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.getByText(pointName, { exact: true }).waitFor({ timeout: 15000 })
  const active = () => psql(`SELECT is_active FROM public.pickup_points WHERE name = :'n'`, { n: pointName })
  check(active() === 'f', 'сохранён выключенным — в базе is_active = false')
  const card = page.locator('div', { has: page.getByText(pointName, { exact: true }) }).filter({ has: page.locator('button') }).last()
  await card.getByRole('button').first().click()
  await toggle.waitFor()
  check(await toggle.getAttribute('data-state') === 'unchecked', 'правка: переключатель показывает «выключен»')
  await toggle.click()
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await page.waitForTimeout(1500)
  check(active() === 't', 'включили и сохранили — в базе is_active = true')

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
}
finally {
  await browser.close()
  psql(`DELETE FROM public.pickup_points WHERE name = :'n'`, { n: pointName })
  if (d) {
    psql(`
BEGIN;
DELETE FROM public.order_items WHERE order_id = :'ord';
DELETE FROM public.orders WHERE id = :'ord';
UPDATE public.products p SET stock_quantity = s.stock_quantity
FROM json_to_recordset(:'saved'::json) AS s(id uuid, stock_quantity integer) WHERE p.id = s.id;
COMMIT;
`, { ord: d.ord, saved: JSON.stringify(d.saved) })
  }
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

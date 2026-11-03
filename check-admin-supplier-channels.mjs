/*
 * Каналы поставщиков в Telegram (3.11.2026) — только на ЛОКАЛЬНОЙ базе с
 * миграцией 20261103120000_supplier_channels. Каналы проверяются у настоящего
 * Telegram (t.me), поэтому нужен интернет: @durov — открытый канал, @ru_python —
 * группа, @BotFather — бот.
 *
 * Проверяет:
 *  1) маршруты каналов: гость — 401, не-администратор — 403; проверка ссылки у
 *     Telegram: канал, группа, бот, несуществующее имя, устаревшее приглашение,
 *     не ссылка на Telegram;
 *  2) окно нового поставщика: ссылка → канал с названием, подписчиками и
 *     последним постом, название поставщика подставляется из канала; группа;
 *     бот и ссылка на пост закрытого канала — отказ с причиной; «Создать» —
 *     поставщик и каналы в базе, кто добавил; в таблице — каналы поставщика;
 *  3) тот же канал второму поставщику — отказ «уже у поставщика …»;
 *  4) правка: убрать канал и вернуть его в том же окне — запись та же; убрать
 *     и сохранить — канала нет в базе; удаление поставщика — каналы с ним;
 *  5) без миграции (таблица на время переименована) страница работает как
 *     раньше и говорит, что каналы появятся после миграции;
 *  6) телефон 390px: окно с каналами без горизонтальной прокрутки; без ошибок
 *     консоли.
 *
 * Данные заводит сам — администратор, покупатель, поставщики — и в конце всё
 * убирает. Роль администратора — psql с выключенным на время транзакции
 * триггером роли.
 *
 *   sg docker -c "node check-admin-supplier-channels.mjs --base=http://localhost:3141"
 *
 * Стенд: сборка на локальной базе (NUXT_PUBLIC_SUPABASE_URL/KEY и
 * NUXT_SUPABASE_SERVICE_ROLE_KEY — локальные). SHOTS=<папка> — скриншоты.
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
const SUPPLIER = 'Проверка каналов поставщика'
const SECOND = 'Проверка каналов — второй'
const SHOTS = process.env.SHOTS

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд: страж заводит пользователей и поставщиков')

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
  let json = null
  try {
    json = await res.json()
  }
  catch {}
  return { status: res.status, json }
}

const stamp = Date.now()
const emails = { admin: `channels-admin-${stamp}@example.test`, buyer: `channels-buyer-${stamp}@example.test` }
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

function cleanup() {
  psql(`DELETE FROM public.suppliers WHERE name IN ('${SUPPLIER}', '${SECOND}', 'Pavel Durov');`)
}

const dbSupplier = async name => (await rest(`suppliers?select=id,name&name=eq.${encodeURIComponent(name)}`))[0]
const dbChannels = async supplierId => rest(`supplier_channels?select=id,username,invite_hash,title,chat_type,web_preview,created_by&supplier_id=eq.${supplierId}&order=created_at`)

const browser = await chromium.launch()
let renamed = false
try {
  cleanup()
  const adminId = await createUser(emails.admin)
  const buyerId = await createUser(emails.buyer)
  users.push(adminId, buyerId)
  makeAdmin(adminId)
  const adminToken = await tokenFor(emails.admin)
  const buyerToken = await tokenFor(emails.buyer)
  console.log(`стенд ${BASE}`)

  console.log('\n== маршруты')
  check((await api('/api/admin/suppliers/channels', null)).status === 401, 'список: гость — 401')
  check((await api('/api/admin/suppliers/channels', buyerToken)).status === 403, 'список: не-администратор — 403')
  check((await api('/api/admin/suppliers/channels/check', buyerToken, { link: '@durov' })).status === 403, 'проверка: не-администратор — 403')
  check((await api('/api/admin/suppliers/channels', buyerToken, { supplierId: adminId, link: '@durov' })).status === 403, 'запись: не-администратор — 403')
  check((await api(`/api/admin/suppliers/channels/${adminId}`, buyerToken, null, 'DELETE')).status === 403, 'удаление: не-администратор — 403')
  const list = await api('/api/admin/suppliers/channels', adminToken)
  check(list.status === 200 && list.json?.installed === true && Array.isArray(list.json.channels), 'список: администратору — массив, миграция применена')

  const durov = await api('/api/admin/suppliers/channels/check', adminToken, { link: 'https://t.me/durov' })
  check(durov.status === 200 && durov.json.username === 'durov' && durov.json.type === 'channel' && durov.json.webPreview === true
    && durov.json.members > 1_000_000 && Date.parse(durov.json.lastPostAt) > 0 && durov.json.existing === null, `@durov — открытый канал «${durov.json?.title}», ${durov.json?.members} подписчиков, последний пост ${durov.json?.lastPostAt}`)
  const group = await api('/api/admin/suppliers/channels/check', adminToken, { link: '@ru_python' })
  check(group.status === 200 && group.json.type === 'group' && group.json.webPreview === false && group.json.members > 0, `@ru_python — группа «${group.json?.title}», ${group.json?.members} участников, без просмотра`)
  for (const [link, reason, what] of [
    ['https://t.me/BotFather', /не канал/, 'бот'],
    ['@no_such_channel_xyz_98765', /нет канала/, 'несуществующее имя'],
    ['https://t.me/+AAAAAAAAAAAAAAAAAAAAAA', /устарело/, 'устаревшее приглашение'],
    ['https://instagram.com/amrtoys', /Нужна ссылка на Telegram/, 'не Telegram'],
  ]) {
    const r = await api('/api/admin/suppliers/channels/check', adminToken, { link })
    check(r.status === 400 && reason.test(r.json?.message), `${what} — 400 «${r.json?.message}»`)
  }

  const errors = []
  const failed = []
  async function newPage(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 })
    await ctx.addInitScript(() => localStorage.setItem('tg_modal_dismissed_at', String(Date.now())))
    const page = await ctx.newPage()
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && !m.text().includes('[nuxt-gtag]') && errors.push(m.text()))
    page.on('response', (r) => {
      // Отказы проверки ссылки — ответ, который страница показывает человеку
      if (r.status() === 400 && r.url().includes('/api/admin/suppliers/channels/check'))
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
    await page.goto(`${BASE}/admin/suppliers`, { waitUntil: 'load', timeout: 120000 })
    await page.getByRole('button', { name: 'Добавить поставщика' }).waitFor({ timeout: 30000 })
    await page.waitForLoadState('networkidle')
    return page
  }
  // Окно поставщика: DialogContent рендерится в портал, атрибуты страницы до него не доходят — по роли
  const dialog = page => page.getByRole('dialog')
  // server: false — ссылка отсекается в браузере, запроса к серверу нет
  async function addLink(page, link, { server = true } = {}) {
    await dialog(page).locator('#supplier-channel').fill(link)
    const asked = server && page.waitForResponse(r => r.url().includes('/api/admin/suppliers/channels/check'), { timeout: 30000 })
    await dialog(page).locator('[data-testid=channel-add]').click()
    if (asked) {
      await asked
      await page.waitForFunction(() => !document.querySelector('[data-testid=channel-add] .animate-spin'), null, { timeout: 30000 })
    }
    else {
      await page.waitForTimeout(200)
    }
  }
  const drafts = page => dialog(page).locator('[data-testid=channel-draft]')
  const channelError = async page => (await dialog(page).locator('[data-testid=channel-error]').count()) ? dialog(page).locator('[data-testid=channel-error]').innerText() : ''
  async function openEdit(page, name) {
    await page.locator('tr', { hasText: name }).getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Редактировать' }).click()
    await dialog(page).waitFor()
  }

  console.log('\n== новый поставщик из канала, 1366 px')
  const page = await newPage({ width: 1366, height: 900 })
  await page.getByRole('button', { name: 'Добавить поставщика' }).click()
  await dialog(page).waitFor()
  await addLink(page, 'https://t.me/durov')
  check(await drafts(page).count() === 1, 'канал по ссылке — в списке окна')
  const draftText = await drafts(page).first().innerText()
  check(/Pavel Durov/.test(draftText) && /@durov · открытый, читается без аккаунта/.test(draftText) && /подписчик/.test(draftText) && /последний пост/.test(draftText) && /Новый — запишется при сохранении/.test(draftText), `в окне: название, «открытый», подписчики, последний пост, «запишется при сохранении» — «${draftText.replace(/\s+/g, ' ')}»`)
  check(await dialog(page).locator('#supplier-name').inputValue() === 'Pavel Durov', 'название поставщика подставлено из канала')
  await dialog(page).locator('#supplier-name').fill(SUPPLIER)
  await addLink(page, '@ru_python')
  check(await drafts(page).count() === 2 && /группа — читать через аккаунт/.test(await drafts(page).nth(1).innerText()), 'группа — «читать через аккаунт»')
  await addLink(page, 'https://t.me/BotFather')
  check(/не канал/.test(await channelError(page)) && await drafts(page).count() === 2, `бот — отказ «${await channelError(page)}»`)
  check(await dialog(page).locator('#supplier-channel').inputValue() === 'https://t.me/BotFather', 'отказанная ссылка остаётся в поле — поправить')
  await addLink(page, 't.me/c/1234567890/55', { server: false })
  check(/пост закрытого канала/.test(await channelError(page)), `ссылка на пост закрытого канала — отказ сразу «${await channelError(page)}»`)
  await addLink(page, 'DUROV', { server: false })
  check(/уже в списке/.test(await channelError(page)) && await drafts(page).count() === 2, 'тот же канал второй раз — «уже в списке»')
  await dialog(page).locator('[data-testid=supplier-save]').click()
  check(/Нажмите «Добавить» или очистите поле/.test(await channelError(page)) && await dialog(page).isVisible(), 'в поле осталась ссылка — «Создать» не теряет её молча')
  await dialog(page).locator('#supplier-channel').fill('')
  // Шапка сайта на ≥lg фиксирована и лежит выше окон (z-index 100): высокое окно
  // не должно уходить верхом под неё — ни на 900, ни на 768 px по высоте
  // Сравнение координат, а не elementFromPoint: открытое модальное окно ставит
  // остальной странице pointer-events: none, и точка «пробивает» шапку насквозь
  const titleCovered = () => page.evaluate(() => {
    const header = document.querySelector('header.sh-header')
    const box = document.querySelector('[role=dialog]')
    return box.getBoundingClientRect().top < (header?.getBoundingClientRect().bottom ?? 0)
  })
  check(!(await titleCovered()), 'окно с двумя каналами не уходит верхом под шапку сайта (1366×900)')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/channels-dialog-1366.png` })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.waitForTimeout(300)
  check(!(await titleCovered()), 'и на 1366×768')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/channels-dialog-1366x768.png` })
  await page.setViewportSize({ width: 1366, height: 900 })
  await dialog(page).locator('[data-testid=supplier-save]').click()
  await dialog(page).waitFor({ state: 'hidden', timeout: 30000 })
  const sup = await dbSupplier(SUPPLIER)
  let rows = sup ? await dbChannels(sup.id) : []
  check(rows.length === 2 && rows[0].username === 'durov' && rows[0].web_preview === true && rows[0].chat_type === 'channel'
    && rows[1].username === 'ru_python' && rows[1].chat_type === 'group' && rows[1].web_preview === false && rows.every(r => r.created_by === adminId), 'в базе: поставщик и два канала — канал с просмотром, группа без; кто добавил')
  const row = page.locator('tr', { hasText: SUPPLIER })
  await row.locator('[data-testid=supplier-channel]').first().waitFor({ timeout: 15000 })
  const chips = await row.locator('[data-testid=supplier-channel]').evaluateAll(els => els.map(a => ({ text: a.textContent.trim(), href: a.getAttribute('href') })))
  check(chips.length === 2 && chips[0].href === 'https://t.me/durov' && chips[1].href === 'https://t.me/ru_python', `в таблице — каналы поставщика со ссылками: ${chips.map(c => c.text).join(', ')}`)
  await page.getByPlaceholder('Поиск по названию').fill('ru_python')
  check(await page.locator('tr', { hasText: SUPPLIER }).count() === 1, 'поиск находит поставщика по каналу')
  await page.getByPlaceholder('Поиск по названию').fill('')
  if (SHOTS)
    await page.screenshot({ path: `${SHOTS}/channels-table-1366.png` })

  console.log('\n== тот же канал второму поставщику')
  await page.getByRole('button', { name: 'Добавить поставщика' }).click()
  await dialog(page).locator('#supplier-name').fill(SECOND)
  await addLink(page, '@durov')
  check((await channelError(page)).includes(`уже у поставщика «${SUPPLIER}»`) && await drafts(page).count() === 0, `отказ «${await channelError(page)}»`)
  await dialog(page).getByRole('button', { name: 'Отмена' }).click()
  await dialog(page).waitFor({ state: 'hidden' })
  const dup = await api('/api/admin/suppliers/channels', adminToken, { supplierId: sup.id, link: '@durov' })
  check(dup.status === 409 && /у поставщика уже есть/.test(dup.json?.message), `запись того же канала мимо окна — 409 «${dup.json?.message}»`)

  console.log('\n== правка: убрать и вернуть, убрать и сохранить')
  await openEdit(page, SUPPLIER)
  check(await drafts(page).count() === 2 && !/Новый/.test(await drafts(page).first().innerText()), 'в окне правки — записанные каналы, без «новый»')
  await drafts(page).first().locator('[data-testid=channel-remove]').click()
  await addLink(page, '@durov', { server: false })
  check(await drafts(page).count() === 2 && !/Новый/.test(await drafts(page).last().innerText()), 'убранный канал вернули — он снова записанный, не новый')
  await drafts(page).filter({ hasText: 'ru_python' }).locator('[data-testid=channel-remove]').click()
  await dialog(page).locator('[data-testid=supplier-save]').click()
  await dialog(page).waitFor({ state: 'hidden', timeout: 30000 })
  const before = rows
  rows = await dbChannels(sup.id)
  check(rows.length === 1 && rows[0].id === before[0].id, 'в базе: @durov та же запись, @ru_python убран')
  check(await page.locator('tr', { hasText: SUPPLIER }).locator('[data-testid=supplier-channel]').count() === 1, 'в таблице — один канал')

  console.log('\n== телефон 390 px')
  const mobile = await newPage({ width: 390, height: 844 })
  const card = mobile.locator('div.md\\:hidden [data-slot=card]', { hasText: SUPPLIER })
  check(await card.locator('[data-testid=supplier-channel]').count() === 1, 'в карточке поставщика — его канал')
  await card.getByRole('button').first().click()
  await mobile.getByRole('menuitem', { name: 'Редактировать' }).click()
  await dialog(mobile).waitFor()
  await addLink(mobile, 'https://t.me/joinchat/AAAAAAAAAAAAAAAAAAAAAA')
  check(/устарело/.test(await channelError(mobile)), `устаревшее приглашение — «${await channelError(mobile)}»`)
  check(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'окно с каналом и ошибкой — без горизонтальной прокрутки')
  const box = await dialog(mobile).boundingBox()
  const add = await dialog(mobile).locator('[data-testid=channel-add]').boundingBox()
  check(box && add && add.x + add.width <= box.x + box.width, 'кнопка «Добавить» не вылезает за край окна')
  if (SHOTS)
    await mobile.screenshot({ path: `${SHOTS}/channels-dialog-390.png` })
  await mobile.keyboard.press('Escape')
  await mobile.context().close()

  console.log('\n== удаление поставщика')
  await page.locator('tr', { hasText: SUPPLIER }).getByRole('button').click()
  await page.getByRole('menuitem', { name: 'Удалить' }).click()
  check(/каналы в Telegram уберутся/.test(await page.getByRole('alertdialog').innerText()), 'подтверждение говорит, что каналы уйдут вместе с поставщиком')
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click()
  await page.locator('tr', { hasText: SUPPLIER }).waitFor({ state: 'detached', timeout: 15000 })
  check((await dbChannels(sup.id)).length === 0, 'в базе каналов поставщика нет')

  console.log('\n== без миграции')
  psql(`ALTER TABLE public.supplier_channels RENAME TO supplier_channels_check_off; NOTIFY pgrst, 'reload schema';`)
  renamed = true
  await new Promise(r => setTimeout(r, 1500))
  const off = await api('/api/admin/suppliers/channels', adminToken)
  check(off.status === 200 && off.json?.installed === false, 'список без таблицы — installed: false, не 500')
  const bare = await newPage({ width: 1366, height: 900 })
  await bare.getByRole('button', { name: 'Добавить поставщика' }).click()
  await dialog(bare).waitFor()
  check(await dialog(bare).locator('[data-testid=channels-not-installed]').isVisible() && await dialog(bare).locator('[data-testid=channels-field]').count() === 0, 'окно поставщика — без поля каналов, с пояснением про миграцию')
  await dialog(bare).locator('#supplier-name').fill(SECOND)
  await dialog(bare).locator('[data-testid=supplier-save]').click()
  await dialog(bare).waitFor({ state: 'hidden', timeout: 30000 })
  check(!!(await dbSupplier(SECOND)), 'поставщик без миграции каналов создаётся как раньше')
  await bare.context().close()

  check(!errors.length, `без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  check(!failed.length, `без ответов с ошибкой${failed.length ? ` — ${failed[0]}` : ''}`)
}
finally {
  await browser.close()
  if (renamed)
    psql(`ALTER TABLE public.supplier_channels_check_off RENAME TO supplier_channels; NOTIFY pgrst, 'reload schema';`)
  cleanup()
  for (const id of users)
    await fetch(`${SUPA}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: serviceHeaders })
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

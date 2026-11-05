/*
 * «Модели ИИ» в админке (31.10.2026) — только на ЛОКАЛЬНОЙ базе и с
 * заглушкой провайдеров (сервер запущен с AI_STUB_URL=http://localhost:8788,
 * заглушка — по образцу в docs/HANDOFF.md). Проверяет:
 *  1) гость — 401, не-администратор — 403;
 *  2) отклонённый провайдером ключ, мусор и OpenRouter — 400, в Vault не попадают;
 *  3) через страницу: ключ проверяется и сохраняется, на странице и в ответах
 *     сервера его нет — только последние 4 символа; в Vault — он целиком;
 *  4) модель выбирается из живого списка; модель без картинок и чужая — 400;
 *  5) удаление ключа — по второму клику.
 * Ключи и выбор модели после прогона удаляются.
 *
 *   node check-admin-ai.mjs --base=http://localhost:3141
 */
import process from 'node:process'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3141'
const SUPA = 'http://127.0.0.1:54321'
// Стандартные демо-ключи локального Supabase — публичные
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const PASSWORD = 'ProbaPassword123!'
// Ключи, которые принимает заглушка
const GOOD = 'sk-ant-api03-GOODKEYxxxxxxxxxxxxxxxxxxxxxxxx7Q2z'
const GOOD_GEMINI = 'AIzaSyGOODgeminiKEYxxxxxxxxxxxxxxxx'

if (!/localhost|127\.0\.0\.1/.test(BASE))
  throw new Error('Только локальный стенд')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const svc = { 'apikey': SERVICE, 'Authorization': `Bearer ${SERVICE}`, 'Content-Type': 'application/json' }
const rest = async path => (await fetch(`${SUPA}/rest/v1/${path}`, { headers: svc })).json()
async function rpc(fn, args = {}) {
  const text = await (await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: svc, body: JSON.stringify(args) })).text()
  return text ? JSON.parse(text) : null
}

async function signIn(role) {
  const [profile] = await rest(`profiles?select=id&role=${role === 'admin' ? 'eq' : 'neq'}.admin&limit=1`)
  const user = await (await fetch(`${SUPA}/auth/v1/admin/users/${profile.id}`, { method: 'PUT', headers: svc, body: JSON.stringify({ password: PASSWORD }) })).json()
  const cookies = []
  const ssr = createServerClient(SUPA, ANON, { auth: { storageKey: 'supabase-auth-token' }, cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
  const { data, error } = await ssr.auth.signInWithPassword({ email: user.email, password: PASSWORD })
  if (error)
    throw new Error(`${role}: ${error.message}`)
  return { cookies, token: data.session.access_token }
}

async function api(path, token, init = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' } })
  const text = await res.text()
  return { status: res.status, text, body: (() => {
    try { return JSON.parse(text) }
    catch { return null }
  })() }
}

async function cleanup() {
  for (const p of ['anthropic', 'openai', 'gemini'])
    await rpc('ai_key_delete', { p_provider: p })
  await fetch(`${SUPA}/rest/v1/ai_settings?key=eq.supplier_vision_model`, { method: 'DELETE', headers: svc })
}

console.log(`стенд ${BASE}`)
await cleanup()
try {
  console.log('\n== доступ')
  check((await api('/api/admin/ai-settings')).status === 401, 'гость — 401')
  const user = await signIn('user')
  check((await api('/api/admin/ai-settings', user.token)).status === 403, 'не-администратор — 403')
  check((await api('/api/admin/ai-settings/key', user.token, { method: 'POST', body: JSON.stringify({ provider: 'anthropic', key: GOOD }) })).status === 403, 'не-администратор не может задать ключ')

  console.log('\n== проверки ключа')
  const admin = await signIn('admin')
  const post = body => api('/api/admin/ai-settings/key', admin.token, { method: 'POST', body: JSON.stringify(body) })
  const bad = await post({ provider: 'anthropic', key: 'sk-ant-api03-WRONGxxxxxxxxxxxxxxxxxxxxxxxxx' })
  check(bad.status === 400 && bad.body?.message?.includes('не подошёл'), `чужой ключ — 400: ${bad.body?.message}`)
  check(!bad.text.includes('WRONG'), 'в ответе нет кусков ключа')
  const oa = await post({ provider: 'openai', key: 'sk-proj-WRONGxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
  check(oa.status === 400 && !oa.text.includes('sk-proj'), 'OpenAI отклонил — 400, текст провайдера не пересказан')
  check((await post({ provider: 'openrouter', key: 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxx' })).status === 400, 'OpenRouter — 400')
  check((await post({ provider: 'anthropic', key: 'short' })).status === 400, 'мусор вместо ключа — 400')
  check((await rpc('ai_keys_status')).length === 0, 'после отказов Vault пуст')

  console.log('\n== страница')
  const browser = await chromium.launch()
  try {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } })
    await ctx.addCookies([...admin.cookies, ...admin.cookies.map(c => ({ ...c, name: c.name.replace('supabase-auth-token', 'sb-127-auth-token') }))]
      .map(c => ({ name: c.name, value: c.value, domain: new URL(BASE).hostname, path: '/' })))
    const page = await ctx.newPage()
    const errors = []
    const responses = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => m.type() === 'error' && !m.text().includes('[nuxt-gtag]') && !m.text().includes('status of 400') && errors.push(m.text()))
    page.on('response', async (r) => {
      if (r.url().includes('/api/admin/ai-settings'))
        responses.push(await r.text().catch(() => ''))
    })
    await page.goto(`${BASE}/admin/ai`, { waitUntil: 'load', timeout: 120000 })
    await page.getByText('Ключи API').waitFor({ timeout: 30000 })
    check(await page.getByText('не задан').count() === 3, 'сначала все три — «не задан»')

    await page.getByLabel('Ключ Anthropic (Claude)').fill(GOOD)
    check(await page.getByLabel('Ключ Anthropic (Claude)').getAttribute('type') === 'password', 'поле ключа скрывает ввод')
    await page.getByRole('button', { name: 'Проверить и сохранить' }).first().click()
    await page.getByText('задан ••••7Q2z').waitFor({ timeout: 30000 })
    check(true, 'ключ сохранён: на странице ••••7Q2z')
    check(await page.getByLabel('Ключ Anthropic (Claude)').inputValue() === '', 'поле очищено после сохранения')
    check((await rpc('ai_key_get', { p_provider: 'anthropic' })) === GOOD, 'в Vault — ключ целиком')

    await page.getByLabel('Ключ Google (Gemini)').fill(GOOD_GEMINI)
    await page.getByRole('button', { name: 'Проверить и сохранить' }).nth(2).click()
    await page.getByText('задан ••••xxxx').waitFor({ timeout: 30000 })

    // Модель: из живого списка, без моделей без картинок
    const modelSelect = page.getByLabel('Модель')
    await page.waitForFunction(() => document.querySelector('select[aria-label="Модель"]')?.options.length > 1, null, { timeout: 30000 })
    const options = await modelSelect.locator('option').allTextContents()
    check(options.some(o => o.includes('Claude Sonnet 5.5')) && !options.some(o => o.includes('Text Only')), `список моделей живой, без «только текст»: ${options.length - 1}`)
    await modelSelect.selectOption('claude-sonnet-5-5')
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await page.getByText('Сейчас: anthropic/claude-sonnet-5-5').waitFor({ timeout: 30000 })
    const [setting] = await rest('ai_settings?select=value,updated_by&key=eq.supplier_vision_model')
    check(setting?.value === 'anthropic/claude-sonnet-5-5' && Boolean(setting?.updated_by), `ai_settings: ${setting?.value}, кто выбрал записано`)
    await page.getByLabel('Провайдер').selectOption('gemini')
    await page.waitForFunction(() => [...document.querySelector('select[aria-label="Модель"]').options].some(o => o.value === 'gemini-2.5-flash'), null, { timeout: 30000 })
    check(!(await modelSelect.locator('option').allTextContents()).some(o => o.includes('Embedding')), 'Gemini: только модели для диалога')
    if (process.env.SHOT)
      await page.screenshot({ path: `${process.env.SHOT}-ai.png`, fullPage: true })

    const put = model => api('/api/admin/ai-settings/model', admin.token, { method: 'PUT', body: JSON.stringify({ task: 'supplier_vision_model', model }) })
    check((await put('anthropic/claude-textonly-test')).status === 400, 'модель без картинок — 400')
    check((await put('anthropic/claude-nonexistent')).status === 400, 'несуществующая модель — 400')
    check((await put('openai/gpt-x')).status === 400, 'провайдер без ключа — 400')
    check((await put('openrouter/x')).status === 400, 'OpenRouter — 400')

    const html = await page.content()
    check(!html.includes(GOOD) && !html.includes(GOOD_GEMINI), 'на странице нет ключей')
    check(responses.length > 0 && !responses.some(t => t.includes(GOOD) || t.includes(GOOD_GEMINI)), `в ответах сервера нет ключей (${responses.length} ответов)`)

    // Удаление — по второму клику
    await page.getByRole('button', { name: 'Удалить' }).first().click()
    check((await rpc('ai_keys_status')).length === 2, 'первый клик ничего не удаляет')
    await page.getByRole('button', { name: 'Точно удалить?' }).click()
    await page.getByText('задан ••••7Q2z').waitFor({ state: 'detached', timeout: 30000 })
    check(!(await rpc('ai_keys_status')).some(k => k.provider === 'anthropic'), 'второй клик удалил ключ из Vault')
    await page.getByText('Ключа для этой модели нет').waitFor({ timeout: 10000 })
    check(true, 'модель без ключа — предупреждение на странице')
    check(!errors.length, `страница без ошибок консоли${errors.length ? ` — ${errors[0].slice(0, 160)}` : ''}`)
  }
  finally {
    await browser.close()
  }
}
finally {
  await cleanup()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

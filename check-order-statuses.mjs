/**
 * Как выглядит заказ на странице /profile/order/<id> при каждом статусе.
 *
 * Гоняет заказ по всем статусам подряд и печатает, что видит покупатель:
 * заголовок, плашку и заполнение полосы прогресса. Так были пойманы оба
 * бага 2 сентября 2026 — прыжок `confirmed` → «Доставлен» (лечился
 * миграцией) и полоса, ехавшая назад при подтверждении.
 *
 * Стенд — dev на ЛОКАЛЬНОЙ базе, вход по рецепту из docs/HANDOFF.md.
 *   node check-order-statuses.mjs
 */
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE || 'http://localhost:3003'
const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const USER_ID = '653f339a-250a-4e52-ba86-6adcaf6fbfa5'
const EMAIL = 'test@uhti.local'
const PASSWORD = 'ProbaPassword123!'
const ORDER = '1cfa2733-8c56-495d-be05-69807f5e4fc2'

const service = createClient(SUPA, SERVICE)
await fetch(`${SUPA}/auth/v1/admin/users/${USER_ID}`, {
  method: 'PUT',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
const cookies = []
const ssr = createServerClient(SUPA, ANON, { cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
const { error } = await ssr.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
if (error) throw new Error(error.message)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } })
await ctx.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
const page = await ctx.newPage()
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 200)}`))

for (const status of ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'completed', 'cancelled']) {
  await service.from('orders').update({ status }).eq('id', ORDER)
  await page.goto(`${BASE}/profile/order/${ORDER}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('.opb-seg', { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(2500)

  const hero = (await page.locator('h1, h2').allTextContents()).map(t => t.trim()).filter(Boolean)[0] ?? '—'
  // полоса прогресса: подписи + какие подсвечены
  const segs = await page.locator('.opb-seg').evaluateAll(els =>
    els.map(el => ({
      done: el.classList.contains('opb-seg--done'),
      cancelled: el.classList.contains('opb-seg--cancelled'),
    })))
  const labels = ['Принят', 'В работе', 'Подтверждён', 'В пути', 'Доставлен']
  const bar = segs.map((s, i) => (s.cancelled ? `[${labels[i]}✗]` : s.done ? `[${labels[i]}●]` : `${labels[i]}·`)).join(' ')
  // Плашка статуса — соседка заголовка «Заказ №…», ищем по её классам.
  const badge = (await page.locator('span.rounded-full, span[class*="rounded"]').allTextContents())
    .map(t => t.trim())
    .find(t => /^(В обработке|Подтверждён|Доставляется|Выполнен|Отменён|completed|processing|confirmed|shipped|delivered|new|pending)$/.test(t)) ?? '—'
  console.log(`\n${status.padEnd(10)} герой: «${hero}» | плашка: «${badge}»`)
  if (status === 'confirmed' || status === 'completed') {
    await page.screenshot({ path: `/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/order-${status}-fixed.png` })
  }
  console.log(`           полоса: ${bar || '— нет'}`)
}

await service.from('orders').update({ status: 'shipped' }).eq('id', ORDER)
console.log(`\nошибок консоли: ${errors.length}`)
for (const e of errors) console.log('   ' + e)
await browser.close()

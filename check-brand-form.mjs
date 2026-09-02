/**
 * Форма бренда в админке: новые поля видны, сохраняются, попадают в базу.
 * Стенд — dev-сервер на ЛОКАЛЬНОЙ базе (порт 3003), вход по рецепту из
 * docs/HANDOFF.md (пароль админу сервисным ключом + куки @supabase/ssr).
 *   node check-brand-form.mjs
 */
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'

const BASE = process.env.BASE || 'http://localhost:3003'
const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const ADMIN_ID = 'cad0cf3c-f790-42a3-ae9d-b0fec109ebff'
const ADMIN_EMAIL = 'settings-check@example.com'
const PASSWORD = 'ProbaPassword123!'
const BRAND_ID = '063efc57-9bca-461e-98c3-9ab0d7c767d0' // cada

// 1. пароль администратору
await fetch(`${SUPA}/auth/v1/admin/users/${ADMIN_ID}`, {
  method: 'PUT',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})

// 2. сессия и куки
const cookies = []
const client = createServerClient(SUPA, ANON, {
  cookies: { getAll: () => [], setAll: list => cookies.push(...list) },
})
const { error } = await client.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD })
if (error) throw new Error(`вход не удался: ${error.message}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
const page = await ctx.newPage()
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 140)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 140)}`))

await page.goto(`${BASE}/admin/brands/${BRAND_ID}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(6000)

/*
 * Поверх админки открывается модалка «Будьте в курсе!» (подписка на
 * уведомления). Пока она открыта, ввод в форму за ней НЕ доходит: значение
 * возвращается к прежнему. Человек её просто закрывает — делаем то же.
 */
await page.keyboard.press('Escape')
await page.waitForTimeout(1000)

const title = await page.locator('#meta-title').count()
const h1 = await page.locator('#seo-h1').count()
console.log(`поле «Заголовок страницы (title)»: ${title ? 'есть' : 'НЕТ'}, поле «Заголовок на странице (H1)»: ${h1 ? 'есть' : 'НЕТ'}`)

if (title && h1) {
  await page.fill('#meta-title', 'Конструкторы CaDA — купить в Алматы | Ухтышка')
  await page.fill('#seo-h1', 'Конструкторы CaDA')
  await page.waitForTimeout(400)
  const preview = await page.locator('.text-blue-600').first().textContent()
  console.log(`предпросмотр в Google: «${preview?.trim()}»`)
  await page.locator('#seo-h1').scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/brand-form.png', fullPage: false })

  const save = page.getByRole('button', { name: /Сохранить|Обновить/i }).first()
  await save.click()
  await page.waitForTimeout(5000)
  console.log(`адрес после сохранения: ${page.url().replace(BASE, '')}`)
}
console.log(`ошибок консоли: ${errors.length}${errors.length ? `\n   ${errors.join('\n   ')}` : ''}`)
await browser.close()

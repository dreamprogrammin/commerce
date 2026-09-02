/**
 * Кнопка «Сгенерировать» в форме бренда: предпросмотр, подстановка, сохранение.
 * Стенд — dev-сервер на ЛОКАЛЬНОЙ базе плюс `supabase functions serve`
 * с заглушкой вместо Anthropic API (см. check-brand-seo-fn.mjs).
 *   node check-brand-seo-ui.mjs
 */
import { chromium } from 'playwright'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const BASE = process.env.BASE || 'http://localhost:3003'
const SUPA = 'http://127.0.0.1:54321'
const SERVICE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const ADMIN_ID = 'cad0cf3c-f790-42a3-ae9d-b0fec109ebff'
const ADMIN_EMAIL = 'settings-check@example.com'
const PASSWORD = 'ProbaPassword123!'
const BRAND_ID = '063efc57-9bca-461e-98c3-9ab0d7c767d0' // cada

const service = createClient(SUPA, SERVICE)
await service.from('brands').update({ meta_title: null, seo_h1: null }).eq('id', BRAND_ID)

await fetch(`${SUPA}/auth/v1/admin/users/${ADMIN_ID}`, {
  method: 'PUT',
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: PASSWORD }),
})
const cookies = []
const ssr = createServerClient(SUPA, ANON, { cookies: { getAll: () => [], setAll: l => cookies.push(...l) } })
const { error: signInError } = await ssr.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD })
if (signInError) throw new Error(signInError.message)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
await ctx.addCookies(cookies.map(c => ({ name: c.name, value: c.value, domain: 'localhost', path: '/' })))
const page = await ctx.newPage()
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 160)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 160)}`))

await page.goto(`${BASE}/admin/brands/${BRAND_ID}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(6000)
/*
 * Модалка «Будьте в курсе!» всплывает с задержкой и накрывает страницу
 * `aria-hidden`, из-за чего поиск по роли перестаёт видеть кнопки формы.
 * Закрываем её столько раз, сколько понадобится.
 */
for (let i = 0; i < 12; i++) {
  const dialogs = await page.locator('[data-slot="dialog-content"]').count()
  if (dialogs === 0 && i > 2) break
  if (dialogs > 0) await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
}

console.log('адрес:', page.url())
console.log('заголовок страницы:', (await page.title()))
console.log('видимый текст (300):', (await page.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,300))
await page.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/admin-page.png' })
console.log('поле title:', await page.locator('#meta-title').count())
console.log('заголовок секции SEO:', await page.locator('text=SEO оптимизация').count())
console.log('название бренда в форме:', JSON.stringify(await page.inputValue('#brand-name').catch(() => null)))
console.log('кнопок в форме:', (await page.locator('form button').allTextContents()).map(t => t.trim()).filter(Boolean).join(' / '))
// CSS-локатор, а не роль: роль не видит элементы под `aria-hidden`.
const button = page.locator('form button:has-text("Сгенерировать")')
console.log('кнопка на месте:', await button.count() ? 'да' : 'НЕТ')
await button.click()

await page.waitForSelector('[data-slot="dialog-content"]:has-text("Сгенерированные тексты")', { timeout: 60000 })
await page.waitForTimeout(500)
const dialog = page.locator('[data-slot="dialog-content"]:has-text("Сгенерированные тексты")')
console.log('предпросмотр открылся, содержимое:')
console.log('   ' + (await dialog.innerText()).replace(/\n+/g, '\n   ').slice(0, 700))
await page.screenshot({ path: '/tmp/claude-1000/-home-malik-projects-commerce/ead52e4f-284f-4c1d-83df-fa81cfc5e834/scratchpad/brand-seo-preview.png' })

await dialog.locator('button:has-text("Подставить в форму")').click()
await page.waitForTimeout(1000)
console.log('\nпосле подстановки в форме:')
console.log('   title:', JSON.stringify(await page.inputValue('#meta-title')))
console.log('   H1:   ', JSON.stringify(await page.inputValue('#seo-h1')))

await page.locator('form button:has-text("Сохранить")').first().click()
await page.waitForTimeout(5000)

const { data } = await service.from('brands').select('meta_title, seo_h1').eq('id', BRAND_ID).single()
console.log('\nв базе после сохранения:')
console.log('   meta_title:', JSON.stringify(data?.meta_title))
console.log('   seo_h1:    ', JSON.stringify(data?.seo_h1))
console.log('\nошибок консоли:', errors.length, errors.join(' | '))

await service.from('brands').update({ meta_title: null, seo_h1: null }).eq('id', BRAND_ID)
await browser.close()

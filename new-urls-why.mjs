// Что за «новые адреса» картинок при возврате: другие товары или другой
// размер тех же самых.
import { chromium } from 'playwright'
const B = 'https://uhti.kz'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
await ctx.addInitScript(() => { try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {} })
const p = await ctx.newPage()
let phase = 'first'
const seen = { first: new Set(), back: new Set() }
p.on('response', (r) => { const u = r.url(); if (u.includes('/storage/v1/') && /\.webp/.test(u)) seen[phase]?.add(u) })
const settle = async () => {
  await p.waitForTimeout(11000)
  for (let y = 0; y <= 3000; y += 700) { await p.evaluate(t => scrollTo({ top: t, behavior: 'instant' }), y); await p.waitForTimeout(500) }
  await p.evaluate(() => scrollTo({ top: 900, behavior: 'instant' })); await p.waitForTimeout(300)
  await p.evaluate(() => scrollTo({ top: 700, behavior: 'instant' })); await p.waitForTimeout(1200)
}
await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await settle()
const firstTitles = await p.evaluate(() => [...document.querySelectorAll('.home-content h2')].map(h => h.textContent.trim()).slice(0, 3))
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(6000)
phase = 'back'
await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await settle()

// «товар» = кусок пути до суффикса варианта
const key = u => u.replace(/_[a-z]+\.webp.*$/, '')
const firstKeys = new Set([...seen.first].map(key))
const fresh = [...seen.back].filter(u => !seen.first.has(u))
const sameProductOtherSize = fresh.filter(u => firstKeys.has(key(u)))
const reallyNew = fresh.filter(u => !firstKeys.has(key(u)))
console.log(`картинок в первом визите: ${seen.first.size}`)
console.log(`при возврате новых адресов: ${fresh.length}`)
console.log(`  тот же товар, другой размер: ${sameProductOtherSize.length}`)
console.log(`  ДРУГОЙ товар:                ${reallyNew.length}`)
for (const u of reallyNew.slice(0, 5)) console.log(`      ${u.split('/').pop().slice(0, 62)}`)
await browser.close()

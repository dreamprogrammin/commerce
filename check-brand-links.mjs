/**
 * Блок «Бренд в категориях»: ссылки есть, кликаются, ведут на живой лендинг.
 * Стенд с прод-данными на чтение — см. шапку check-landing-robots.mjs.
 *   BASE=http://localhost:3001 node check-brand-links.mjs
 */
import os from 'node:os'
import process from 'node:process'
import { chromium } from 'playwright'

// Куда класть скриншоты и журналы: SC из окружения, иначе системный tmp.
const SCRATCH = process.env.SC || os.tmpdir()

const BASE = process.env.BASE || 'http://localhost:3001'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const errors = []
page.on('console', m => m.type() === 'error' && errors.push(m.text().slice(0, 140)))
page.on('pageerror', e => errors.push(`pageerror: ${e.message.slice(0, 140)}`))

await page.goto(`${BASE}/brand/lol-surprise`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForTimeout(4000)
const nav = page.locator('nav[aria-label$="в категориях"]')
console.log(`блок найден: ${await nav.count() ? 'да' : 'НЕТ'} | заголовок: «${(await nav.locator('h2').textContent().catch(() => ''))?.trim()}»`)
const chips = await nav.locator('a').allTextContents()
console.log(`ссылки: ${chips.map(c => c.trim()).join(' · ')}`)
await nav.scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SCRATCH}/brand-links.png` })

await nav.locator('a').first().click()
await page.waitForURL(/\/brand\//, { timeout: 90000 }).catch(() => {})
await page.waitForTimeout(6000)
const h1 = (await page.textContent('h1').catch(() => ''))?.trim()
const cards = await page.locator('a[href^="/catalog/products/"]').count()
console.log(`переход: ${page.url().replace(BASE, '')} | H1 «${h1}» | карточек ${cards}`)
console.log(`ошибок консоли: ${errors.length}${errors.length ? `\n   ${errors.join('\n   ')}` : ''}`)
await browser.close()

/**
 * Продолжают ли тикать таймеры удержанной страницы, пока человек ушёл.
 *
 * Перехватываем setInterval/clearInterval до загрузки страницы и считаем,
 * сколько живых интервалов остаётся на каждом этапе. Прочитать DOM
 * удержанной страницы нельзя — при деактивации он изымается из документа,
 * поэтому смотрим именно на таймеры.
 */
import { chromium } from 'playwright'
const B = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://localhost:3111'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
await ctx.addInitScript(() => {
  try { localStorage.setItem('tg_modal_dismissed_at', String(Date.now())); sessionStorage.setItem('guest_bonus_modal_seen', 'true') } catch {}
  const si = window.setInterval.bind(window)
  const ci = window.clearInterval.bind(window)
  window.__intervals = new Map()
  window.setInterval = function (fn, ms, ...rest) {
    const id = si(fn, ms, ...rest)
    window.__intervals.set(id, ms)
    return id
  }
  window.clearInterval = function (id) {
    window.__intervals.delete(id)
    return ci(id)
  }
})
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

const alive = () => p.evaluate(() => {
  const all = [...window.__intervals.values()]
  return { всего: all.length, секундных: all.filter(m => m <= 2000).length, интервалы: all.sort((a, b) => a - b).slice(0, 8) }
})

await p.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 180000 })
await p.waitForTimeout(12000)
console.log('на главной:      ' + JSON.stringify(await alive()))

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/catalog"]').click({ timeout: 20000 })
await p.waitForTimeout(7000)
console.log('ушли в каталог:  ' + JSON.stringify(await alive()))

await p.locator('nav[aria-label="Основная навигация"] a.mbn-item[href="/"]').click({ timeout: 20000 })
await p.waitForTimeout(7000)
console.log('вернулись:       ' + JSON.stringify(await alive()))
await browser.close()

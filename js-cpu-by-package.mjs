/**
 * Процессорное время загрузки страницы — по npm-пакетам и папкам приложения.
 *
 * Зачем. `js-cpu-profile.mjs` показывает время по файлам, а на бою почти всё
 * время уходит в ОДИН файл точки входа (741 КБ), и имена функций в нём
 * сжаты: «aE», «Zd». Этот скрипт прогоняет каждый семпл профиля через карты
 * исходников и говорит, чей это код.
 *
 * Им 21 сентября 2026 опровергнута гипотеза «главный тормоз — клиент
 * Supabase»: на загрузке он тратит 53–70 мс из ~2000 (3 %). Две секунды —
 * это ядро Vue, реактивность и компоненты приложения. И найден дешёвый
 * рычаг: `vue-sonner` с `dir="auto"` звал getComputedStyle на каждой
 * отрисовке — 121 мс.
 *
 * НУЖНА СБОРКА С КАРТАМИ. В nuxt.config.ts ВРЕМЕННО, не коммитить:
 *   sourcemap: { client: 'hidden', server: false },
 * `hidden` пишет .map рядом с файлами, но без ссылки в самом JS. Без карт
 * всё уйдёт в строку «(без карты)».
 *
 * Стенд — сборка с боевыми данными на чтение (п. 16 CLAUDE.md): для
 * РАСКЛАДКИ по пакетам локальная сборка годится — выполняется тот же код, и
 * итог сошёлся с боем (2,0 с против 1,96 с). Абсолютные выигрыши
 * подтверждать на превью против боя.
 *
 *   node js-cpu-by-package.mjs http://localhost:3127/
 *   DRILL=vue-sonner,@nuxt/icon node js-cpu-by-package.mjs …   — разбор по функциям
 */
import fs from 'node:fs'
import process from 'node:process'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3127/'
const maps = new Map()
function mapFor(url) {
  const file = url.split('/_nuxt/')[1]
  if (!file) return null
  if (!maps.has(file)) {
    const p = `.output/public/_nuxt/${file}.map`
    maps.set(file, fs.existsSync(p) ? new TraceMap(fs.readFileSync(p, 'utf8')) : null)
  }
  return maps.get(file)
}
const pkgOf = (src) => {
  if (!src) return '(без карты)'
  const m = src.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/)
  if (m) return m[1]
  const app = src.match(/(?:^|\/)(pages|components|composables|stores|layouts|plugins|utils|constants|middleware|app\.vue|lib)\b/)
  return app ? `приложение: ${app[1]}` : `прочее: ${src.slice(-40)}`
}

const browser = await chromium.launch()
const context = await browser.newContext({ ...devices['Pixel 5'], deviceScaleFactor: 3 })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: 96000, latency: 150 })
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await page.goto(BASE, { waitUntil: 'load', timeout: 180000 })
await page.waitForTimeout(6000)
const { profile } = await cdp.send('Profiler.stop')

const byId = new Map(profile.nodes.map(n => [n.id, n]))
const acc = new Map()
let jsTotal = 0
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  const ms = Math.max(0, profile.timeDeltas[i] || 0) / 1000
  const cf = n?.callFrame
  let key
  if (!cf?.url) key = `движок: ${cf?.functionName || '?'}`
  else if (!cf.url.includes('/_nuxt/')) key = `вне сборки: ${cf.url.split('/').pop().slice(0, 30)}`
  else {
    const tm = mapFor(cf.url)
    const pos = tm ? originalPositionFor(tm, { line: cf.lineNumber + 1, column: cf.columnNumber }) : null
    key = pkgOf(pos?.source)
    jsTotal += ms
    if (process.env.DRILL && process.env.DRILL.split(',').some(d => key.includes(d))) {
      const fk = `${key} :: ${(pos?.source || '').split('/').slice(-2).join('/')} :: ${pos?.name || cf.functionName || '(аноним)'} :${pos?.line}`
      globalThis.__drill ??= new Map()
      globalThis.__drill.set(fk, (globalThis.__drill.get(fk) || 0) + ms)
    }
  }
  acc.set(key, (acc.get(key) || 0) + ms)
}
const rows = [...acc].sort((a, b) => b[1] - a[1])
console.log(`JavaScript сборки: ${Math.round(jsTotal)} мс`)
for (const [k, v] of rows.filter(([k]) => !k.startsWith('движок')).slice(0, 18))
  console.log(`  ${String(Math.round(v)).padStart(5)} мс  ${(100 * v / jsTotal).toFixed(1).padStart(5)} %  ${k}`)
const supa = rows.filter(([k]) => k.startsWith('@supabase/')).reduce((a, [, v]) => a + v, 0)
console.log(`\n  семейство Supabase: ${Math.round(supa)} мс = ${(100 * supa / jsTotal).toFixed(1)} % JavaScript сборки`)
const eng = rows.filter(([k]) => k.startsWith('движок'))
console.log(`  движок: ${eng.map(([k, v]) => `${k.replace('движок: ', '')} ${Math.round(v)}`).join(', ')}`)
if (globalThis.__drill) {
  console.log('\nразбор выбранных пакетов по функциям:')
  for (const [k, v] of [...globalThis.__drill].sort((a, b) => b[1] - a[1]).slice(0, 16))
    console.log(`  ${String(Math.round(v)).padStart(4)} мс  ${k.slice(0, 110)}`)
}
await browser.close()

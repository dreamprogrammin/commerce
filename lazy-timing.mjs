/** Когда подгружаются куски отложенных секций: сразу или при прокрутке. */
import process from 'node:process'
import { chromium, devices } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:3000/'
const b = await chromium.launch()
const c = await b.newContext({ ...devices['Pixel 5'] })
const p = await c.newPage()
const seen = []
p.on('response', r => /\.js(\?|$)/.test(r.url()) && seen.push({ url: r.url().split('/').pop(), t: Date.now() }))
const t0 = Date.now()
await p.goto(BASE, { waitUntil: 'load', timeout: 180000 })
const atLoad = seen.length
await p.waitForTimeout(5000)
const after5s = seen.length
await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.8))
await p.waitForTimeout(5000)
console.log(`JS-файлов: на load ${atLoad} | +5 с без прокрутки ${after5s} | после прокрутки ${seen.length}`)
console.log(`догрузилось без прокрутки: ${after5s - atLoad}, по прокрутке: ${seen.length - after5s}`)
const late = seen.filter(s => s.t - t0 > 8000).slice(0, 8).map(s => s.url)
console.log('приехали после прокрутки:', late.join(', ') || '—')
await b.close()

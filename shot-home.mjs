/**
 * Скриншот главной с локальной прод-сборки.
 * Локальные бакеты storage пустые → перехватываем и берём байты с прода.
 * LD_LIBRARY_PATH=$HOME/pw-libs/usr/lib/x86_64-linux-gnu node shot-home.mjs <url> <out.png> [mobile|desktop]
 */
import { chromium } from 'playwright'

const TARGET = process.argv[2]
const OUT = process.argv[3]
const isMobile = (process.argv[4] || 'mobile') === 'mobile'
const PROD = 'https://gvsdevsvzgcivpphcuai.supabase.co'

const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  isMobile,
  hasTouch: isMobile,
})
await ctx.route('**/storage/v1/object/public/**', async (route) => {
  const path = new URL(route.request().url()).pathname
  try {
    const r = await fetch(PROD + path)
    if (!r.ok) return route.abort()
    route.fulfill({ status: 200, contentType: r.headers.get('content-type') || 'image/webp', body: Buffer.from(await r.arrayBuffer()) })
  }
  catch { route.abort() }
})
const p = await ctx.newPage()
await p.goto(TARGET, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(9000)
await p.evaluate(async () => {
  // проматываем, чтобы догрузились ленивые картинки
  for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) }
  window.scrollTo(0, 0)
})
await p.waitForTimeout(1500)
await p.screenshot({ path: OUT, fullPage: true })
console.log('снято:', OUT)
await b.close()

import { chromium } from 'playwright'
const [target, out, mode] = process.argv.slice(2)
const isMobile = mode === 'mobile'
const PROD = 'https://gvsdevsvzgcivpphcuai.supabase.co'
const b = await chromium.launch()
const ctx = await b.newContext({
  viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  deviceScaleFactor: Number(process.env.DPR || 2), isMobile, hasTouch: isMobile, ignoreHTTPSErrors: true,
})
await ctx.route('**/storage/v1/object/public/**', async (route) => {
  const path = new globalThis.URL(route.request().url()).pathname
  try {
    const r = await fetch(PROD + path)
    if (!r.ok) return route.abort()
    route.fulfill({ status: 200, contentType: r.headers.get('content-type') || 'image/webp', body: Buffer.from(await r.arrayBuffer()) })
  } catch { route.abort() }
})
const p = await ctx.newPage()
await p.goto(target, { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(8000)
const h = await p.locator('h2', { hasText: process.env.SECTION || 'Популярные категории' }).first()
await h.scrollIntoViewIfNeeded()
await p.waitForTimeout(2500)
const sec = p.locator('section').filter({ has: p.locator('h2', { hasText: process.env.SECTION || 'Популярные категории' }) }).first()
await sec.screenshot({ path: out })
console.log('снято:', out)
await b.close()

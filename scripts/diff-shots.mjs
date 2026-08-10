import { existsSync, readdirSync, readFileSync } from 'node:fs'
import process from 'node:process'
// Попиксельное сравнение снимков до/после. Считает Chromium через canvas:
// sharp в проекте без нативного бинарника, PIL и ImageMagick в системе нет,
// а ставить пакеты ради сравнения незачем.
import { chromium } from 'playwright'

const root = process.env.SHOTS_DIR || 'node_modules/.cache/uhti-shots'
const A = `${root}/${process.argv[2] || 'before'}`
const B = `${root}/${process.argv[3] || 'after'}`

if (process.env.EXTRA_LIB_PATH) {
  process.env.LD_LIBRARY_PATH = [process.env.EXTRA_LIB_PATH, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(':')
}

const files = readdirSync(A).filter(f => f.endsWith('.png')).sort()
const browser = await chromium.launch()
const page = await browser.newPage()

const asDataUrl = p => `data:image/png;base64,${readFileSync(p).toString('base64')}`

console.log('файл'.padEnd(30), 'размер', ' ', 'отличий')
console.log('─'.repeat(66))

const worst = []
for (const f of files) {
  if (!existsSync(`${B}/${f}`)) {
    console.log(`${f.padEnd(30)} — нет пары в after`)
    continue
  }
  const res = await page.evaluate(async ([a, b]) => {
    const load = src => new Promise((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = no
      i.src = src
    })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const w = Math.min(ia.width, ib.width)
    const h = Math.min(ia.height, ib.height)
    const draw = (img) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      c.getContext('2d').drawImage(img, 0, 0)
      return c.getContext('2d').getImageData(0, 0, w, h).data
    }
    const da = draw(ia)
    const db = draw(ib)
    let diff = 0
    let maxDelta = 0
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
      if (d > 12) {
        diff++
        if (d > maxDelta)
          maxDelta = d
      }
    }
    return {
      sizeA: `${ia.width}x${ia.height}`,
      sizeB: `${ib.width}x${ib.height}`,
      sameSize: ia.width === ib.width && ia.height === ib.height,
      diff,
      total: w * h,
      pct: +(100 * diff / (w * h)).toFixed(3),
      maxDelta,
    }
  }, [asDataUrl(`${A}/${f}`), asDataUrl(`${B}/${f}`)])

  const size = res.sameSize ? res.sizeA : `${res.sizeA} → ${res.sizeB}`
  const mark = res.pct === 0 ? '✓ идентично' : `${res.pct}%  (${res.diff} px, макс Δ${res.maxDelta})`
  console.log(`${f.padEnd(30)} ${size.padEnd(20)} ${mark}`)
  if (res.pct > 0 || !res.sameSize)
    worst.push({ f, ...res })
}

await browser.close()

console.log(`\n${'─'.repeat(66)}`)
if (!worst.length) {
  console.log('Все снимки идентичны попиксельно — обёртка вид не изменила.')
}
else {
  console.log(`Отличаются: ${worst.length} из ${files.length}`)
  for (const w of worst)
    console.log(`  ${w.f}: ${w.pct}%  ${w.sameSize ? '' : `размер ${w.sizeA} → ${w.sizeB}`}`)
}

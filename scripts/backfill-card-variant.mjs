/**
 * Досоздаёт вариант `_card.webp` (480px) для уже загруженных картинок товаров.
 *
 * Зачем: вариант заведён 25 августа 2026 (см. комментарий в config/images.ts),
 * но варианты генерируются В БРАУЗЕРЕ при загрузке товара, поэтому у всех
 * ранее залитых картинок его нет. Пока файлов нет, переключать `srcset` в
 * карточке НЕЛЬЗЯ — браузер получит 404 на несуществующий вариант.
 *
 * Что делает: берёт `_lg.webp` (1440px) как источник, ужимает до 480 тем же
 * способом, что и конвейер (canvas + webp, качество 0.8), кладёт рядом
 * `_card.webp`. Уже существующие пропускает, так что запуск повторяемый и
 * прерывать его безопасно.
 *
 * ЗАПИСЬ В БОЕВОЕ ХРАНИЛИЩЕ. По умолчанию — сухой прогон: считает, сколько
 * файлов нужно создать, и ничего не пишет. Реальная заливка только с --apply.
 *
 *   LD_LIBRARY_PATH=$HOME/pw-libs/usr/lib/x86_64-linux-gnu \
 *   SUPABASE_URL=https://<проект>.supabase.co \
 *   SUPABASE_ANON_KEY=<публичный ключ> \
 *   SUPABASE_SERVICE_KEY=<service role ключ, нужен только для --apply> \
 *     node scripts/backfill-card-variant.mjs [--apply] [--limit=N]
 */
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { chromium } from 'playwright'

const APPLY = process.argv.includes('--apply')
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1]) || Infinity
const BUCKET = 'product-images'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL || !ANON) {
  console.error('Нужны SUPABASE_URL и SUPABASE_ANON_KEY в окружении.')
  process.exit(1)
}
if (APPLY && !SERVICE) {
  console.error('Для --apply нужен SUPABASE_SERVICE_KEY (запись в хранилище).')
  process.exit(1)
}

const publicUrl = (path, suffix) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}${suffix}.webp`

async function listImages() {
  const out = []
  const step = 1000
  for (let from = 0; ; from += step) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/product_images?select=image_url`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Range: `${from}-${from + step - 1}` },
    })
    const rows = await res.json()
    if (!Array.isArray(rows) || !rows.length)
      break
    out.push(...rows.map(r => r.image_url).filter(Boolean))
    if (rows.length < step)
      break
  }
  // Пути без расширения — это новый формат. Legacy (с расширением) вариантов не имеет.
  return [...new Set(out)].filter(p => !/\.\w{3,4}$/.test(p))
}

async function exists(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' })
    return r.ok
  }
  catch {
    return false
  }
}

const browser = await chromium.launch()
const page = await (await browser.newContext()).newPage()
await page.goto('about:blank')

/** Ужимает картинку по URL до 480px и отдаёт байты webp. */
async function makeCard(srcUrl) {
  const dataUrl = await page.evaluate(async (src) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((ok, no) => {
      img.onload = ok
      img.onerror = () => no(new Error('image load failed'))
      img.src = src
    })
    const k = 480 / Math.max(img.naturalWidth, img.naturalHeight)
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * Math.min(k, 1)))
    c.height = Math.max(1, Math.round(img.naturalHeight * Math.min(k, 1)))
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/webp', 0.8)
  }, srcUrl)
  return Buffer.from(dataUrl.split(',')[1], 'base64')
}

async function upload(path, bytes) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}_card.webp`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE}`,
      'apikey': SERVICE,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
    },
    body: bytes,
  })
  if (!res.ok)
    throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`)
}

const paths = (await listImages()).slice(0, LIMIT)
console.log(`${APPLY ? 'ЗАПИСЬ' : 'СУХОЙ ПРОГОН'} | картинок в базе: ${paths.length}`)

const stat = { need: 0, done: 0, skipped: 0, failed: 0, bytes: 0 }

/*
 * Работаем пачками: 1046 картинок последовательно — это десятки минут только
 * на проверки существования. Пять параллельных потоков хранилище держит
 * спокойно, а прогон укладывается в разумное время.
 */
const CONCURRENCY = 5

async function handle(path) {
  if (await exists(publicUrl(path, '_card'))) {
    stat.skipped++
    return
  }
  stat.need++
  if (!APPLY) {
    if (stat.need <= 5)
      console.log(`   создать: ${path}_card.webp`)
    return
  }
  try {
    const bytes = await makeCard(publicUrl(path, '_lg'))
    await upload(path, bytes)
    stat.bytes += bytes.length
    stat.done++
    if (stat.done % 25 === 0)
      console.log(`   создано ${stat.done} (${(stat.bytes / 1024 / 1024).toFixed(1)} МБ)`)
  }
  catch (e) {
    stat.failed++
    console.error(`   ОШИБКА ${path}: ${String(e).slice(0, 100)}`)
  }
}

for (let i = 0; i < paths.length; i += CONCURRENCY) {
  // Ужимание идёт в одной вкладке, поэтому при --apply параллелим только
  // проверки и заливку, а саму отрисовку canvas держим по одной за раз.
  const batch = paths.slice(i, i + CONCURRENCY)
  if (APPLY) {
    for (const path of batch) await handle(path)
  }
  else {
    await Promise.all(batch.map(handle))
  }
  if (i > 0 && i % 200 === 0)
    console.log(`   ...просмотрено ${i} из ${paths.length}`)
}

console.log('\nитог:')
console.log(`   уже было: ${stat.skipped}`)
console.log(`   ${APPLY ? 'создано' : 'нужно создать'}: ${APPLY ? stat.done : stat.need}`)
if (APPLY)
  console.log(`   ошибок: ${stat.failed} | добавлено в хранилище: ${(stat.bytes / 1024 / 1024).toFixed(1)} МБ`)
else console.log('   ничего не записано. Для заливки добавьте --apply и SUPABASE_SERVICE_KEY.')
await browser.close()

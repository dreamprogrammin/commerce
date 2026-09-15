/*
 * Картинки товаров в разметке ld+json: адрес должен открываться.
 *
 * Почему это проверяется. 15 сентября 2026 на бою все адреса картинок в узлах
 * `ItemList` на страницах брендов, линеек и категорий отдавали HTTP 400.
 * Причина: в `product_images.image_url` путь лежит БЕЗ расширения, файлы на
 * хранилище называются `…_sm.webp` / `…_card.webp` / `…_md.webp` / `…_lg.webp`,
 * а разметка строилась через `getImageUrl`, который в бесплатном режиме
 * (`IMAGE_OPTIMIZATION_ENABLED = false`) молча игнорирует опции размера и
 * отдаёт публичный URL по пути как есть. Богатый результат по товару Google на
 * таком адресе не покажет.
 *
 * Ловушка проверки: хранилище на диапазонный запрос отвечает 206, а не 200 —
 * считать успехом оба кода.
 *
 * Стенд — сборка на прод-данных (в локальной базе бакеты пустые):
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-schema-images.mjs --base=http://localhost:3127
 *
 * Против боя до правки краснеет на всех четырёх страницах со списками.
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Страницы со списками товаров: у каждой в разметке должен быть ItemList с картинками. */
const PAGES = [
  ['/brand/cada', 'страница бренда'],
  ['/brand/lego', 'лендинг бренда'],
  ['/brand/lego/lego-city', 'страница линейки'],
  ['/catalog/girls', 'листинг категории'],
  ['/catalog/products/advent-kalendar-s-kosmetikoy-ld6062-27-kosmeticheskih-syurprizov-dlya-devochek-22x28-sm', 'карточка товара (образец рабочего кода)'],
]

/** Варианты, которые действительно лежат на хранилище. */
const VARIANT = /_(?:sm|card|md|lg)\.webp$/
/** Старые файлы: расширение прямо в пути, тогда публичный URL рабочий. */
const OLD_STYLE = /\.\w{3,4}$/

function imagesFrom(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
  const found = new Set()
  for (const [, raw] of blocks) {
    for (const m of raw.matchAll(/"image"\s*:\s*"([^"]+)"/g))
      found.add(m[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/'))
    // Картинки карточки товара лежат массивом: "image":["…","…"]
    for (const m of raw.matchAll(/"image"\s*:\s*\[([^\]]+)\]/g)) {
      for (const one of m[1].matchAll(/"([^"]+)"/g))
        found.add(one[1].replace(/\\u002F/gi, '/').replace(/\\\//g, '/'))
    }
  }
  return [...found].filter(u => u.includes('/product-images/'))
}

async function statusOf(url) {
  try {
    const r = await fetch(url, { headers: { range: 'bytes=0-0' } })
    return r.status
  }
  catch {
    return 0
  }
}

for (const [path, title] of PAGES) {
  console.log(`\n${title} — ${path}`)
  const response = await fetch(`${BASE}${path}`)
  const html = await response.text()
  check(response.status === 200, `страница отвечает 200 (${response.status})`)

  const images = imagesFrom(html)
  check(images.length > 0, `в разметке есть адреса картинок товаров (${images.length})`)

  const shaped = images.filter(u => VARIANT.test(u) || OLD_STYLE.test(u))
  check(
    shaped.length === images.length,
    `у всех адресов есть вариант или расширение (${shaped.length} из ${images.length})`,
  )

  const codes = await Promise.all(images.slice(0, 10).map(statusOf))
  const alive = codes.filter(c => c === 200 || c === 206).length
  check(
    alive === codes.length,
    `картинки открываются (${alive} из ${codes.length}; коды ${[...new Set(codes)].join(', ')})`,
  )
  if (alive !== codes.length) {
    const firstBad = images[codes.findIndex(c => c !== 200 && c !== 206)]
    console.log(`        первый битый: ${firstBad}`)
  }
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

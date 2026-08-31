/**
 * Чинит заголовок кэширования у картинок в Supabase Storage.
 *
 * Зачем. Вариант `_card` — тот, что стоит на всех карточках товара, — лежит
 * с `cache-control: no-cache`, и браузер обязан качать его заново при каждом
 * заходе. Замер 31 августа на проде: при возврате на главную `_card` тянет
 * 103 КБ, а все остальные картинки — 0 КБ, они из кэша. На проде таких файлов
 * 1046 штук, 18.6 МБ; у здоровых вариантов стоит `max-age=3600`.
 *
 * Что делает. Скачивает объект и кладёт обратно тем же путём с правильным
 * заголовком. Отдельно менять метаданные Storage не умеет — только перезалив.
 *
 * Почему год и `immutable`. Имя файла содержит свежий UUID при КАЖДОЙ загрузке
 * (useSupabaseStorage.ts:100), то есть один путь навсегда означает одни и те же
 * байты. Переписать содержимое по тому же адресу штатным путём нельзя.
 *
 * ЗАПУСК (сухой прогон, ничего не меняет):
 *   SUPABASE_URL=https://<проект>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<сервисный ключ> \
 *   node fix-image-cache.mjs
 *
 * Пробный прогон на ОДНОМ файле:
 *   ... node fix-image-cache.mjs --apply --limit=1
 *
 * Полный прогон:
 *   ... node fix-image-cache.mjs --apply
 *
 * Флаги:
 *   --apply        писать (без него только показывает, что сделал бы)
 *   --limit=N      взять только первые N файлов
 *   --hourly       чинить не no-cache, а объекты с max-age=3600
 *                  (их 4861 на 216 МБ — отдельная, более долгая работа)
 *   --bucket=имя   бакет, по умолчанию product-images
 */
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const HOURLY = args.includes('--hourly')
const LIMIT = Number(args.find(a => a.startsWith('--limit='))?.slice(8) || 0)
const BUCKET = args.find(a => a.startsWith('--bucket='))?.slice(9) || 'product-images'

const URL_BASE = process.env.SUPABASE_URL?.replace(/\/$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Нужны переменные SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

/** Год и пометка «не перепроверять»: путь неизменяем по построению имени. */
const TARGET = 'public, max-age=31536000, immutable'
/** Что чиним: по умолчанию только сломанные, с --hourly — часовые. */
const BROKEN = HOURLY ? 'max-age=3600' : 'no-cache'

const H = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }

async function list(prefix, limit = 1000) {
  const r = await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix, limit }),
  })
  if (!r.ok) throw new Error(`list ${prefix}: ${r.status} ${await r.text()}`)
  return r.json()
}

/** Обходим дерево бакета и собираем объекты с испорченным заголовком. */
async function collect() {
  const found = []
  const walk = async (prefix, depth) => {
    if (depth > 4) return
    for (const o of await list(prefix)) {
      const meta = o.metadata
      const path = prefix ? `${prefix}/${o.name}` : o.name
      if (!meta) { await walk(path, depth + 1); continue }
      if (String(meta.cacheControl) === BROKEN)
        found.push({ path, type: meta.mimetype, size: meta.size })
    }
  }
  await walk('', 0)
  return found
}

async function fixOne(o) {
  const get = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${o.path}`, { headers: H })
  if (!get.ok) throw new Error(`скачивание: ${get.status}`)
  const body = Buffer.from(await get.arrayBuffer())
  // Защита от порчи: не заливаем обратно то, что скачалось не полностью.
  if (o.size && body.length !== o.size)
    throw new Error(`размер не сошёлся: ждали ${o.size}, получили ${body.length}`)

  const put = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${o.path}`, {
    method: 'PUT',
    headers: {
      ...H,
      'Content-Type': o.type || 'application/octet-stream',
      'cache-control': TARGET,
      'x-upsert': 'true',
    },
    body,
  })
  if (!put.ok) throw new Error(`загрузка: ${put.status} ${await put.text()}`)

  // Сверяем, что заголовок реально изменился.
  const head = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${o.path}`, { method: 'HEAD' })
  return head.headers.get('cache-control')
}

console.log(`бакет ${BUCKET}, чиним объекты с «${BROKEN}» → «${TARGET}»`)
console.log(APPLY ? 'режим: ЗАПИСЬ' : 'режим: сухой прогон, ничего не меняется')

const all = await collect()
const todo = LIMIT ? all.slice(0, LIMIT) : all
const mb = (n) => Math.round(n / 1024 / 1024 * 10) / 10
console.log(`найдено ${all.length} файлов, ${mb(all.reduce((a, o) => a + (o.size || 0), 0))} МБ`)
if (LIMIT) console.log(`взято по --limit: ${todo.length}`)

if (!APPLY) {
  for (const o of todo.slice(0, 10)) console.log(`  [сухой] ${o.path}  ${o.size} байт`)
  if (todo.length > 10) console.log(`  … и ещё ${todo.length - 10}`)
  console.log('\nЧтобы применить, добавьте --apply')
  process.exit(0)
}

let ok = 0, fail = 0
for (const [i, o] of todo.entries()) {
  try {
    const got = await fixOne(o)
    ok++
    if (i < 3 || i === todo.length - 1) console.log(`  ✔ ${o.path} → ${got}`)
    else if (i % 100 === 0) console.log(`  … ${i}/${todo.length}`)
  }
  catch (e) {
    fail++
    console.error(`  ✖ ${o.path}: ${e.message}`)
  }
}
console.log(`\nготово: исправлено ${ok}, ошибок ${fail}`)

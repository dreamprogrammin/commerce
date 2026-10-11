/**
 * Данные главной (`/_payload.json`) отдаются из кеша ISR, а не функцией.
 *
 * 10 октября 2026 на бою `/_payload.json` отвечал `x-vercel-cache: MISS` на
 * каждый запрос: каждый переход на главную внутри сайта рендерил её функцией
 * заново — 6 из 27 вызовов функций за час, с тарифом Hobby сверх лимита по
 * CPU. Причина — ошибка Nuxt: правило кеша для данных страницы он дописывает
 * склейкой `route + "/_payload.json"`, и для `/` выходит `//_payload.json`,
 * который не совпадает ни с одним запросом. Обход — явное правило
 * `'/_payload.json'` в `nuxt.config.ts`.
 *
 * Сравнение — `/` и `/about/_payload.json`: их кеш работал и до правки.
 *
 * Только для Vercel (нужен заголовок `x-vercel-cache`):
 *   BASE=https://dev.uhti.kz node check-home-payload-isr.mjs
 */
import process from 'node:process'

const BASE = (process.env.BASE || 'https://uhti.kz').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (Linux; Android 11) Chrome/140 Mobile'
const CACHED = new Set(['HIT', 'STALE', 'PRERENDER'])

let failed = false
const check = (ok, label) => {
  if (!ok)
    failed = true
  console.log(`${ok ? '✅' : '❌'} ${label}`)
}

async function cacheState(path) {
  const res = await fetch(BASE + path, { headers: { 'user-agent': UA } })
  await res.arrayBuffer()
  return { status: res.status, cache: res.headers.get('x-vercel-cache'), age: res.headers.get('age') }
}

/** Первый запрос может прогреть кеш (MISS), из кеша обязан прийти второй. */
async function servedFromCache(path) {
  const first = await cacheState(path)
  await new Promise(r => setTimeout(r, 1500))
  const second = await cacheState(path)
  return { first, second }
}

console.log(`Стенд: ${BASE}\n`)

const probe = await cacheState('/')
if (!probe.cache) {
  console.log('❌ нет заголовка x-vercel-cache — это не Vercel, проверка не применима')
  process.exit(1)
}

for (const path of ['/', '/about/_payload.json', '/_payload.json']) {
  const { first, second } = await servedFromCache(path)
  check(
    second.status === 200 && CACHED.has(second.cache),
    `${path}: ${first.cache} → ${second.cache} (age ${second.age ?? '—'})`,
  )
}

process.exit(failed ? 1 : 0)

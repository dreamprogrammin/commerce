/*
 * В текстах базы нет иконок с несуществующими именами.
 *
 * Почему это проверяется. 21 сентября 2026 пустые иконки нашлись на 102
 * карточках товаров из 178, в текстах разделов, брендов и линеек: в
 * data-icon стояли имена, которых нет в коллекции (`direct-hit`, `gem`,
 * `superhero`, `doll`…). Браузер на таком имени рисует пустое место, и никто
 * этого не видит. С тех пор админка проверяет имена при сохранении
 * (composables/admin/useIconNameGuard.ts), но в базу можно попасть и мимо
 * неё — SQL-правкой, импортом, другим инструментом. Этот страж ловит итог.
 *
 * Как проверяется существование: у сервера иконок самого сайта, он отдаёт
 * только известные ему имена. Тексты читаются публичным ключом со страницы —
 * это чтение, писать страж ничего не пишет.
 *
 *   node check-icon-names-db.mjs --base=https://uhti.kz
 *   node check-icon-names-db.mjs --base=http://localhost:3127   (сборка, база из .env)
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

// Адрес базы и публичный ключ — со страницы, как их видит посетитель.
const html = await (await fetch(`${BASE}/`)).text()
const supaUrl = (html.match(/supabase:\{url:"([^"]+)"/) || html.match(/"(https?:\/\/[^"]+supabase\.co)"/) || html.match(/(http:\/\/127\.0\.0\.1:54321)/) || [])[1]
const anon = (html.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
if (!supaUrl || !anon) {
  console.log(' ПРОВАЛ  не нашёл на странице адрес базы или публичный ключ')
  process.exit(1)
}

const SOURCES = [
  ['products', ['description', 'seo_text']],
  ['categories', ['description', 'seo_text']],
  ['brands', ['description', 'seo_text']],
  ['product_lines', ['description']],
  ['category_brand_seo', ['seo_text']],
]

const exists = new Map()
async function known(prefix, names) {
  const todo = names.filter(n => !exists.has(`${prefix}:${n}`))
  for (let i = 0; i < todo.length; i += 40) {
    const chunk = todo.slice(i, i + 40)
    const data = await (await fetch(`${BASE}/api/_nuxt_icon/${prefix}.json?icons=${chunk.join(',')}`)).json().catch(() => ({}))
    const got = new Set([...Object.keys(data?.icons ?? {}), ...Object.keys(data?.aliases ?? {})])
    for (const n of chunk) exists.set(`${prefix}:${n}`, got.has(n))
  }
}

console.log(`база: ${supaUrl.replace(/^https?:\/\//, '').slice(0, 30)}…, иконки: ${BASE}\n`)
for (const [table, cols] of SOURCES) {
  const res = await fetch(`${supaUrl}/rest/v1/${table}?select=${cols.join(',')}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })
  if (!res.ok) {
    check(false, `${table}: чтение не удалось (${res.status})`)
    continue
  }
  const rows = await res.json()
  const uses = new Map()
  for (const r of rows) {
    for (const c of cols) {
      for (const m of String(r[c] ?? '').matchAll(/data-icon="([a-z0-9-]+):([a-z0-9-]+)"/g))
        uses.set(`${m[1]}:${m[2]}`, (uses.get(`${m[1]}:${m[2]}`) || 0) + 1)
    }
  }
  const byPrefix = new Map()
  for (const full of uses.keys()) {
    const [p, n] = full.split(':')
    byPrefix.set(p, [...(byPrefix.get(p) || []), n])
  }
  for (const [p, names] of byPrefix) await known(p, names)
  const bad = [...uses].filter(([full]) => exists.get(full) === false)
  check(bad.length === 0, `${table.padEnd(19)} строк ${String(rows.length).padStart(4)}, имён ${String(uses.size).padStart(3)}, несуществующих ${bad.length}${bad.length ? ' → ' + bad.map(([n, c]) => `${n.split(':')[1]}×${c}`).join(', ') : ''}`)
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

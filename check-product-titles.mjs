/*
 * Заголовки карточек товаров: модель целиком, код модели на месте.
 *
 * Почему это проверяется (24 сентября 2026, аудит, п. 5 плана). Название
 * резалось по слову до 48 знаков, и у 87 карточек из 174 обрезка приходилась
 * на саму модель: «Конструктор LEGO City 60401 Строительный паровой» — без
 * «каток», «…60430 Межзвёздный» — без «корабль»; пропадали коды моделей —
 * T904A, HE0205, CLM-557. Правило — utils/seoTitle.ts, тесты —
 * tests/utils/seoTitle.test.ts. Здесь — то, что видит поиск: `<title>` каждой
 * живой карточки, проверенный независимо от кода сайта.
 *
 *   node check-product-titles.mjs --base=http://localhost:3127
 *   node check-product-titles.mjs --base=https://uhti.kz
 *
 * Только чтение. Товары — по REST с публичным ключом со страницы.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const LIMIT = 70

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const decode = s => s.replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, '\'').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&nbsp;/g, ' ')

// Коды моделей — своим правилом, не кодом сайта: буквы с цифрами или четыре
// цифры и больше; размеры («60х28х37», «25×24»), дроби и счёт деталей — нет.
function codesOf(head) {
  const words = head.split(/\s+/)
  return words
    .map((w, i) => ({ w: w.replace(/^[«"(]+|[»"),;:.]+$/g, ''), next: words[i + 1] ?? '' }))
    .filter(({ w, next }) => /\d/.test(w)
      && !/[×xх:.°%]/i.test(w.replace(/^\p{L}+/u, ''))
      && !/^\d+в\d+$/i.test(w)
      && (/\p{L}/u.test(w) || (w.replace(/\D/g, '').length >= 4 && !/^(?:детал|минифигур|см|мм)/i.test(next))))
    .map(({ w }) => w)
}

const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
const products = await (await fetch(`${supaUrl}/rest/v1/products?select=slug,name,meta_title&is_active=eq.true&order=name`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
console.log(`сайт ${BASE}, карточек ${products.length}`)

const titles = []
const queue = [...products]
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const p = queue.shift()
    const html = await (await fetch(`${BASE}/catalog/products/${p.slug}`)).text()
    titles.push({ ...p, title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '') })
  }
}))

const long = titles.filter(t => !t.meta_title && t.title.length > LIMIT)
check(!long.length, `не длиннее ${LIMIT} знаков${long.length ? ` — ${long.length}: «${long[0].title}»` : ''}`)

const lost = titles.filter(t => !t.meta_title).map(t => ({ ...t, lost: codesOf(t.name.split(' — ')[0]).filter(c => !t.title.includes(c)) })).filter(t => t.lost.length)
check(!lost.length, `коды моделей на месте${lost.length ? ` — потеряны у ${lost.length}: ${lost.slice(0, 3).map(t => `${t.lost.join(',')} («${t.title}»)`).join('; ')}` : ''}`)

const cut = titles.filter(t => /\s(?:[вис]|на|со|для|из|по|от|за|до|при|под|над|без|против|через)$|\s(?:с|со|на|для|в|из|без|за|против)\s\S+(?:ыми|ими|ым|ых|их)$/i.test(t.title.replace(/ \| Ухтышка$/, '')))
check(!cut.length, `нет оборванного конца${cut.length ? ` — ${cut.length}: «${cut[0].title}»` : ''}`)

const seen = new Map()
for (const t of titles)
  seen.set(t.title, [...(seen.get(t.title) ?? []), t.slug])
const dup = [...seen.entries()].filter(([, slugs]) => slugs.length > 1)
check(!dup.length, `заголовки не повторяются${dup.length ? ` — ${dup.length}: «${dup[0][0]}»` : ''}`)

const manual = titles.filter(t => t.meta_title && t.title !== t.meta_title)
check(!manual.length, `ручной meta_title соблюдён (${titles.filter(t => t.meta_title).length} карточек)${manual.length ? ` — нет у ${manual[0].slug}` : ''}`)

const lego = titles.find(t => t.name.includes('60401'))
if (lego)
  check(/паровой каток/.test(lego.title), `LEGO 60401: «${lego.title}»`)

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

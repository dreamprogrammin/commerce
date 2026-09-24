/*
 * Возраст в названии и описании товара совпадает с характеристикой «Возраст».
 *
 * Почему это проверяется (24 сентября 2026, план аудита, п. 8). По
 * характеристике работают фильтр каталога, разметка Product (audience) и
 * фид Merchant Center, а покупатель читает название и описание. У 14 карточек
 * из 178 они расходились: «кукла… от 3 лет» при характеристике «от 1 года»,
 * «от года» в описании автотрека при коробке «3+». Исправление —
 * docs/PRODUCT_AGE_TEXT_2026_09_24.sql (и LEGO_BOX_AGES для четырёх наборов
 * LEGO).
 *
 * Что считается возрастом: «от 3 лет», «с 6 месяцев», «от 1,5 до 3 лет»,
 * «3–6 лет», «от трёх лет», «от года», «с рождения», «3+». Счёт вида «35+
 * сюрпризов» или «6+ игровых элементов» — не возраст.
 *
 * PENDING — карточки, где источники спорят и коробки на фото нет: их
 * проверяет владелец по живой коробке. Они печатаются, но страж не красят.
 * Появилось новое расхождение — красный.
 *
 *   node check-product-age-text.mjs --base=https://uhti.kz
 *
 * Только чтение. Товары — по REST с публичным ключом со страницы.
 */
import process from 'node:process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'

const PENDING = new Map([
  ['zuru-smashers-horror-ruka-zombi-74139-10-syurprizov-chasti-monstrov-i-slaym-dlya-malchikov', 'описание «от 5 лет», характеристика 3+; предупреждение на упаковке на фото не читается'],
  ['igrovoy-kuler-my-little-home-a1010-4-chyornyy-zvuk-i-podsvetka-750-ml-6-stakanchikov-ot-3-let', 'название «от 3 лет», описание и характеристика — от 18 месяцев'],
  ['radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053b-sinyaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let', 'название и описание «от 1,5 лет», характеристика 3+; коробки на фото нет'],
  ['radioupravlyaemaya-mashina-perevyortysh-moka-stunt-big-2053r-krasnaya-4wd-2-rezhima-ezdy-akkumulyator-6v-dlya-detey-ot-1-5-let', 'то же, что у синей'],
  ['skladnoy-samokat-lambo-xw-109jzd-chyornyy-2-v-1-s-sidenem-dlya-detey-ot-2-do-12-let', 'название и описание «от 2 до 12 лет», характеристика 3+; коробки на фото нет'],
  ['skladnoy-samokat-lambo-xw-109jzr-krasnyy-2-v-1-s-sidenem-dlya-detey-ot-2-do-12-let', 'то же, что у чёрного'],
])

const WORDS = { 'года': 1, 'одного года': 1, 'полутора': 1.5, 'двух': 2, 'трёх': 3, 'трех': 3, 'четырёх': 4, 'четырех': 4, 'пяти': 5, 'шести': 6, 'семи': 7, 'восьми': 8, 'девяти': 9, 'десяти': 10, 'двенадцати': 12, 'четырнадцати': 14 }
const num = s => Number(String(s).replace(',', '.'))
const toMonths = (n, unit) => /мес/i.test(unit) ? Math.round(n) : Math.round(n * 12)

/** Упоминания возраста «от …» в тексте, в месяцах. */
function ageMentions(raw) {
  const t = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const out = []
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с|со)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:до|[–-])\s*\d+(?:[.,]\d+)?)?\s*(лет|года|год|мес(?:\.|яц\p{L}*)?)(?!\p{L})/giu))
    out.push({ months: toMonths(num(m[1]), m[2]), src: m[0] })
  for (const m of t.matchAll(/(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*[–-]\s*\d+(?:[.,]\d+)?\s*(лет|года|мес(?:\.|яц\p{L}*)?)(?!\p{L})/giu)) {
    if (!/(?:от|с)\s*$/i.test(t.slice(Math.max(0, m.index - 4), m.index)))
      out.push({ months: toMonths(num(m[1]), m[2]), src: m[0] })
  }
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с)\s+(одного года|года|полутора|двух|трёх|трех|четырёх|четырех|пяти|шести|семи|восьми|девяти|десяти|двенадцати|четырнадцати)(\s+(?:лет|года|месяцев))?(?!\p{L})/giu)) {
    const w = m[1].toLowerCase()
    if ((w === 'года' || w === 'одного года') && !m[2])
      out.push({ months: 12, src: m[0] })
    else if (m[2])
      out.push({ months: toMonths(WORDS[w], m[2]), src: m[0] })
  }
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с)\s+полугода(?!\p{L})/giu))
    out.push({ months: 6, src: m[0] })
  for (const m of t.matchAll(/с\s+рождения/giu))
    out.push({ months: 0, src: m[0] })
  // «3+» — только если дальше не слово: «35+ сюрпризов» — счёт, а не возраст
  for (const m of t.matchAll(/(?<![\d+\p{L}])(\d{1,2})\+(?!\s*\p{L})(?!\d)/gu))
    out.push({ months: toMonths(num(m[1]), 'лет'), src: m[0] })
  return out
}

const home = await (await fetch(`${BASE}/`)).text()
const supaUrl = (home.match(/supabase:\{url:"([^"]+)"/) || [])[1]
const anon = (home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/) || [])[0]
const products = await (await fetch(`${supaUrl}/rest/v1/products?select=slug,name,description,min_age_months&is_active=eq.true&order=name`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
console.log(`сайт ${BASE}, карточек ${products.length}\n`)

const fails = []
let pending = 0
for (const p of products) {
  const diff = [...ageMentions(p.name), ...ageMentions(p.description ?? '')].filter(m => m.months !== p.min_age_months)
  if (!diff.length)
    continue
  const years = p.min_age_months / 12
  const age = p.min_age_months === null ? 'не указан' : p.min_age_months % 12 === 0 ? `${years} ${years === 1 ? 'год' : years < 5 ? 'года' : 'лет'}` : `${p.min_age_months} мес.`
  const line = `${p.name.slice(0, 70)} — характеристика ${age}, в тексте: ${[...new Set(diff.map(d => `«${d.src}»`))].join(', ')}`
  if (PENDING.has(p.slug)) {
    pending++
    console.log(`  ждёт владельца  ${line}\n                 (${PENDING.get(p.slug)})`)
  }
  else {
    fails.push(line)
    console.log(` ПРОВАЛ  ${line}`)
  }
}
console.log(`\nрасхождений: ${fails.length}, ждут владельца: ${pending}`)
console.log(fails.length ? `КРАСНЫЙ: ${fails.length} провал(ов)` : 'всё зелено')
process.exit(fails.length ? 1 : 0)

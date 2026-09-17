/*
 * Запасное описание карточки — то, что уходит в сниппет у товаров, которым
 * описание в базе не завели.
 *
 * Почему это проверяется. Замер прод-базы 17 сентября 2026: у двух товаров из
 * 178 нет ни meta_description, ни seo_description, и страница собирает текст
 * сама. Собирала она его с двумя дефектами:
 *
 *  1. «Доставка по Алматы за 1 день» — обещание, которого магазин не даёт. По
 *     `/terms` это 1–3 рабочих дня; ту же фразу уже вычищали из генераторов
 *     базы и из категорийных сниппетов 15–16 сентября, а здесь она осталась.
 *     Свой же детектор `hasLegacyTemplateMarks` считает её признаком старого
 *     шаблона — то есть код производил текст, который сам же и забраковал бы.
 *  2. «…от 3 лет от 3 лет» — возраст приклеивался вторым разом, хотя он уже
 *     стоит в названии товара.
 *
 * Стенд — сборка с прод-данными (на пустой локальной базе этих товаров нет):
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-pdp-description.mjs --base=http://localhost:3127
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Товары без описания в базе — у них виден именно запасной сборщик. */
const SLUGS = [
  'konstruktor-villa-s-intererom-i-landshaftom-216-detaley-uyutnyy-dom-tvoey-mechty',
  'igrovoy-nabor-doktor-tourist-008-105a-chemodan-telezhka-3v1-65-sm-medicinskie-instrumenty-ot-3-let',
]

for (const slug of SLUGS) {
  const res = await fetch(`${BASE}/catalog/products/${slug}`)
  if (!res.ok) {
    check(false, `${res.status} на /catalog/products/${slug.slice(0, 45)}…`)
    continue
  }
  const html = await res.text()
  const d = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''
  console.log(`\n— ${slug.slice(0, 50)}…\n  описание (${d.length}): ${d}`)

  check(!/за 1 день/i.test(d), 'нет обещания «за 1 день»')
  check(!/(от \d+ лет)[\s,.]+\1/i.test(d), 'возраст не повторяется дважды')
  check(!/\p{Extended_Pictographic}/u.test(d), 'нет эмодзи')
  check(d.length > 0 && d.length <= 165, `длина ${d.length} в пределах 165`)
  check(/Доставка (?:по [А-ЯЁ][а-яё]+ )?1–3 дня, самовывоз/.test(d), 'срок доставки — канонический 1–3 дня')
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

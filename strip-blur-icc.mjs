/**
 * Убирает профиль sRGB из превью-размытий товаров (`product_images.blur_placeholder`).
 *
 * Зачем. Каждое превью — WebP 20×20 с вшитым профилем от canvas Chrome: блок
 * ICCP 464 байта, 39% длины data:URI. Превью уходят в разметку и payload
 * страниц: на карточке товара их 16 — около 10 КБ только на профилях, и эти
 * байты Vercel считает в записях ISR и исходящем трафике. Новые превью
 * генератор уже делает без профиля (utils/imageOptimizer.ts), этот скрипт —
 * для 1 046 старых. Попиксельно картинка не меняется: сверено в Chromium на
 * всех боевых превью 13 октября 2026 (1 107 из 1 107 совпали).
 *
 * Почему только `product_images`. На этой таблице нет триггеров. На
 * `categories` висит `trigger_categories_updated_at`: правка превью сдвинула
 * бы `updated_at`, а от него карта сайта берёт `lastmod` — Google получил бы
 * ложное «изменилось» у всех разделов. Превью категорий к тому же грузятся
 * только в браузере, в разметку страниц не попадают.
 *
 * Безопасность. Строка пишется, только если её значение в базе всё ещё то,
 * что прочитано (фильтр `blur_placeholder=eq.<прежнее>`): параллельная правка
 * из админки не затирается. Повторный запуск ничего не меняет.
 *
 * ЗАПУСК (сухой прогон, ничего не меняет; из корня репозитория):
 *   SUPABASE_URL=https://<проект>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<сервисный ключ> \
 *   node strip-blur-icc.mjs
 *
 * Флаги:
 *   --apply        писать (без него только показывает, что сделал бы)
 *   --limit=N      взять только первые N строк
 */
import process from 'node:process'
import { stripWebpIcc } from './utils/webpIcc.ts'

const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const LIMIT = Number(args.find(a => a.startsWith('--limit='))?.slice(8) || 0)
const URL_BASE = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const headers = { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json' }

async function readAll() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/product_images?select=id,blur_placeholder&blur_placeholder=not.is.null&order=id`, {
      headers: { ...headers, Range: `${from}-${from + 999}` },
    })
    if (!res.ok)
      throw new Error(`чтение: ${res.status} ${await res.text()}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < 1000)
      return rows
  }
}

async function main() {
  let rows = await readAll()
  if (LIMIT)
    rows = rows.slice(0, LIMIT)
  const todo = rows
    .map(r => ({ id: r.id, before: r.blur_placeholder, after: stripWebpIcc(r.blur_placeholder) }))
    .filter(r => r.after !== r.before)
  const saved = todo.reduce((sum, r) => sum + r.before.length - r.after.length, 0)
  console.log(`Строк с превью: ${rows.length}, с профилем: ${todo.length}, экономия: ${(saved / 1024).toFixed(1)} КБ символов`)

  if (!APPLY) {
    console.log('\nСухой прогон. Чтобы применить, добавьте --apply')
    return
  }

  let written = 0
  let skipped = 0
  for (const row of todo) {
    const res = await fetch(
      `${URL_BASE}/rest/v1/product_images?id=eq.${row.id}&blur_placeholder=eq.${encodeURIComponent(row.before)}`,
      { method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify({ blur_placeholder: row.after }) },
    )
    if (!res.ok)
      throw new Error(`запись ${row.id}: ${res.status} ${await res.text()}`)
    const updated = await res.json()
    if (updated.length === 1)
      written++
    else
      skipped++
  }
  console.log(`Записано: ${written}, пропущено (значение изменилось после чтения): ${skipped}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

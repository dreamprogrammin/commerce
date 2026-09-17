/*
 * Переименование карточки не должно убивать её адрес.
 *
 * Почему это проверяется. Правка названия в админке перегенерирует slug
 * (`ProductForm.vue` следит за `formData.name`), и прежний адрес начинает
 * отдавать 404 вместе со всеми накопленными позициями. Замер Search Console
 * 17 сентября 2026: пять таких адресов продолжали получать показы, крупнейший
 * — 165 показов на средней позиции 4.8 по запросу «xx2028», самому
 * показываемому запросу сайта; товар при этом был в наличии.
 *
 * Те пять закрыты картой в коде (`constants/productSlugRedirects.ts`), а эта
 * проверка — про механизм: триггер `trg_product_slug_history` пишет прежний
 * адрес, страница товара уводит с него 301-м.
 *
 * Стенд — ЛОКАЛЬНАЯ база, потому что проверка переименовывает товар. На бою её
 * не гонять: это запись в боевую базу.
 *   supabase start            (kong часто лежит: docker start supabase_kong_…)
 *   pnpm build
 *   set -a && . ./.env && set +a && PORT=3127 node .output/server/index.mjs
 *   node check-slug-history.mjs --base=http://localhost:3127
 */
import { execFileSync } from 'node:child_process'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'
const DB = 'supabase_db_gvsdevsvzgcivpphcuai'

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error('ПРОВАЛ: проверка пишет в базу, её можно гонять только локально')
  process.exit(1)
}

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

function sql(query) {
  return execFileSync('docker', ['exec', DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-c', query], { encoding: 'utf8' }).trim()
}

const NEW_SLUG = 'proverka-smeny-adresa-tovara'
// Берём товар, у которого адрес точно свободен и на него не ссылаются заказы.
const oldSlug = sql(`SELECT slug FROM public.products ORDER BY created_at LIMIT 1`)
console.log(`\nберём карточку: ${oldSlug.slice(0, 60)}…`)

async function status(path) {
  const r = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  return { code: r.status, to: r.headers.get('location') }
}

try {
  /*
   * Старый адрес нельзя дёргать ДО переименования: правило `swr` на
   * `/catalog/products/**` закеширует ответ 200, и после переименования
   * проверка получит его же вместо редиректа. На этом я и попался с первого
   * захода. Поэтому «до» проверяем по базе, а по HTTP старый адрес трогаем
   * ровно один раз — уже после смены.
   */
  console.log('\n1) до переименования карточка есть в базе')
  check(sql(`SELECT count(*) FROM public.products WHERE slug = '${oldSlug.replace(/'/g, "''")}'`) === '1', 'товар с этим адресом один')

  sql(`UPDATE public.products SET slug = '${NEW_SLUG}' WHERE slug = '${oldSlug.replace(/'/g, "''")}'`)

  console.log('\n2) триггер записал прежний адрес')
  const inHistory = sql(`SELECT count(*) FROM public.product_slug_history WHERE old_slug = '${oldSlug.replace(/'/g, "''")}' AND product_id IS NOT NULL`)
  check(inHistory === '1', `строк в истории: ${inHistory}`)

  console.log('\n3) старый адрес уводит 301-м на новый')
  const moved = await status(`/catalog/products/${oldSlug}`)
  check(moved.code === 301, `код ответа ${moved.code} (ждём 301)`)
  check(moved.to === `/catalog/products/${NEW_SLUG}`, `ведёт на ${moved.to ?? '—'}`)

  console.log('\n4) новый адрес отвечает страницей')
  check((await status(`/catalog/products/${NEW_SLUG}`)).code === 200, 'новая карточка отдаёт 200')

  console.log('\n5) выдуманный адрес по-прежнему 404, а не редирект')
  check((await status('/catalog/products/takogo-tovara-net-i-ne-bylo-98765')).code === 404, 'выдуманный slug — 404')
}
finally {
  // Возвращаем как было: и адрес, и историю.
  sql(`UPDATE public.products SET slug = '${oldSlug.replace(/'/g, "''")}' WHERE slug = '${NEW_SLUG}'`)
  sql(`DELETE FROM public.product_slug_history WHERE old_slug IN ('${oldSlug.replace(/'/g, "''")}', '${NEW_SLUG}')`)
  console.log('\n(база возвращена в исходное состояние)')
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

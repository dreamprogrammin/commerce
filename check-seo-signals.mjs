/*
 * Сигналы поиска и ИИ-поиска: заголовки страниц бренда, лента брендов на
 * главной, карта сайта без закрытых адресов, `/llms.txt`, хвост заголовка
 * карточки.
 *
 * Почему это вообще проверяется. Search Console 11 сентября 2026:
 * `/brand/lego` — 473 показа, ноль кликов, средняя позиция 28.6, последний
 * обход 30 июня. Заголовок «LEGO - Купить товары бренда в Алматы», H1 «LEGO»,
 * на главной ленты брендов LEGO не было вовсе (первые 12 по алфавиту), а три
 * пустые серии из восьми лежали в карте сайта, будучи закрытыми `noindex`.
 *
 * Стенд — СБОРКА на прод-данных (карта сайта и счётчики берутся из базы):
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-seo-signals.mjs --base=http://localhost:3127
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3008'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

async function get(path) {
  const response = await fetch(`${BASE}${path}`)
  return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() }
}

function titleOf(html) {
  return (html.match(/<title[^>]*>(.*?)<\/title>/s)?.[1] ?? '').trim()
}

function h1Of(html) {
  const raw = html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? ''
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------- 1. Заголовки страниц бренда ----------
{
  console.log('\n1) заголовки страниц бренда')
  const lego = await get('/brand/lego')
  check(lego.status === 200, `/brand/lego отвечает 200 (${lego.status})`)
  check(
    titleOf(lego.body).startsWith('Конструкторы LEGO'),
    `title говорит, что продаётся: «${titleOf(lego.body)}»`,
  )
  check(h1Of(lego.body) === 'Конструкторы LEGO', `H1 «${h1Of(lego.body)}»`)

  // Обычный шаблон (31 бренд) получает ту же подпись.
  const zuru = await get('/brand/zuru')
  check(
    /^Игрушки Zuru/.test(titleOf(zuru.body)) && h1Of(zuru.body) === 'Игрушки Zuru',
    `бренд из раздела аудитории: «${titleOf(zuru.body)}» / H1 «${h1Of(zuru.body)}»`,
  )
}

// ---------- 2. Лента брендов на главной ----------
{
  console.log('\n2) лента брендов на главной')
  const home = await get('/')
  const links = [...home.body.matchAll(/href="\/brand\/([a-z0-9-]+)"/g)].map(m => m[1])
  const unique = [...new Set(links)]
  check(unique.includes('lego'), `LEGO есть в ленте (${unique.length} брендов: ${unique.slice(0, 5).join(', ')}…)`)
  check(unique[0] === 'lego', `первым идёт бренд с самым большим каталогом (${unique[0]})`)
}

// ---------- 3. Карта сайта без закрытых адресов ----------
{
  console.log('\n3) карта сайта')
  const map = await get('/sitemap.xml')
  const urls = [...map.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  const lineUrls = urls.filter(u => /\/brand\/[a-z0-9-]+\/[a-z0-9-]+$/.test(u))
  check(lineUrls.length > 0, `адресов серий в карте: ${lineUrls.length}`)

  const closed = []
  for (const url of lineUrls) {
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const page = await get(path)
    if (/name="robots"[^>]*content="[^"]*noindex/i.test(page.body))
      closed.push(path)
  }
  check(
    closed.length === 0,
    closed.length === 0
      ? 'ни один адрес из карты не закрыт noindex'
      : `в карте лежат закрытые адреса: ${closed.join(', ')}`,
  )

  const legoLines = lineUrls.filter(u => u.includes('/brand/lego/'))
  check(
    legoLines.length === 4,
    `у LEGO в карте только серии с товарами (${legoLines.length} из 7): ${legoLines.map(u => u.split('/').pop()).join(', ')}`,
  )
}

// ---------- 4. llms.txt ----------
{
  console.log('\n4) llms.txt')
  const file = await get('/llms.txt')
  check(file.status === 200, `отдаётся (${file.status})`)
  check(file.type.includes('text/plain'), `тип ${file.type}`)
  check(file.body.includes('## Бренды') && file.body.includes('## Разделы каталога'), 'есть разделы и бренды')

  const legoLine = file.body.split('\n').find(l => l.includes('/brand/lego)'))
  const count = Number(legoLine?.match(/(\d+)\s*$/)?.[1] ?? 0)
  check(count > 0, `у LEGO указано число живых товаров: «${legoLine?.trim()}»`)

  // Цифра должна совпадать с тем, что показывает сама страница бренда.
  const lego = await get('/brand/lego')
  // Число живёт в соседней ячейке справки: `<dt>Товаров в наличии</dt><dd …>14</dd>`.
  // Свободный `[^0-9]{0,40}` ловил цифры из хеша `data-v-…` и давал 7516.
  const onPage = Number(lego.body.match(/Товаров в наличии<\/dt>\s*<dd[^>]*>\s*(\d+)/)?.[1] ?? 0)
  check(
    onPage === 0 || onPage === count,
    `цифра из файла совпадает со страницей (${count} и ${onPage})`,
  )
}

// ---------- 5. Хвост заголовка карточки ----------
{
  console.log('\n5) заголовок карточки товара')
  const product = await get(
    '/catalog/products/konstruktor-lego-marvel-76290-mstiteli-protiv-leviafana-halk-loki-i-kapitan-amerika',
  )
  const title = titleOf(product.body)
  const head = title.split('|')[0].trim()
  check(
    !/\s(против|через|перед|после|между|около|про|для|из|по|от|за|до|при|под|над|без|в|с|и|на)$/i.test(head),
    `не обрывается на предлоге: «${title}»`,
  )
}

console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: сигналы поиска на месте' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

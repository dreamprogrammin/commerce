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
  /*
   * У лендинга H1 — фраза макета «Собирайте вместе с LEGO», а не ключ.
   * Проверяем не дословный текст, а то, ради чего ключ был в H1: что слово
   * «конструктор» стоит ВЫСОКО на странице — в title и в первом абзаце под
   * заголовком. Обычным брендам H1 с разделом достаётся по-прежнему (ниже).
   */
  const h1 = h1Of(lego.body)
  check(h1.includes('LEGO'), `H1 называет бренд: «${h1}»`)
  const lead = (lego.body.match(/<p[^>]*class="[^"]*blh__lead[^"]*"[^>]*>(.*?)<\/p>/s)?.[1] ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  check(
    /конструктор/i.test(lead),
    `первый абзац под заголовком говорит, что продаётся: «${lead.slice(0, 60)}…»`,
  )

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

  /*
   * «Товаров в наличии» у каждого бренда файла — с остатком, по базе. До 28
   * сентября 2026 файл считал все активные товары: у Sluban и L.O.L.
   * Surprise стояло 4 при трёх в наличии.
   */
  const home = (await get('/')).body
  const supaUrl = home.match(/supabase:\{url:"([^"]+)"/)?.[1]
  const anon = home.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)?.[0]
  const stock = await (await fetch(`${supaUrl}/rest/v1/products?select=stock_quantity,brands(slug)&is_active=eq.true&stock_quantity=gt.0`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
  const inStock = {}
  for (const p of stock) {
    if (p.brands?.slug)
      inStock[p.brands.slug] = (inStock[p.brands.slug] ?? 0) + 1
  }
  const wrong = [...file.body.matchAll(/\/brand\/([\w-]+)\) — товаров в наличии: (\d+)/g)]
    .filter(([, slug, n]) => Number(n) !== (inStock[slug] ?? 0))
    .map(([, slug, n]) => `${slug}: ${n} при ${inStock[slug] ?? 0}`)
  check(!wrong.length, `«товаров в наличии» у брендов — по остатку в базе${wrong.length ? ` — ${wrong.join('; ')}` : ''}`)

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

// ---------- 5б. В карте сайта нет пустых категорий ----------
/*
 * Карта не должна предлагать роботу страницы, где нечего купить. 16 сентября
 * 2026 таких было ТРИНАДЦАТЬ из 64: ни одного активного товара во всей ветке,
 * и все тринадцать лежали в карте. За 90 дней они собрали 347 показов и ноль
 * кликов, причём часть стояла высоко — бизидоски на 6-м месте, мягкие игрушки
 * на 4,8. Человек приходил по запросу и видел пустую полку.
 *
 * Проверяем по РАЗМЕТКЕ, а не по базе: у стража нет доступа к базе, а карточки
 * товара приходят в серверном HTML (класс `pc-`). Заодно это ловит случай,
 * когда товары есть, но страница их не отдаёт роботу.
 *
 * Первая редакция проверяла обратное — что в карте нет закрытых `noindex`
 * адресов, — и зеленела на бою: там пустые страницы открыты, и инвариант
 * формально цел. Проверять надо именно наличие товара.
 *
 * Исключения владельца (`CATEGORIES_KEPT_INDEXABLE_WITHOUT_PRODUCTS`) страж
 * знать не обязан: их немного, и они перечислены здесь же.
 */
{
  console.log('\n5б) в карте сайта нет пустых категорий')
  const KEPT_EMPTY = ['/catalog/kiddy/katalki']

  const map = await get('/sitemap.xml')
  const categoryUrls = [...map.body.matchAll(/<loc>([^<]*\/catalog\/[^<]*)<\/loc>/g)]
    .map(m => m[1])
    .filter(u => !u.includes('/products/') && !u.includes('/brand/'))

  check(categoryUrls.length > 0, `категорий в карте: ${categoryUrls.length}`)

  const empty = []
  for (let i = 0; i < categoryUrls.length; i += 10) {
    const batch = categoryUrls.slice(i, i + 10)
    const counts = await Promise.all(batch.map(async (url) => {
      const page = await (await fetch(url)).text()
      return (page.match(/class="pc-/g) ?? []).length
    }))
    counts.forEach((cards, index) => {
      const path = batch[index].replace(/^https?:\/\/[^/]+/, '')
      if (cards === 0 && !KEPT_EMPTY.includes(path))
        empty.push(path)
    })
  }

  check(
    empty.length === 0,
    `пустых категорий в карте: ${empty.length}${empty.length ? ` — ${empty.slice(0, 4).join(', ')}` : ''}`,
  )
}

// ---------- 5в. Связки из исключений владельца ----------
/*
 * `BRAND_LANDINGS_KEPT_INDEXABLE` (constants/index.ts): связка открыта и при
 * товарах меньше порога. «Конструкторы мальчикам + Sluban» — 179 показов за
 * 28 дней на 8,9 месте, а Sluban в разделе два, и до 25 сентября 2026 порог
 * её закрывал. Та же пара у девочек в исключения не входит — по ней видно,
 * что общее правило не сломано.
 */
{
  console.log('\n5в) связки из исключений владельца')
  const KEPT = '/catalog/constructors-root/konstruktory-malchikam/brand/sluban'
  const RULE = '/catalog/constructors-root/konstruktory-devochkam/brand/sluban'
  const [map, kept] = await Promise.all([get('/sitemap.xml'), get(KEPT)])
  const inMap = path => map.body.includes(`${path}</loc>`)
  const robots = kept.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ''
  const cards = (kept.body.match(/class="pc-/g) ?? []).length
  check(inMap(KEPT), `${KEPT} — в карте сайта`)
  check(robots !== '' && !/noindex/.test(robots), `открыта для индекса: «${robots.split(',')[0]}»`)
  check(cards > 0, `товары на странице есть (узлов карточек: ${cards})`)
  check(!inMap(RULE), `${RULE} — не в карте: у девочек две Sluban, общее правило`)
}

// ---------- 5г. FAQPage на страницах брендов — только видимые вопросы ----------
/*
 * Аудит 24 сентября 2026: рядовые бренды (/brand/cada, /brand/mokatoys)
 * отдавали FAQPage с тремя общими вопросами, которых на странице нет, —
 * Google требует, чтобы разметка повторяла видимый текст. Инвариант: каждый
 * вопрос из FAQPage есть в видимом тексте. У LEGO вопросы свои и видимые —
 * разметка должна остаться.
 */
console.log('\n5г) FAQPage на страницах брендов')
for (const path of ['/brand/cada', '/brand/mokatoys', '/brand/lego']) {
  const page = await get(path)
  const faq = [...page.body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const data = JSON.parse(m[1])
        return Array.isArray(data['@graph']) ? data['@graph'] : [data]
      }
      catch {
        return []
      }
    })
    .find(node => node?.['@type'] === 'FAQPage')
  const questions = (faq?.mainEntity ?? []).map(q => q.name)
  const text = page.body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  const unseen = questions.filter(q => !text.includes(q))
  check(unseen.length === 0, `${path}: вопросов в FAQPage ${questions.length}, не видно на странице ${unseen.length}${unseen.length ? ` — «${unseen[0]}»` : ''}`)
  if (path === '/brand/lego')
    check(questions.length >= 5, `${path}: FAQPage на месте`)
}

// ---------- 5д. Пустые бренды ----------
/*
 * План по аудиту, п. 10. Восемь брендов без товаров открыты для индекса
 * ради спроса (BRANDS_KEPT_INDEXABLE_WITHOUT_PRODUCTS), а над пустой сеткой
 * стояли «Оригинал», «Официальный поставщик» и фильтры, в выдаче — «Купить
 * игрушки BOWA…». Теперь страница говорит, что товаров нет, и ведёт в
 * похожий раздел. Если у бренда появится товар, проверка пустой страницы для
 * него пропускается — это уже обычный бренд.
 */
console.log('\n5д) пустые бренды')
for (const [path, name, alt] of [
  ['/brand/bowa', 'BOWA', '/catalog/girls/igrovye-nabory'],
  ['/brand/eva-puzzle', 'Eva Puzzle', null],
]) {
  const page = await get(path)
  if (/class="pc-/.test(page.body)) {
    check(true, `${path}: у бренда появились товары — проверка пустой страницы не нужна`)
    continue
  }
  const description = page.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  const robots = page.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ''
  // Видимый текст: dev-сервер оставляет в разметке комментарии шаблона.
  const text = page.body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  check(text.includes(`Товаров ${name} сейчас нет в наличии`), `${path}: на странице сказано, что товаров нет`)
  check(!text.includes('Официальный поставщик'), `${path}: без «Официальный поставщик» над пустой сеткой`)
  check(description.startsWith(`Товаров ${name} сейчас нет в наличии`), `${path}: описание честное — «${description.slice(0, 60)}…»`)
  check(!/noindex/.test(robots), `${path}: страница остаётся в индексе, как решил владелец`)
  if (alt)
    check(page.body.includes(`href="${alt}"`), `${path}: ведёт в похожий раздел ${alt}`)
}
const regular = await get('/brand/cada')
check(regular.body.includes('Официальный поставщик'), '/brand/cada: у бренда с товарами полоса доверия на месте')

// ---------- 5е. Производитель в разметке списка товаров ----------
/*
 * План по аудиту, п. 7. На карточке товара «Ухтышку» вместо пустого бренда
 * убрали 17 сентября 2026, а ItemList разделов называл магазин
 * производителем у каждого товара без бренда — у 92 из 178. Инвариант: в
 * ItemList нет бренда «Ухтышка»; у кого бренд есть — он со ссылкой на
 * страницу бренда.
 */
console.log('\n5е) производитель в ItemList разделов')
for (const path of ['/catalog/boys/mashinki', '/catalog/girls/igrovye-nabory']) {
  const page = await get(path)
  const items = [...page.body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const data = JSON.parse(m[1])
        return Array.isArray(data['@graph']) ? data['@graph'] : [data]
      }
      catch {
        return []
      }
    })
    .find(node => node?.['@type'] === 'ItemList')
    ?.itemListElement
    ?.map(e => e.item) ?? []
  const store = items.filter(i => i?.brand?.name === 'Ухтышка').length
  const branded = items.filter(i => i?.brand)
  check(items.length > 0 && store === 0, `${path}: товаров в ItemList ${items.length}, с брендом «Ухтышка» ${store}`)
  check(branded.every(i => /^https:\/\/uhti\.kz\/brand\//.test(i.brand.url ?? '')), `${path}: у ${branded.length} товаров с брендом — ссылка на страницу бренда`)
}

// ---------- 5ж. Описание бренда и серии без приклеенного заголовка ----------
/*
 * Описание бренда и серии — вёрстка: заголовок, абзац, список. Текст для
 * разметки и запасного мета-описания снимался с неё целиком, и заголовок
 * приклеивался к абзацу без точки — на бою 26–28 сентября 2026 у 29 брендов
 * из 30 с описанием и у всех 13 серий: «…машины для настоящих гонщиков Moka
 * Toys — китайский производитель…». У Smashers Dino Island так выглядело
 * мета-описание в выдаче. Инвариант: ни в `Brand.description`, ни в
 * мета-описании нет заголовка из описания. Заголовки берутся из базы, а не
 * со страницы: лендинг LEGO свои заголовки описания не выводит.
 */
console.log('\n5ж) описание бренда и серии без приклеенного заголовка')
{
  const home = await get('/')
  const supaUrl = home.body.match(/supabase:\{url:"([^"]+)"/)?.[1]
  const anon = home.body.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)?.[0]
  const rest = async path => supaUrl && anon
    ? (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
    : []
  const headingsOf = html => [...(html ?? '').matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const brandNodeOf = body => [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const data = JSON.parse(m[1])
        return Array.isArray(data['@graph']) ? data['@graph'] : [data]
      }
      catch {
        return []
      }
    })
    .find(node => node?.['@type'] === 'Brand')

  const pages = [
    ['/brand/mokatoys', 'brands', 'mokatoys'],
    ['/brand/cada', 'brands', 'cada'],
    ['/brand/lego', 'brands', 'lego'],
    ['/brand/lego/lego-city', 'product_lines', 'lego-city'],
    ['/brand/zuru/smashers-dino-island', 'product_lines', 'smashers-dino-island'],
  ]
  const rows = [
    ...await rest(`brands?select=slug,description&slug=in.(${pages.filter(p => p[1] === 'brands').map(p => p[2]).join(',')})`),
    ...await rest(`product_lines?select=slug,description&slug=in.(${pages.filter(p => p[1] === 'product_lines').map(p => p[2]).join(',')})`),
  ]
  check(rows.length === pages.length, `описания прочитаны из базы (${rows.length} из ${pages.length})`)

  for (const [path, , slug] of pages) {
    const page = await get(path)
    const description = brandNodeOf(page.body)?.description ?? ''
    const meta = page.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
    const headings = headingsOf(rows.find(r => r.slug === slug)?.description)
    const glued = headings.find(h => description.includes(h) || meta.includes(h))
    check(description.length > 0 && description.length <= 300, `${path}: Brand.description есть, ${description.length} знаков`)
    check(!glued, `${path}: в Brand.description и мета-описании нет заголовка описания${glued ? ` — «${glued}»` : ''}`)
    console.log(`        ${description.slice(0, 110)}…`)
  }
}

// ---------- 5з. Описания товаров и статья раздела без склейки ----------
/*
 * Все 178 описаний товаров начинаются с заголовка, и в разметке он
 * приклеивался к абзацу: на карточке — блоки через пробел, в списках раздела
 * и серии — теги снимались вовсе без пробела и текст резался `substring`
 * посреди слова. Так же собирался `articleBody` статьи раздела. Инвариант:
 * ни в `Product.description`, ни в `articleBody` нет заголовка из исходного
 * текста, и описание не кончается обрубком слова.
 */
console.log('\n5з) описания товаров и статья раздела без склейки')
{
  const home = await get('/')
  const supaUrl = home.body.match(/supabase:\{url:"([^"]+)"/)?.[1]
  const anon = home.body.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)?.[0]
  const rest = async path => (await fetch(`${supaUrl}/rest/v1/${path}`, { headers: { apikey: anon, authorization: `Bearer ${anon}` } })).json()
  const headingsOf = html => [...(html ?? '').matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const nodesOf = body => [...body.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const data = JSON.parse(m[1])
        return Array.isArray(data['@graph']) ? data['@graph'] : [data]
      }
      catch {
        return []
      }
    })
  const products = await rest('products?select=slug,description&is_active=eq.true')
  const bySlug = Object.fromEntries(products.map(p => [p.slug, p]))
  const glueIn = (text, slug) => headingsOf(bySlug[slug]?.description).find(h => text.includes(h))

  // Карточка товара
  const pdpSlug = 'konstruktor-lego-marvel-76290-mstiteli-protiv-leviafana-halk-loki-i-kapitan-amerika'
  const pdp = await get(`/catalog/products/${pdpSlug}`)
  const productNode = nodesOf(pdp.body).find(n => n?.['@type'] === 'Product')
  const glued = glueIn(productNode?.description ?? '', pdpSlug)
  check(!glued, `карточка: в Product.description нет заголовка${glued ? ` — «${glued}»` : ''}`)

  /*
   * Списки раздела, серии и бренда. Заголовок здесь не проверяется: товары
   * в список приходят из запроса каталога уже без вёрстки, заголовок слит с
   * абзацем ещё там, и страница отделить его не может (29 сентября 2026 —
   * лечится только запросом). Проверяется то, что делает страница: слова не
   * слипаются и текст не обрывается посреди слова.
   */
  const plainOf = html => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  for (const path of ['/catalog/boys/mashinki', '/brand/lego/lego-city', '/brand/cada']) {
    const page = await get(path)
    const items = nodesOf(page.body).flatMap(n => [n, n?.mainEntity].filter(Boolean)).filter(n => n?.['@type'] === 'ItemList').flatMap(n => n.itemListElement ?? []).map(e => e.item).filter(i => i?.url)
    const bad = items.filter((i) => {
      const text = i.description ?? ''
      const source = plainOf(bySlug[i.url.split('/').pop()]?.description)
      const last = text.split(' ').pop().replace(/[.,!?…:;»)]+$/u, '')
      const whole = !source || !last || new RegExp(`(?<!\\p{L})${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'u').test(source)
      return /[\u0430-\u044F\u0451][\u0410-\u042F\u0401]/.test(text) || !whole
    })
    check(items.length > 0 && bad.length === 0, `${path}: товаров в ItemList ${items.length}, слипшихся или оборванных посреди слова ${bad.length}${bad[0] ? ` — «…${bad[0].description.slice(-50)}»` : ''}`)
  }

  // Статья раздела
  const section = await get('/catalog/boys/mashinki')
  const article = nodesOf(section.body).map(n => n?.mainEntity).find(n => n?.['@type'] === 'Article')
  const cat = (await rest('categories?select=seo_text&slug=eq.mashinki'))[0]
  const body = article?.articleBody ?? ''
  const gluedHead = headingsOf(cat?.seo_text).find(h => body.includes(h))
  check(body.length > 0 && !gluedHead && !/[\u0430-\u044F\u0451][\u0410-\u042F\u0401]/.test(body), `/catalog/boys/mashinki: articleBody ${body.length} знаков, без заголовков и слипшихся слов${gluedHead ? ` — «${gluedHead}»` : ''}`)
}

// ---------- 6. Описание бренд-лендинга ----------
/*
 * У пяти связок «категория + бренд» из четырнадцати описание собрано старым
 * шаблоном: «💰 Цены от…», ряд звёзд с одного отзыва и «Быстрая доставка по
 * Алматы за 1 день. Заказывайте оригиналы!». Срок неверный — по `/terms` это
 * 1–3 рабочих дня; эмодзи Google из русской выдачи вырезает, но знаки под них
 * тратятся. Страница теперь собирает описание заново, если сохранённое несёт
 * признаки того шаблона.
 */
{
  console.log('\n6) описание бренд-лендинга')
  const landing = await get('/catalog/constructors-root/konstruktory-malchikam/brand/lego')
  const description = landing.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
  check(description.length > 0, `описание есть (${description.length} знаков)`)
  check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u.test(description), 'без эмодзи')
  check(!/за 1 день/i.test(description), 'без обещания доставки за день')
  check(!/заказывайте/i.test(description), 'без призыва «Заказывайте»')
  console.log(`        ${description}`)
}

// ---------- 7. Пустые листинги и их описания ----------
/*
 * `/catalog/new` отдавал 200 и `index, follow` при нуле товаров с `is_new`,
 * не будучи ни в карте сайта, ни в навигации, — страница-сирота. Правило
 * теперь то же, что у бренд-лендингов: нет товара — нет индекса.
 *
 * Здесь же проверяются описания обеих витрин: в них стояли звёзды и галочки
 * («⭐ … ✓ Доставка …») и «Скидки до 50%», которых никто не считал.
 */
{
  console.log('\n7) витрины «Новинки» и «Акции»')
  /*
   * На превью `@nuxtjs/robots` закрывает ВЕСЬ сайт, поэтому «открыта ли
   * страница с товаром» там проверять бессмысленно — сверяем только то, что
   * пустая витрина закрыта. Признак превью берём с главной: если и она
   * noindex, значит стенд закрыт целиком.
   */
  const home = await get('/')
  const previewMode = /noindex/.test(home.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '')
  if (previewMode)
    console.log('        (превью: весь сайт под noindex, проверяем только закрытие пустой витрины)')

  for (const [path, name] of [['/catalog/new', 'новинки'], ['/catalog/promotions', 'акции']]) {
    const page = await get(path)
    const robots = page.body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? ''
    const description = page.body.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? ''
    const cards = (page.body.match(/class="pc-/g) ?? []).length

    check(page.status === 200, `${name}: страница отвечает 200 (${page.status})`)
    if (cards === 0 || !previewMode) {
      check(
        cards > 0 ? !/noindex/.test(robots) : /noindex/.test(robots),
        `${name}: ${cards > 0 ? 'с товаром открыта' : 'пустая закрыта'} (${robots.split(',')[0]}, карточек ${cards})`,
      )
    }
    check(
      !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2705}\u{2713}\u{2714}]/u.test(description),
      `${name}: описание без эмодзи и галочек`,
    )
    check(!/за 1 день|до 50%/i.test(description), `${name}: без обещаний, которых никто не считал`)
  }
}

console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: сигналы поиска на месте' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

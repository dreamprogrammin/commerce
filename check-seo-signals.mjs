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

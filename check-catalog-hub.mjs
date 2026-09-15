/*
 * Корневой каталог и корневые разделы: текст, вопросы и разметка под ними.
 *
 * Почему это проверяется. Search Console 15 сентября 2026: `/catalog` последний
 * раз обходился 28 апреля и числится как «Crawled — currently not indexed».
 * Блокировки нет, ответ 200 — дело в содержимом: на странице было 1142 знака,
 * заголовок и плитки разделов, то есть то же меню, что и в шапке. Плюс
 * заголовок страницы был 69 знаков и в выдаче обрезался вместе с именем
 * магазина.
 *
 * Стенд — сборка (на dev-сервере scoped-стили теряют отступы, а содержимое
 * страницы приходит то же):
 *   NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_KEY=… \
 *     PORT=3127 node .output/server/index.mjs
 *   node check-catalog-hub.mjs --base=http://localhost:3127
 */
const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3000'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const html = await (await fetch(`${BASE}/catalog`)).text()

const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&laquo;|&raquo;/g, '"').replace(/&mdash;/g, '—').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

// ---------- 1. Заголовок и первый экран ----------
{
  console.log('\n1) заголовок')
  const title = html.match(/<title[^>]*>(.*?)<\/title>/s)?.[1]?.trim() ?? ''
  check(title.length > 0 && title.length <= 60, `длина заголовка ${title.length} ≤ 60: «${title}»`)
  check(/[Кк]аталог/.test(title) && /Алматы/.test(title), 'в заголовке есть раздел и город')

  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => strip(m[1]))
  check(h1.length === 1, `H1 ровно один (${h1.length}): ${h1.join(' | ')}`)
}

// ---------- 2. Текст ----------
{
  console.log('\n2) текст под сеткой разделов')
  const block = html.match(/<section class="ssb"[\s\S]*?<\/section>/)?.[0] ?? ''
  check(block.length > 0, 'блок текста есть в серверной разметке')

  const words = strip(block).split(' ').filter(Boolean).length
  check(words >= 400, `слов в блоке: ${words} (было 124 на всю страницу)`)

  const h2 = [...block.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => strip(m[1]))
  check(h2.length >= 4, `подзаголовков H2: ${h2.length} — ${h2.join(' · ')}`)

  const links = [...block.matchAll(/href="(\/catalog\/[^"#]*)"/g)].map(m => m[1])
  const unique = [...new Set(links)]
  check(unique.length >= 5, `ссылок на разделы из текста: ${unique.length}`)

  const codes = await Promise.all(unique.map(async (href) => {
    const r = await fetch(`${BASE}${href}`, { redirect: 'manual' })
    return [href, r.status]
  }))
  const broken = codes.filter(([, status]) => status !== 200)
  check(broken.length === 0, `все ссылки отвечают 200${broken.length ? `: ${broken.map(b => b.join(' → ')).join(', ')}` : ''}`)

  /*
   * Сроки доставки — из опубликованных условий, а не из головы. «За 1 день»
   * стояло в сниппетах категорий и было неправдой: по `/terms` это 1–3
   * рабочих дня.
   */
  const text = strip(block)
  check(!/за 1 день|1-2 дня|1–2 дня/i.test(text), 'нет обещания доставки за день')
  check(/самовывоз/i.test(text), 'самовывоз назван — им получают заказ чаще всего')
}

// ---------- 3. Вопросы и разметка ----------
{
  console.log('\n3) вопросы и FAQPage')
  const visible = [...html.matchAll(/<h3[^>]*class="ssb__q"[^>]*>([\s\S]*?)<\/h3>/g)].map(m => strip(m[1]))
  check(visible.length >= 5, `вопросов показано: ${visible.length}`)

  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
  const faq = blocks.map((raw) => {
    try {
      return JSON.parse(raw)
    }
    catch {
      return null
    }
  }).find(node => node?.['@type'] === 'FAQPage')
  check(!!faq, 'разметка FAQPage есть')

  const asked = (faq?.mainEntity ?? []).map(q => q.name)
  check(
    asked.length >= 5 && asked.length === visible.length && asked.every(q => visible.includes(q)),
    `разметка повторяет видимые вопросы (${asked.length} против ${visible.length})`,
  )
  check(
    asked.length >= 5 && faq.mainEntity.every(q => (q.acceptedAnswer?.text ?? '').length > 80),
    'у каждого ответа в разметке есть текст',
  )
}

// ---------- 4. Корневые разделы со своим текстом ----------
/*
 * У всех девяти корневых разделов `seo_text` в базе пуст, а спрос на них есть:
 * `/catalog/girls` — 410 показов и позиция 27, `/catalog/boys` — 77 и 19,7
 * (Search Console, 90 дней на 15 сентября 2026). Четырём самым весомым текст
 * и вопросы написаны в репозитории.
 *
 * Здесь же проверяется, что шаблонные вопросы SQL-генератора на этих
 * страницах НЕ показываются: они подставляют название в дательном падеже
 * («Что такое Девочкам?»).
 */
const HUBS = [
  ['/catalog/girls', 'Игрушки для девочек'],
  ['/catalog/boys', 'Игрушки для мальчиков'],
  ['/catalog/kiddy', 'Игрушки для малышей'],
  ['/catalog/constructors-root', 'Конструкторы для детей'],
]

for (const [path, expectedH1] of HUBS) {
  console.log(`\n4) корневой раздел ${path}`)
  const page = await (await fetch(`${BASE}${path}`)).text()

  const h1 = [...page.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => strip(m[1]))
  check(h1.length === 1 && h1[0] === expectedH1, `H1 «${h1.join(' | ')}» (ждём «${expectedH1}»)`)

  const block = page.match(/<section class="ssb"[\s\S]*?<\/section>/)?.[0] ?? ''
  const words = strip(block).split(' ').filter(Boolean).length
  check(words >= 250, `слов в блоке: ${words}`)

  const links = [...new Set([...block.matchAll(/href="(\/(?:catalog|brand|brands)[^"#]*)"/g)].map(m => m[1]))]
  check(links.length >= 3, `ссылок из текста: ${links.length}`)
  const codes = await Promise.all(links.map(async (href) => {
    const r = await fetch(`${BASE}${href}`, { redirect: 'manual' })
    return [href, r.status]
  }))
  const broken = codes.filter(([, status]) => status !== 200)
  check(broken.length === 0, `ссылки живые${broken.length ? `: ${broken.map(b => b.join(' → ')).join(', ')}` : ''}`)

  const visible = [...page.matchAll(/<h3[^>]*class="ssb__q"[^>]*>([\s\S]*?)<\/h3>/g)].map(m => strip(m[1]))
  check(visible.length >= 4, `своих вопросов показано: ${visible.length}`)

  const faqNode = [...page.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((m) => {
      try {
        const parsed = JSON.parse(m[1])
        return parsed['@graph'] ?? [parsed]
      }
      catch {
        return []
      }
    })
    .find(node => node?.['@type'] === 'FAQPage')
  const asked = (faqNode?.mainEntity ?? []).map(q => q.name)
  check(
    asked.length === visible.length && asked.every(q => visible.includes(q)),
    `разметка FAQPage повторяет видимые вопросы (${asked.length} против ${visible.length})`,
  )

  /*
   * Шаблонные вопросы генератора («Что такое Девочкам?») не должны
   * ПОКАЗЫВАТЬСЯ. Смотрим только видимую разметку: в `__NUXT_DATA__` они пока
   * остаются — страница тянет их мёртвым `useAsyncData`, результат которого
   * никуда не идёт (отдельная правка).
   */
  const visibleMarkup = strip(page.replace(/<script[\s\S]*?<\/script>/g, ' '))
  check(
    !/Что такое [А-ЯЁ][а-яё]+\?/.test(visibleMarkup),
    'шаблонных вопросов генератора на странице нет',
  )
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nЗЕЛЁНЫЙ: каталог и разделы отвечают на вопросы, а не повторяют меню')
process.exit(fails.length ? 1 : 0)

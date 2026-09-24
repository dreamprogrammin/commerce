/*
 * Тексты разделов: срок доставки как в условиях, без шаблонной «воды».
 *
 * Почему это проверяется (24 сентября 2026, план по аудиту, п. 9). В 47
 * разделах из 53 с текстом стоял один шаблон: выдуманный ассортимент
 * («автобусы, поезда» у машинок, «барабанные установки» при пяти
 * инструментах), «широкий выбор», «заказывайте прямо сейчас» и «доставка
 * по всему Казахстану… за 1–3 дня». По /terms 1–3 рабочих дня — только
 * Алматы, по Казахстану 3–7. Тот же абзац — в восьми связках «раздел +
 * бренд». Тексты живут в базе (`categories.seo_text`,
 * `category_brand_seo.seo_text`), их меняет
 * `docs/SEO_SECTION_TEXTS_2026_09_24.sql` (запускает владелец). До его
 * запуска страж красный — так и видно, запущен ли он.
 *
 * Что проверяет:
 *  1) на КАЖДОЙ странице раздела и связки из sitemap.xml — нет обещания
 *     доставки за 1–3 дня по всему Казахстану и «Карагандy» с латинской y;
 *  2) на восьми переписанных разделах — новый текст в серверной разметке,
 *     ссылки из него — настоящие <a href>, шаблонных фраз нет;
 *  3) в браузере — гидратация без расхождений на трёх из них.
 *
 *   node check-section-texts.mjs --base=https://uhti.kz
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'https://uhti.kz'

/** Обещания срока из шаблона: «быстрая доставка за 1–3 дня», «срок доставки — от 1 до 3 дней», «уже через 1–3 дня». */
const FALSE_DELIVERY = /доставк[аи] за 1[–-]3 дн|срок доставки[^.<]{0,20}(?:от 1 до 3|1[–-]3)|через 1[–-]3 дн|Карагандy/i
const TEMPLATE = /широкий выбор|огромный выбор|большой выбор|прямо сейчас/i

const REWRITTEN = [
  {
    path: '/catalog/boys/mashinki',
    text: ['Машинки для мальчиков в Алматы', 'Как выбрать машинку', 'Купить машинку в Алматы'],
    links: [
      ['/catalog/boys/mashinki/radioupravlyaemye-mashinki', 'радиоуправляемых машинок'],
      ['/catalog/boys/mashinki/avtotreki', 'автотреки'],
      ['/catalog/boys/mashinki/parkingi-i-garazhi', 'паркинги и гаражи'],
      ['/brand/mokatoys', 'MokaToys'],
    ],
    absent: /автобус|поезд/i,
  },
  {
    path: '/catalog/girls/kukly',
    text: ['Куклы для девочек в Алматы', 'Как выбрать куклу', 'Купить куклу в Алматы'],
    links: [
      ['/brand/defa-lucy', 'DEFA Lucy'],
      ['/catalog/girls/kukly/kukly-lol', 'L.O.L. Surprise'],
      ['/catalog/girls/kukly/interaktivnye-kukly', 'интерактивные куклы'],
    ],
  },
  {
    path: '/catalog/creativity/muzykalnye-instrumenty',
    text: ['Детские музыкальные инструменты в Алматы', 'Как выбрать инструмент'],
    links: [
      ['/catalog/creativity/muzykalnye-instrumenty/pianino-i-sintezatory', 'пианино и синтезаторы'],
      ['/catalog/creativity/muzykalnye-instrumenty/gitary-i-dombry', 'домбра'],
    ],
    absent: /барабан|ксилофон/i,
  },
  {
    path: '/catalog/girls/detskaya-kosmetika',
    text: ['Детская косметика для девочек в Алматы', 'Как выбрать набор'],
    links: [['/catalog/girls/detskaya-kosmetika/nabory-dlya-makiyazha', 'наборы для макияжа']],
    // Не `\b`: в JS граница слова — только латиница и цифры, «духи» ей не ловятся.
    absent: /(?<!\p{L})дух[иа](?!\p{L})/iu,
  },
  {
    path: '/catalog/kiddy/bizibordy',
    text: ['Бизиборды для малышей в Алматы', 'Как выбрать бизиборд'],
    links: [['/catalog/kiddy/bizibordy/bizikuby', 'бизикубы'], ['/brand/hola-toys', 'Hola Toys']],
  },
  {
    path: '/catalog/boys/mashinki/parkingi-i-garazhi',
    text: ['Паркинги и гаражи для машинок в Алматы', 'Как выбрать паркинг'],
    links: [['/catalog/boys/mashinki/avtotreki', 'автотреки']],
  },
  {
    path: '/catalog/girls/karnavalnye-kostyumy/krylya-fei',
    text: ['Крылья феи для девочек в Алматы', 'Flying Wings 606-21'],
    links: [],
  },
  {
    path: '/catalog/creativity/antistress',
    text: ['Антистресс-игрушки в Алматы', 'HZJJ-9'],
    links: [],
  },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
function decode(s) {
  return s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, '\'')
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/&amp;/g, '&')
}
function visibleText(html) {
  return decode(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
}
function anchors(html) {
  const body = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
  return [...body.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(m => [decode(m[1]), decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()])
}
/** Фраза вокруг совпадения — чтобы по выводу было видно, где именно. */
function around(text, re) {
  const m = text.match(re)
  return m ? text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 30).trim() : ''
}

console.log(`сайт ${BASE}`)

// ── 1. все разделы и связки из карты сайта ──────────────────────────────────
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => new URL(m[1]).pathname)
  .filter(p => p.startsWith('/catalog/') && !p.startsWith('/catalog/products/'))
console.log(`\n== ${paths.length} страниц разделов и связок из sitemap.xml`)
check(paths.length > 30, `в карте сайта ${paths.length} разделов и связок`)
let clean = 0
for (const path of paths) {
  const res = await fetch(`${BASE}${path}`)
  const text = visibleText(await res.text())
  const bad = around(text, FALSE_DELIVERY)
  if (res.status === 200 && !bad)
    clean++
  else
    check(false, `${path}: ${res.status !== 200 ? `ответ ${res.status}` : `«…${bad}…»`}`)
}
check(clean === paths.length, `без обещания «1–3 дня по всему Казахстану» и «Карагандy»: ${clean} из ${paths.length}`)

// ── 2. переписанные разделы ─────────────────────────────────────────────────
for (const p of REWRITTEN) {
  console.log(`\n== ${p.path}`)
  const res = await fetch(`${BASE}${p.path}`)
  const html = await res.text()
  const text = visibleText(html)
  check(res.status === 200, `ответ ${res.status}`)
  for (const t of p.text)
    check(text.includes(t), `в тексте «${t}»`)
  const tpl = around(text, TEMPLATE)
  check(!tpl, `шаблонных фраз нет${tpl ? ` — «…${tpl}…»` : ''}`)
  if (p.absent) {
    const a = around(text, p.absent)
    check(!a, `выдуманного ассортимента нет${a ? ` — «…${a}…»` : ''}`)
  }
  check(!/&lt;a\s|<a\s[^>]*>[^<]*&lt;/.test(html), 'сырого «<a» в тексте нет')
  const links = anchors(html)
  for (const [href, label] of p.links)
    check(links.some(([h, l]) => h === href && l === label), `ссылка «${label}» → ${href}`)
}

// ── 3. браузер ──────────────────────────────────────────────────────────────
console.log('\n== браузер')
const browser = await chromium.launch()
try {
  for (const p of REWRITTEN.slice(0, 3)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const mismatch = []
    page.on('console', (m) => {
      if (/Hydration/i.test(m.text()))
        mismatch.push(m.text())
    })
    const loaded = await page.goto(`${BASE}${p.path}`, { waitUntil: 'load', timeout: 120000 })
      .then(() => true, (e) => {
        check(false, `${p.path}: страница не загрузилась — ${e.message.split('\n')[0]}`)
        return false
      })
    if (loaded) {
      await page.waitForFunction(() => !!document.querySelector('#__nuxt')?.__vue_app__, null, { timeout: 60000 })
        .catch(() => {})
        .then(() => page.waitForTimeout(2500))
      check(!mismatch.length, `${p.path}: гидратация без расхождений${mismatch.length ? ` — ${mismatch[0].slice(0, 160)}` : ''}`)
    }
    await page.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

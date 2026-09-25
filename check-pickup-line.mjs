/*
 * Строка самовывоза у заголовка раздела, бренда и серии.
 *
 * Почему это проверяется (25 сентября 2026, план аудита, п. 16). Самовывозом
 * получают 42 заказа из 45, а у страниц каталога не было местных сигналов:
 * адрес и часы жили на «О нас», в «Условиях» и в карточке товара. Строка —
 * `components/common/PickupLine.vue`.
 *
 * Что проверяет:
 *  1) на каждом виде страницы — раздел, хаб с текстом из кода, связка
 *     «раздел + бренд», бренд, LEGO, серия — строка ровно одна, после H1 и
 *     до первого товара;
 *  2) адрес и часы в ней те же, что в разметке магазина на главной
 *     (ToyStore: streetAddress, openingHoursSpecification), — страж берёт их
 *     оттуда, а не из кода сайта; оплата — Kaspi или наличные;
 *  3) в браузере на 390 и 1440 — видна, не длиннее трёх строк, страница не
 *     уезжает вбок, гидратация без расхождений.
 *
 *   node check-pickup-line.mjs --base=http://localhost:3127
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3127'

const PAGES = [
  ['раздел', '/catalog/boys/mashinki/radioupravlyaemye-mashinki'],
  ['хаб с текстом из кода', '/catalog/constructors-root'],
  ['связка «раздел + бренд»', '/catalog/constructors-root/konstruktory-malchikam/brand/lego'],
  ['бренд', '/brand/mokatoys'],
  ['LEGO', '/brand/lego'],
  ['серия', '/brand/lego/lego-city'],
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const decode = s => s.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
const plain = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

// Адрес и часы — из разметки магазина на главной
const home = await (await fetch(`${BASE}/`)).text()
const nodes = []
for (const m of home.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
  try {
    const data = JSON.parse(m[1])
    nodes.push(...(data['@graph'] ?? [data]))
  }
  catch {}
}
// ToyStore — с 25 сентября (п. 19), до него — Store
const store = nodes.find(n => ['Store', 'ToyStore'].includes(n['@type']))
const streetAddress = store?.address?.streetAddress ?? ''
const spec = [store?.openingHoursSpecification ?? []].flat()[0] ?? {}
// «мкр. Шапагат, ул. Амангельды, 100» → «Шапагат, Амангельды, 100»; «09:00» → «9:00»
const shortAddress = streetAddress.replace(/(?:мкр|ул)\.\s/g, '')
const hours = `${String(spec.opens ?? '').replace(/^0/, '')}–${spec.closes ?? ''}`
const expected = `Самовывоз бесплатно: ${shortAddress} · ежедневно ${hours} · оплата Kaspi или наличными`
console.log(`сайт ${BASE}\nиз разметки магазина: «${streetAddress}», ${spec.opens}–${spec.closes}`)
check(!!streetAddress && !!spec.opens && !!spec.closes, 'в разметке магазина есть адрес и часы')

console.log('\n== серверная разметка')
for (const [kind, path] of PAGES) {
  const res = await fetch(`${BASE}${path}`)
  const html = (await res.text()).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, ' ')
  const lines = [...html.matchAll(/<p class="pickup-line[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
  const at = lines[0]?.index ?? -1
  const h1 = html.search(/<h1\b/)
  // Первый товар ПОСЛЕ заголовка: в шапке LEGO витрина с флагманом стоит выше H1
  const firstProduct = h1 < 0 ? -1 : html.indexOf('href="/catalog/products/', h1)
  check(res.status === 200 && lines.length === 1, `${kind} ${path}: строка одна (${lines.length}, ответ ${res.status})`)
  check(plain(lines[0]?.[1] ?? '') === expected, `${kind}: «${plain(lines[0]?.[1] ?? '')}»`)
  check(h1 >= 0 && at > h1 && (firstProduct < 0 || at < firstProduct), `${kind}: после H1 и до первого товара`)
}

console.log('\n== браузер')
const browser = await chromium.launch()
try {
  for (const [w, h, tag] of [[390, 844, '390'], [1440, 1000, '1440']]) {
    for (const [kind, path] of PAGES) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 1000, hasTouch: w < 1000 })
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
        }
        catch {}
      })
      const page = await ctx.newPage()
      const mismatch = []
      page.on('console', (m) => {
        if (/Hydration/i.test(m.text()))
          mismatch.push(m.text())
      })
      await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 })
      await page.waitForTimeout(2500)
      const info = await page.evaluate(() => {
        const el = [...document.querySelectorAll('.pickup-line')].find(e => e.offsetParent !== null)
        const r = el?.getBoundingClientRect()
        return {
          visible: !!el,
          lines: r ? Math.round(r.height / Number.parseFloat(getComputedStyle(el).lineHeight)) : 0,
          sideways: document.documentElement.scrollWidth > window.innerWidth,
        }
      })
      check(info.visible && info.lines <= 3 && !info.sideways && !mismatch.length, `${tag} ${kind}: видна, строк ${info.lines}${info.sideways ? ', СТРАНИЦА УЕЗЖАЕТ ВБОК' : ''}${mismatch.length ? `, гидратация: ${mismatch[0].slice(0, 120)}` : ''}`)
      await ctx.close()
    }
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nКРАСНЫЙ: ${fails.length} провал(ов)` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

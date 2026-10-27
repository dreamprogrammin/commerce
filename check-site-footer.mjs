/*
 * Подвал по макету SiteFooter.dc.html (23 октября 2026).
 *
 * Серверная разметка — главная, раздел, карточка, «О нас», «Условия»:
 *  1) подвал один, все его ссылки есть в разметке (на телефоне списки
 *     свёрнуты стилем, а не v-if, — поисковик видит их всегда), среди них
 *     LEGO, машинки и /returns, которых ждут check-lego-rc-seo и
 *     check-ai-visibility;
 *  2) срок доставки настоящий (1–3 дня), а не макетные «1–2 дня»; адрес и
 *     часы магазина видны;
 *  3) запросов подвала к базе больше нет — в данных страницы нет ключей
 *     прежнего подвала (`footer-categories`, `footer-popular-products`).
 * Цели ссылок: каждая отвечает 200 и не закрыта от индекса (кроме корзины,
 * избранного и «Новинок» — сортированная выдача, `noindex, follow`); якоря
 * #dostavka, #samovyvoz, #bonusy, #kontakty есть на месте.
 * Браузер:
 *  4) 1440 — скругление 32, магазин и три колонки в одну строку, плашка в одну
 *     строку; 768 — магазин над тремя колонками;
 *  5) 390 — списки свёрнуты, кнопка раскрывает (aria-expanded), ссылки в две
 *     колонки; телефон во всю ширину, мессенджеры рядом;
 *  6) низ подвала (копирайт) не уходит под нижнюю навигацию и под панель
 *     «В корзину» на карточке — резерв 96px внутри подвала;
 *  7) контраст текста синей плашки по пикселям: заголовок ≥ 3:1 (крупный),
 *     подзаголовок и кнопки ≥ 4,5:1; телефон — по цвету на белом;
 *  8) ошибок консоли и гидратации нет, вбок страница не уезжает.
 *
 *   node check-site-footer.mjs --base=http://localhost:3157 [--shots=<папка>]
 *
 * Только чтение. Скрипт — из корня репозитория (Playwright из node_modules).
 */
import process from 'node:process'
import { chromium } from 'playwright'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const BASE = arg('base') || 'http://localhost:3157'
const SHOTS = arg('shots')

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;| /g, ' ').replace(/\s+/g, ' ').trim()

const EXPECTED = [
  '/catalog/all?sort_by=newest',
  '/catalog/promotions',
  '/catalog/boys',
  '/catalog/girls',
  '/catalog/kiddy',
  '/brand/lego',
  '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
  '/terms#dostavka',
  '/terms#bonusy',
  '/returns',
  '/cart',
  '/profile/wishlist',
  '/about',
  '/brands',
  '/about#kontakty',
  '/terms#samovyvoz',
  '/privacy-policy',
  '/terms',
]
const PRIVATE = ['/cart', '/profile/wishlist']
// Сортированная выдача закрыта `noindex, follow` намеренно (правило фильтров и
// сортировки в pages/catalog/[...slug].vue): ссылка «Новинки» — для людей, по
// ней ходят и роботы. Тот же адрес у «Смотреть все» ленты на главной.
const NOINDEX_FOLLOW_OK = ['/catalog/all?sort_by=newest']

function footerOf(html) {
  const start = html.indexOf('<div class="ft-outer"')
  if (start < 0)
    return null
  const end = html.indexOf('</footer>', start)
  return html.slice(start, end + 9)
}
const hrefs = html => [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'))

// ── серверная разметка ──────────────────────────────────────────────────
console.log(`сайт ${BASE}`)
const homeHtml = await (await fetch(`${BASE}/`)).text()
const productSlug = homeHtml.match(/href="\/catalog\/products\/([\w-]+)"/)?.[1]
const PAGES = ['/', '/catalog/girls/kukly', `/catalog/products/${productSlug}`, '/about', '/terms']
const previewNoindex = /<meta[^>]+name="robots"[^>]+noindex/.test(homeHtml)

for (const path of PAGES) {
  console.log(`\n== ${path.slice(0, 70)}`)
  const html = path === '/' ? homeHtml : await (await fetch(`${BASE}${path}`)).text()
  const footer = footerOf(html)
  check(Boolean(footer) && html.split('<div class="ft-outer"').length === 2, 'подвал на странице ровно один')
  if (!footer)
    continue
  const links = hrefs(footer)
  const missing = EXPECTED.filter(h => !links.includes(h))
  check(missing.length === 0, `все ссылки подвала в разметке${missing.length ? ` — нет: ${missing.join(', ')}` : ''}`)
  const text = plain(footer)
  check(!/1[–-]2 дн/.test(text) && /по Алматы 1–3 дня, по Казахстану 3–7 дней/.test(text), 'срок доставки — 1–3 дня по Алматы, 3–7 по Казахстану')
  check(/Амангельды, 100/.test(text) && /9:00 до 22:00/.test(text), 'адрес и часы магазина видны')
  check(/Конструкторы LEGO/.test(text) && /Радиоуправляемые машинки/.test(text), 'LEGO и машинки — в колонке каталога')
  const data = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? ''
  check(!/footer-categories|footer-popular-products/.test(data), 'запросов прежнего подвала в данных страницы нет')
}

console.log('\n== куда ведут ссылки')
const targets = [...new Set(EXPECTED.map(h => h.split('#')[0]))]
const bodies = {}
for (const t of targets) {
  const res = await fetch(`${BASE}${t}`)
  const html = await res.text()
  bodies[t] = html
  const robots = `${html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? ''} ${res.headers.get('x-robots-tag') ?? ''}`
  const noindex = /noindex/.test(robots)
  const indexOk = previewNoindex || PRIVATE.includes(t) || !noindex
    || (NOINDEX_FOLLOW_OK.includes(t) && !/nofollow/.test(robots))
  check(res.status === 200 && indexOk, `${t} — ${res.status}${noindex ? `, ${robots.trim()}` : ''}`)
}
for (const h of EXPECTED.filter(x => x.includes('#'))) {
  const [path, id] = h.split('#')
  check(bodies[path].includes(`id="${id}"`), `якорь ${h} на месте`)
}

// ── браузер ─────────────────────────────────────────────────────────────
const browser = await chromium.launch()

async function open(path, viewport, opts = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr ?? 1, isMobile: Boolean(opts.mobile), hasTouch: Boolean(opts.mobile) })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => {
    if ((m.type() === 'error' || /hydration/i.test(m.text())) && !/vercel\.live/.test(m.text()))
      errors.push(m.text().slice(0, 160))
  })
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)))
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 60000 })
  await page.locator('.ft').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  return { context, page, errors }
}

const rect = (page, sel) => page.evaluate(s => [...document.querySelectorAll(s)].map((el) => {
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), b: Math.round(r.bottom), r: Math.round(r.right), display: getComputedStyle(el).display }
}), sel)

/*
 * Контраст по пикселям: текст и значки плашки прячутся, снимается фон под
 * надписью, берётся светлый край (98-й перцентиль яркости) — худший случай
 * для белого текста. Цвет текста накладывается на этот фон по своей
 * прозрачности.
 */
async function contrast(page, selector, inset = 0) {
  const box = await page.locator(selector).first().boundingBox()
  const color = await page.locator(selector).first().evaluate(el => getComputedStyle(el).color)
  const tag = await page.addStyleTag({ content: '.ft-help, .ft-help * { color: transparent !important; } .ft-help .iconify, .ft-help svg { opacity: 0 !important; }' })
  await page.waitForTimeout(100)
  const shot = await page.screenshot({ clip: { x: box.x + inset, y: box.y + inset, width: box.width - inset * 2, height: box.height - inset * 2 } })
  await tag.evaluate(n => n.remove())
  return page.evaluate(async ({ b64, color }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, img.width, img.height).data
    const lin = v => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const px = []
    for (let i = 0; i < d.length; i += 4)
      px.push([lum(d[i], d[i + 1], d[i + 2]), d[i], d[i + 1], d[i + 2]])
    px.sort((a, b) => a[0] - b[0])
    const [, r, g, b] = px[Math.floor(px.length * 0.98)]
    const m = color.match(/[\d.]+/g).map(Number)
    const a = m[3] ?? 1
    const t = [0, 1, 2].map(k => m[k] * a + [r, g, b][k] * (1 - a))
    const lt = lum(...t)
    const lb = lum(r, g, b)
    return { ratio: (Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05), bg: `rgb(${r},${g},${b})` }
  }, { b64: shot.toString('base64'), color })
}

try {
  // 1440 — плоская страница и главная
  for (const path of ['/about', '/']) {
    console.log(`\n== 1440 ${path}`)
    const { context, page, errors } = await open(path, { width: 1440, height: 900 })
    const st = await page.evaluate(() => {
      const f = getComputedStyle(document.querySelector('.ft'))
      return { radius: f.borderTopLeftRadius, pad: f.paddingBottom, pageW: document.documentElement.scrollWidth }
    })
    check(st.radius === '32px' && st.pad === '0px', `скругление ${st.radius}, резерв снизу ${st.pad}`)
    const [brand] = await rect(page, '.ft-brand')
    const cols = await rect(page, '.ft-col')
    check(cols.length === 3 && cols.every(c => Math.abs(c.y - brand.y) <= 2 && c.x > brand.x), `магазин и три колонки в одну строку (${[brand, ...cols].map(c => c.y).join(', ')})`)
    const [intro] = await rect(page, '.ft-help__intro')
    const [actions] = await rect(page, '.ft-help__actions')
    check(actions.x >= intro.r, 'плашка: текст слева, кнопки справа')
    const links = await rect(page, '.ft-link')
    check(links.length >= 16 && links.every(l => l.display !== 'none' && l.h > 0), `ссылки колонок видны (${links.length})`)
    if (path === '/about') {
      const title = await contrast(page, '.ft-help__title')
      const sub = await contrast(page, '.ft-help__sub')
      const glass = await contrast(page, '.ft-btn--glass', 4)
      const phone = await page.evaluate(() => getComputedStyle(document.querySelector('.ft-btn--phone')).color)
      console.log(`  фон: заголовок ${title.bg}, подзаголовок ${sub.bg}, кнопка ${glass.bg}; цвет телефона ${phone}`)
      check(title.ratio >= 3, `контраст заголовка ${title.ratio.toFixed(2)}:1 (крупный текст, нужно 3)`)
      check(sub.ratio >= 4.5, `контраст подзаголовка ${sub.ratio.toFixed(2)}:1 (нужно 4,5)`)
      check(glass.ratio >= 4.5, `контраст кнопки мессенджера ${glass.ratio.toFixed(2)}:1 (нужно 4,5)`)
      if (SHOTS)
        await page.locator('.ft').screenshot({ path: `${SHOTS}/footer-1440.png` })
    }
    check(st.pageW <= 1440, `без горизонтальной прокрутки (${st.pageW})`)
    check(errors.length === 0, `ошибок консоли и гидратации: ${errors.length}${errors.length ? ` — ${errors.slice(0, 2).join(' | ')}` : ''}`)
    await context.close()
  }

  console.log('\n== 768 /about')
  {
    const { context, page, errors } = await open('/about', { width: 768, height: 1024 })
    const [brand] = await rect(page, '.ft-brand')
    const cols = await rect(page, '.ft-col')
    check(cols.every(c => c.y > brand.b) && new Set(cols.map(c => c.y)).size === 1, 'магазин сверху, три колонки строкой под ним')
    if (SHOTS)
      await page.locator('.ft').screenshot({ path: `${SHOTS}/footer-768.png` })
    check(errors.length === 0, `ошибок консоли и гидратации: ${errors.length}`)
    await context.close()
  }

  for (const path of ['/about', `/catalog/products/${productSlug}`, '/']) {
    console.log(`\n== 390 ${path.slice(0, 60)}`)
    const { context, page, errors } = await open(path, { width: 390, height: 844 }, { dpr: 2, mobile: true })
    const st = await page.evaluate(() => {
      const f = getComputedStyle(document.querySelector('.ft'))
      return { radius: f.borderTopLeftRadius, pad: f.paddingBottom, pageW: document.documentElement.scrollWidth }
    })
    check(st.radius === '0px' && st.pad === '96px', `без скругления (${st.radius}), резерв снизу ${st.pad}`)
    if (path === '/about') {
      const listsBefore = await rect(page, '.ft-col__links')
      check(listsBefore.every(l => l.display === 'none'), 'списки колонок свёрнуты')
      await page.locator('.ft-col__toggle').first().click()
      await page.waitForTimeout(250)
      const listsAfter = await rect(page, '.ft-col__links')
      const expanded = await page.locator('.ft-col__toggle').first().getAttribute('aria-expanded')
      const firstLinks = await rect(page, '.ft-col:first-child .ft-link')
      check(listsAfter[0].display === 'grid' && expanded === 'true', `кнопка раскрыла «Каталог» (aria-expanded=${expanded})`)
      check(new Set(firstLinks.map(l => l.x)).size === 2 && firstLinks.every(l => l.h >= 42), `ссылки в две колонки, высота строки ${firstLinks[0]?.h}px`)
      const [phone] = await rect(page, '.ft-btn--phone')
      const glass = await rect(page, '.ft-btn--glass')
      const [help] = await rect(page, '.ft-help')
      check(phone.w >= help.w - 40 && glass.length === 2 && glass[0].y === glass[1].y && glass[0].x < glass[1].x, 'телефон во всю ширину, мессенджеры рядом')
      if (SHOTS) {
        await page.locator('.ft').screenshot({ path: `${SHOTS}/footer-390-open.png` })
        await page.locator('.ft-col__toggle').first().click()
        await page.waitForTimeout(250)
        await page.locator('.ft').screenshot({ path: `${SHOTS}/footer-390.png` })
      }
    }
    // Низ подвала против нижней навигации (когда она видна, она занимает
    // последние 62px окна) и против панели «В корзину» на карточке.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(900)
    const geo = await page.evaluate(() => {
      const bottom = document.querySelector('.ft-bottom').getBoundingClientRect().bottom
      const bar = document.querySelector('.pdp-buybar')
      const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : null
      return { bottom: Math.round(bottom), barTop: barTop == null ? null : Math.round(barTop), vh: innerHeight }
    })
    const limit = Math.min(geo.vh - 62, geo.barTop ?? Infinity)
    check(geo.bottom <= limit, `копирайт выше навигации и панели покупки (низ ${geo.bottom}, граница ${limit}${geo.barTop != null ? `, панель с ${geo.barTop}` : ''})`)
    check(st.pageW <= 390, `без горизонтальной прокрутки (${st.pageW})`)
    check(errors.length === 0, `ошибок консоли и гидратации: ${errors.length}${errors.length ? ` — ${errors.slice(0, 2).join(' | ')}` : ''}`)
    await context.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nВсё зелёное')
process.exit(fails.length ? 1 : 0)

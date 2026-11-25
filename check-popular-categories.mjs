/*
 * «Популярные категории» на главной: названия в плитках читаются и никуда не
 * залезают.
 *
 * Почему это проверяется. 25 ноября 2026 владелец: «шрифт нужно увеличить,
 * чтобы было легче читать». На телефоне название в плитке было 11px — размер,
 * унесённый со старой главной при переезде на общую плитку
 * (components/category/CategoryTile.vue). Его подняли до 15–16px по прототипу
 * (PopularCategories.dc.html), и сразу вылезли три вещи, за которыми смотрит
 * эта проверка:
 *   1. в узких плитках бенто (1024px) длинные слова обрезались краем плитки —
 *      «Конструкторы», «Интерактивные»;
 *   2. высокие картинки упирались во вторую строку заголовка — голова
 *      динозавра в «Питомцах мальчикам» на 390px;
 *   3. плитка ленты на телефоне выросла до 164px, и на 360px пропал край
 *      третьей колонки — подсказка, что ленту можно листать.
 * И прежнее условие: на телефоне с DPR 3 картинки плиток — вариант sm (см.
 * imageOf в components/home/PopularCategories.vue), иначе они впятеро тяжелее.
 *
 * 768px не проверяется: малые плитки бенто там 81px, и два длинных слова
 * обрезались и до 25 ноября. Это отдельная задача.
 *
 * Данные — категории боевой базы: на локальной базе бакеты пустые, картинок
 * нет, и пункт 2 не проверить. Стенд — сборка на прод-данных, только чтение
 * (рецепт в docs/HANDOFF.md, «Ловушка стенда»):
 *   pnpm build && NUXT_PUBLIC_SUPABASE_URL=https://gvsdevsvzgcivpphcuai.supabase.co \
 *     NUXT_PUBLIC_SUPABASE_KEY=<публичный anon из разметки uhti.kz> PORT=3143 node .output/server/index.mjs
 *   node check-popular-categories.mjs --base=http://localhost:3143
 * Из картинок Supabase пропускаются только картинки категорий — ради трафика.
 */
import process from 'node:process'
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3143'
const MIN_PHONE_FONT = 15
const MIN_PEEK = 16

const VIEWS = [
  { id: '360px', width: 360, height: 800, dpr: 3, phone: true },
  { id: '390px', width: 390, height: 844, dpr: 3, phone: true },
  { id: '1024px', width: 1024, height: 768, dpr: 2, phone: false },
  { id: '1440px', width: 1440, height: 900, dpr: 1, phone: false },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

/** Плитки секции на текущей вкладке: размер заголовка, вылет за плитку, где картинка */
function measure() {
  const sec = [...document.querySelectorAll('section')]
    .find(s => s.querySelector('h2')?.textContent?.includes('Популярные категории'))
  if (!sec)
    return null
  const tiles = [...sec.querySelectorAll('a.ct')].filter(a => a.getClientRects().length > 0)
  const out = tiles.map((a) => {
    const title = a.querySelector('.ct__corner-title')
    const tile = a.querySelector('.ct__tile').getBoundingClientRect()
    const tr = title.getBoundingClientRect()
    const img = a.querySelector('img.ct__img')
    let imageTop = null
    let variant = null
    if (img?.naturalWidth) {
      // Видимая картинка: contain вписывает её в коробку и прижимает к правому нижнему углу
      const box = img.getBoundingClientRect()
      const ar = img.naturalWidth / img.naturalHeight
      const w = Math.min(box.width, box.height * ar)
      imageTop = box.bottom - w / ar - tile.top
      variant = (img.currentSrc.match(/[-_/](sm|md|lg)[-_./]/) || [])[1] || 'не понять'
    }
    return {
      name: title.textContent.trim(),
      lg: a.classList.contains('ct--lg'),
      font: Number.parseFloat(getComputedStyle(title).fontSize),
      past: Math.round(tr.left + title.scrollWidth - tile.right),
      gap: imageTop === null ? null : Math.round(imageTop - (tr.bottom - tile.top)),
      variant,
    }
  })
  const lefts = [...new Set([...sec.querySelectorAll('.cats-focus-grid a.ct')]
    .filter(a => a.getClientRects().length > 0)
    .map(a => Math.round(a.getBoundingClientRect().left)))].sort((x, y) => x - y)
  return { tiles: out, peek: lefts.length > 2 ? innerWidth - lefts[2] : null }
}

const browser = await chromium.launch()
try {
  for (const v of VIEWS) {
    console.log(`\n${v.id}`)
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: v.dpr,
      isMobile: v.phone,
      hasTouch: v.phone,
    })
    await ctx.route(/supabase\.co\/storage\//, r =>
      r.request().url().includes('/category-images/') ? r.continue() : r.abort())
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e)))
    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    const h2 = page.locator('h2', { hasText: 'Популярные категории' })
    await h2.scrollIntoViewIfNeeded()
    const sec = page.locator('section', { has: h2 })
    const tabs = sec.locator('.cats-tab')
    const tabCount = await tabs.count()
    check(tabCount > 1, `вкладок ${tabCount}`)

    const bad = { font: [], past: [], gap: [], variant: [] }
    let tilesSeen = 0
    for (let i = 0; i < tabCount; i++) {
      const label = (await tabs.nth(i).textContent()).trim()
      if (i > 0)
        await tabs.nth(i).click()
      // Картинки в видимой части должны догрузиться, иначе их не измерить
      await page.waitForFunction(() => [...document.querySelectorAll('a.ct img.ct__img')]
        .filter(im => im.getClientRects().length && im.getBoundingClientRect().left < innerWidth)
        .every(im => im.complete && im.naturalWidth), null, { timeout: 15000 }).catch(() => {})
      const m = await page.evaluate(measure)
      if (!m) {
        check(false, `секция не найдена (вкладка «${label}»)`)
        continue
      }
      if (i === 0 && v.phone)
        check(m.peek !== null && m.peek >= MIN_PEEK, `край третьей колонки ленты: ${m.peek}px (ждём не меньше ${MIN_PEEK})`)
      for (const t of m.tiles) {
        tilesSeen++
        const where = `«${label}» › ${t.name}`
        if (v.phone && !t.lg && t.font < MIN_PHONE_FONT)
          bad.font.push(`${where} ${t.font}px`)
        if (t.past > 0)
          bad.past.push(`${where} +${t.past}px`)
        if (!t.lg && t.gap !== null && t.gap < 0)
          bad.gap.push(`${where} ${t.gap}px`)
        if (v.phone && t.variant !== null && t.variant !== 'sm')
          bad.variant.push(`${where} ${t.variant}`)
      }
    }
    check(tilesSeen > 0, `плиток на всех вкладках: ${tilesSeen}`)
    if (v.phone)
      check(!bad.font.length, `название не мельче ${MIN_PHONE_FONT}px${bad.font.length ? `: ${bad.font.slice(0, 4).join('; ')}` : ''}`)
    check(!bad.past.length, `название не уходит за край плитки${bad.past.length ? `: ${bad.past.slice(0, 4).join('; ')}` : ''}`)
    check(!bad.gap.length, `картинка не заходит под название${bad.gap.length ? `: ${bad.gap.slice(0, 4).join('; ')}` : ''}`)
    if (v.phone)
      check(!bad.variant.length, `картинки плиток — вариант sm${bad.variant.length ? `: ${bad.variant.slice(0, 4).join('; ')}` : ''}`)
    check(!errors.length, `ошибок на странице: ${errors.length}${errors.length ? ` — ${errors[0].slice(0, 120)}` : ''}`)
    await ctx.close()
  }
}
finally {
  await browser.close()
}

console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё зелено')
process.exit(fails.length ? 1 : 0)

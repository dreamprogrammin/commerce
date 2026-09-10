/*
 * Лендинг бренда — макет `Бренд LEGO.dc.html`.
 *
 * Страница показывается только бренду с флагом собственной страницы
 * (`brands.is_custom_page`), поэтому страж ходит на /brand/lego. Проверяются
 * значения макета и поведение подборки: числа в чипах, переключение осей,
 * выбор коллекции из шапки, «Показать ещё» и то, что обычным брендам ничего
 * из этого не досталось.
 *
 * ВАЖНО: мерить только на СБОРКЕ. На dev-сервере порядок слоёв Tailwind
 * другой, preflight перебивает наши классы, и заголовок вместо 52px выходит
 * 16px (см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md).
 */
import { chromium } from 'playwright'

const BASE = process.argv.find(a => a.startsWith('--base='))?.slice(7) || 'http://localhost:3008'

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}

const browser = await chromium.launch()

async function open(opts) {
  const ctx = await browser.newContext(opts)
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('tg_modal_dismissed_at', String(Date.now()))
    }
    catch {}
  })
  const page = await ctx.newPage()
  return { ctx, page }
}

// ---------- 1. Десктоп: шапка по макету ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  // Без лендинга падать таймаутом незачем — это тоже результат проверки.
  const landed = await page.waitForSelector('.blh', { timeout: 30000 }).catch(() => null)
  if (!landed) {
    check(false, 'лендинг бренда отрисован')
    await ctx.close()
    await browser.close()
    console.log(`\nКРАСНЫЙ: ${fails.length} провал(ов)`)
    process.exit(1)
  }
  await page.waitForTimeout(3500)

  const hero = await page.evaluate(() => {
    const css = (sel, prop) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el)[prop] : null
    }
    const card = document.querySelector('.blh')
    return {
      radius: card ? getComputedStyle(card).borderRadius : null,
      h1Size: css('.blh__h1', 'fontSize'),
      h1Weight: css('.blh__h1', 'fontWeight'),
      logo: `${css('.blh__logo', 'width')}×${css('.blh__logo', 'height')}`,
      eyebrowColor: css('.blh__eyebrow', 'color'),
      chips: document.querySelectorAll('.blh__chip').length,
      chipHeight: css('.blh__chip', 'height'),
      collections: document.querySelectorAll('.blh__col').length,
      panelRadius: css('.blh__panel', 'borderRadius'),
      featRadius: css('.blh__feat-img', 'borderRadius'),
      ctaHeight: css('.blh__cta', 'height'),
      allBrands: !!document.querySelector('.blh__all'),
    }
  })

  console.log('\n1) шапка, десктоп')
  check(hero.radius === '30px', `карточка радиус 30 (${hero.radius})`)
  check(hero.h1Size === '52px' && hero.h1Weight === '800', `заголовок 52/800 (${hero.h1Size}/${hero.h1Weight})`)
  check(hero.logo === '92px×92px', `плитка логотипа 92×92 (${hero.logo})`)
  check(hero.eyebrowColor === 'rgb(191, 0, 10)', `надстрочник в цвет LEGO (${hero.eyebrowColor})`)
  check(hero.chips === 4, `четыре чипа доверия (${hero.chips})`)
  check(hero.chipHeight === '34px', `чип 34px (${hero.chipHeight})`)
  check(hero.collections === 7, `семь коллекций (${hero.collections})`)
  check(hero.panelRadius === '24px', `панель коллекций радиус 24 (${hero.panelRadius})`)
  check(hero.featRadius === '24px', `витрина радиус 24 (${hero.featRadius})`)
  check(hero.ctaHeight === '52px', `кнопка «В корзину» 52px (${hero.ctaHeight})`)
  check(hero.allBrands, 'кнопка «Все бренды» на широком экране')

  // ---------- 2. Подборка ----------
  const initial = await page.evaluate(() => ({
    buckets: [...document.querySelectorAll('.blp__bucket')].map(b => b.textContent.trim().replace(/\s+/g, ' ')),
    cards: document.querySelectorAll('.blp__grid .pc-card').length,
    more: document.querySelector('.blp__more')?.textContent?.trim(),
  }))

  console.log('\n2) подборка')
  check(initial.buckets.length === 3, `три корзины возраста (${initial.buckets.length})`)
  check(initial.cards === 4, `в сетке четыре товара (${initial.cards})`)
  check(!!initial.more && initial.more.includes('Показать ещё'), `кнопка «${initial.more}»`)

  // Сумма по чипам не больше числа товаров: иначе один набор попал в несколько корзин.
  const sum = initial.buckets.reduce((acc, label) => acc + Number(label.split(' ').pop()), 0)
  const total = await page.evaluate(() => Number(document.querySelector('.blp__all')?.textContent?.match(/\d+/)?.[0] ?? 0))

  check(sum <= total, `корзины возраста не пересекаются (сумма ${sum} при ${total} товарах)`)

  // «Показать ещё» раскрывает ТЕКУЩУЮ корзину, а не весь бренд.
  const bucketCount = Number(initial.buckets[0].split(' ').pop())
  await page.click('.blp__more')
  await page.waitForTimeout(600)
  const afterMore = await page.evaluate(() => ({
    cards: document.querySelectorAll('.blp__grid .pc-card').length,
    bucketOn: !!document.querySelector('.blp__bucket--on'),
  }))
  check(
    afterMore.cards === bucketCount,
    `«Показать ещё» раскрывает корзину, а не весь бренд (${initial.cards} → ${afterMore.cards} при ${bucketCount} в корзине)`,
  )
  check(afterMore.bucketOn, 'выбранная корзина осталась выбранной')

  // «Все N товаров» — наоборот, снимает отбор.
  await page.click('.blp__all')
  await page.waitForTimeout(600)
  const afterAll = await page.evaluate(() => document.querySelectorAll('.blp__grid .pc-card').length)
  check(afterAll === total, `«Все товары» показывают весь бренд (${afterAll} из ${total})`)

  // Переключение оси меняет корзины.
  await page.click('.blp__tabs .blp__tab:nth-child(2)')
  await page.waitForTimeout(600)
  const priceBuckets = await page.evaluate(() =>
    [...document.querySelectorAll('.blp__bucket')].map(b => b.textContent.trim().replace(/\s+/g, ' ')),
  )
  check(priceBuckets.some(b => b.includes('₸')), `ось «по цене» даёт свои корзины (${priceBuckets[0]})`)

  // ---------- 3. Коллекция из шапки ----------
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)
  await page.click('.blh__col:nth-child(2)')
  await page.waitForTimeout(900)
  const picked = await page.evaluate(() => ({
    axisOn: document.querySelector('.blp__tab--on')?.textContent?.trim(),
    bucketOn: document.querySelector('.blp__bucket--on')?.textContent?.trim().replace(/\s+/g, ' '),
    highlighted: document.querySelectorAll('.blh__col--on').length,
  }))

  console.log('\n3) выбор коллекции из шапки')
  check(picked.axisOn === 'По коллекции', `подборка встала на ось коллекций (${picked.axisOn})`)
  check(!!picked.bucketOn, `выбрана корзина «${picked.bucketOn}»`)
  check(picked.highlighted === 1, `в панели подсвечена одна коллекция (${picked.highlighted})`)

  await ctx.close()
}

// ---------- 4. Тёмная карточка хита ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.bls', { timeout: 30000 })
  await page.waitForTimeout(2500)

  const spot = await page.evaluate(() => {
    const el = document.querySelector('.bls')
    const cs = getComputedStyle(el)
    const name = document.querySelector('.bls__name')
    const hero = document.querySelector('.blh__feat-name')
    return {
      radius: cs.borderRadius,
      dark: cs.backgroundImage.includes('linear-gradient'),
      nameColor: name ? getComputedStyle(name).color : null,
      specs: document.querySelectorAll('.bls__spec').length,
      rating: document.querySelector('.bls__rating')?.textContent?.trim().replace(/\s+/g, ' '),
      sameAsHero: name?.textContent?.trim() === hero?.textContent?.trim(),
      buttons: document.querySelectorAll('.bls__cta, .bls__wish').length,
    }
  })

  console.log('\n4) карточка хита')
  check(spot.radius === '30px', `радиус 30 (${spot.radius})`)
  check(spot.dark, 'тёмная градиентная подложка')
  check(spot.nameColor === 'rgb(255, 255, 255)', `название белым (${spot.nameColor})`)
  check(spot.specs >= 2, `характеристики в чипах (${spot.specs})`)
  check(!spot.sameAsHero, 'хит не повторяет витрину шапки')
  check(spot.buttons === 2, `две кнопки (${spot.buttons})`)
  check(!/отзыв покупателей/.test(spot.rating ?? ''), `склонение отзывов: «${spot.rating}»`)

  // ---------- 5. Описание и факты ----------
  const about = await page.evaluate(() => {
    const text = document.querySelector('.bct__text')
    const li = document.querySelector('.bct__text li')
    return {
      card: !!text,
      radius: text ? getComputedStyle(text).borderRadius : null,
      h2: text ? getComputedStyle(text.querySelector('h2')).fontSize : null,
      bulletMarker: li ? getComputedStyle(li, '::before').maskImage !== 'none' : false,
      facts: [...document.querySelectorAll('.bfc__row')].map(r => r.textContent.trim().replace(/\s+/g, ' ')),
    }
  })

  console.log('\n5) описание и факты')
  check(about.card && about.radius === '26px', `карточка описания радиус 26 (${about.radius})`)
  check(about.h2 === '26px', `заголовок описания 26px (${about.h2})`)
  check(about.bulletMarker, 'вместо маркера — галочка')
  check(about.facts.length >= 3, `в справке ${about.facts.length} строк: ${about.facts.join(', ')}`)

  await ctx.close()
}

// ---------- 6. Обычный бренд не изменился ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/zuru`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(3500)
  const plain = await page.evaluate(() => ({
    landing: !!document.querySelector('.blh'),
    sidebar: !!document.querySelector('aside'),
  }))

  console.log('\n6) бренд без флага собственной страницы')
  check(!plain.landing, 'лендинга нет')
  check(plain.sidebar, 'обычный шаблон с фильтрами на месте')
  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: лендинг бренда по макету' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

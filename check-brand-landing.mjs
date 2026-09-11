/*
 * Лендинг бренда — макет `Бренд LEGO.dc.html`.
 *
 * Страница показывается только бренду с флагом собственной страницы
 * (`brands.is_custom_page`), поэтому страж ходит на /brand/lego. Проверяются
 * значения макета и поведение: тёмная шапка с витриной флагмана, лента
 * коллекций и шторка «Все коллекции», плашки «Акции и новинки», подборка с
 * сортировкой, тёмная карточка хита, описание, ссылки на категории, кнопка
 * «Наверх» — и то, что обычным брендам ничего из этого не досталось.
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

// ---------- 1. Десктоп: тёмная шапка ----------
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
    const band = document.querySelector('.blh')
    return {
      radius: band ? getComputedStyle(band).borderRadius : null,
      dark: band ? getComputedStyle(band).backgroundImage.includes('linear-gradient') : false,
      h1Size: css('.blh__h1', 'fontSize'),
      h1Weight: css('.blh__h1', 'fontWeight'),
      h1Color: css('.blh__h1', 'color'),
      logo: `${css('.blh__logo', 'width')}×${css('.blh__logo', 'height')}`,
      stats: document.querySelectorAll('.blh__stat').length,
      statNums: [...document.querySelectorAll('.blh__stat-num')].map(n => n.textContent.trim()),
      tags: document.querySelectorAll('.blh__tag').length,
      flagRadius: css('.blh__flag', 'borderRadius'),
      flagImgRadius: css('.blh__flag-img', 'borderRadius'),
      ctaHeight: css('.blh__cta', 'height'),
      // Панель коллекций уехала из шапки в свою секцию.
      panelInHero: !!document.querySelector('.blh .blc'),
    }
  })

  console.log('\n1) шапка, десктоп')
  check(hero.radius === '30px', `полоса радиус 30 (${hero.radius})`)
  check(hero.dark, 'тёмная градиентная подложка')
  check(hero.h1Size === '52px' && hero.h1Weight === '800', `заголовок 52/800 (${hero.h1Size}/${hero.h1Weight})`)
  check(hero.h1Color === 'rgb(255, 255, 255)', `заголовок белым (${hero.h1Color})`)
  check(hero.logo === '92px×92px', `плитка логотипа 92×92 (${hero.logo})`)
  check(hero.stats === 4, `четыре цифры о бренде (${hero.stats}: ${hero.statNums.join(', ')})`)
  check(hero.tags >= 2, `полоса доверия (${hero.tags} чипа)`)
  check(hero.flagRadius === '24px', `карточка флагмана радиус 24 (${hero.flagRadius})`)
  check(hero.flagImgRadius === '18px', `витрина радиус 18 (${hero.flagImgRadius})`)
  check(hero.ctaHeight === '50px', `кнопка «В корзину» 50px (${hero.ctaHeight})`)
  check(!hero.panelInHero, 'коллекции живут отдельной секцией, а не в шапке')

  // ---------- 2. Лента коллекций ----------
  const rail = await page.evaluate(() => {
    const tile = document.querySelector('.blc__tile')
    const prev = document.querySelector('.blc__arrow')
    return {
      tiles: document.querySelectorAll('.blc__tile').length,
      width: tile ? getComputedStyle(tile).width : null,
      radius: tile ? getComputedStyle(tile).borderRadius : null,
      counts: [...document.querySelectorAll('.blc__count')].map(c => c.textContent.trim()),
      empties: document.querySelectorAll('.blc__count--empty').length,
      prevDisabled: prev ? prev.disabled : null,
      allLabel: document.querySelector('.blc__all')?.textContent?.trim().replace(/\s+/g, ' '),
    }
  })

  console.log('\n2) лента коллекций')
  check(rail.tiles === 7, `семь коллекций в ленте (${rail.tiles})`)
  check(rail.width === '214px', `плитка 214px (${rail.width})`)
  check(rail.radius === '18px', `плитка радиус 18 (${rail.radius})`)
  check(rail.empties > 0, `пустые серии помечены обещанием (${rail.empties})`)
  check(rail.prevDisabled === true, 'кнопка «назад» погашена в начале ленты')
  check(rail.allLabel === 'Все 7', `кнопка «${rail.allLabel}»`)

  // Стрелка листает ленту.
  await page.click('.blc__arrows .blc__arrow:nth-child(2)')
  await page.waitForTimeout(900)
  const scrolled = await page.evaluate(() => ({
    left: document.querySelector('.blc__rail').scrollLeft,
    prevDisabled: document.querySelector('.blc__arrow').disabled,
  }))
  check(scrolled.left > 100, `стрелка листает ленту (scrollLeft ${Math.round(scrolled.left)})`)
  check(scrolled.prevDisabled === false, 'кнопка «назад» ожила после листания')

  /*
   * Протяжка мышью. Лента лежит ниже первого экрана — без прокрутки к ней
   * события мыши уходят мимо страницы, и проверка «не двигается» врёт.
   */
  await page.evaluate(() => {
    document.querySelector('.blc__rail').scrollLeft = 0
    document.querySelector('.blc__rail').scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(600)
  const box = await page.locator('.blc__rail').boundingBox()
  await page.mouse.move(box.x + box.width - 60, box.y + 60)
  await page.mouse.down()
  for (let i = 0; i < 12; i++)
    await page.mouse.move(box.x + box.width - 60 - i * 20, box.y + 60, { steps: 2 })
  await page.mouse.up()
  await page.waitForTimeout(900)
  const dragged = await page.evaluate(() => ({
    left: document.querySelector('.blc__rail').scrollLeft,
    picked: document.querySelectorAll('.blc__tile--on').length,
  }))
  check(dragged.left > 100, `лента едет протяжкой мыши (scrollLeft ${Math.round(dragged.left)})`)
  check(dragged.picked === 0, 'протяжка не выбирает коллекцию под курсором')

  // ---------- 3. Шторка «Все коллекции» ----------
  await page.click('.blc__all')
  await page.waitForTimeout(800)
  const sheet = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.blc__sheet-tile')]
    const empty = tiles.filter(t => t.classList.contains('blc__sheet-tile--empty'))
    const filled = tiles.filter(t => !t.classList.contains('blc__sheet-tile--empty'))
    return {
      open: !!document.querySelector('.blc__sheet-grid'),
      tiles: tiles.length,
      emptyCount: empty.length,
      filledAreLinks: filled.length > 0 && filled.every(
        a => a.tagName === 'A' && a.getAttribute('href')?.startsWith('/brand/lego/'),
      ),
      emptyAreNotLinks: empty.every(t => t.tagName !== 'A'),
    }
  })
  console.log('\n3) шторка «Все коллекции»')
  check(sheet.open, 'шторка открылась')
  check(sheet.tiles === 7, `в шторке все семь коллекций (${sheet.tiles})`)
  check(sheet.filledAreLinks, 'серии с товарами — ссылки на свои страницы')
  /*
   * Пустая серия ссылкой быть не должна: её страница закрыта `noindex`
   * (см. pages/brand/[brandSlug]/[lineSlug].vue), и с 11 сентября 2026 такие
   * адреса не подаются даже в карту сайта.
   */
  check(
    sheet.emptyCount > 0 && sheet.emptyAreNotLinks,
    `пустые серии не ссылки (${sheet.emptyCount} шт.)`,
  )

  await page.fill('.blc__search-input', 'city')
  await page.waitForTimeout(500)
  const filtered = await page.evaluate(() => document.querySelectorAll('.blc__sheet-tile').length)
  check(filtered === 1, `поиск по названию отбирает (${filtered} из 7 по «city»)`)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)

  // ---------- 4. Акции и новинки ----------
  const promo = await page.evaluate(() => ({
    slides: document.querySelectorAll('.blm__slide').length,
    kickers: [...document.querySelectorAll('.blm__kicker')].map(k => k.textContent.trim()),
    titles: [...document.querySelectorAll('.blm__slide-title')].map(t => t.textContent.trim()),
    notes: [...document.querySelectorAll('.blm__note')].map(t => t.textContent.trim()),
  }))
  console.log('\n4) акции и новинки')
  check(promo.slides >= 2, `плашек в ленте: ${promo.slides}`)
  check(promo.kickers.every(k => k.length > 0), `поводы заполнены: ${promo.kickers.join(' | ')}`)
  check(promo.notes.every(n => n.includes('₸')), `в справке цена: ${promo.notes[0]}`)

  // Нажатие на плашку переводит подборку на её серию.
  const promoTitle = promo.titles[0]
  await page.click('.blm__slide')
  await page.waitForTimeout(1200)
  const afterPromo = await page.evaluate(() => ({
    axis: document.querySelector('.blp__tab--on')?.textContent?.trim(),
    bucket: document.querySelector('.blp__bucket--on')?.textContent?.trim().replace(/\s+/g, ' '),
  }))
  check(afterPromo.axis === 'По коллекции', `подборка встала на ось коллекций (${afterPromo.axis})`)
  check(
    (afterPromo.bucket ?? '').startsWith(promoTitle),
    `выбрана серия плашки «${promoTitle}» (в чипе «${afterPromo.bucket}»)`,
  )

  // ---------- 4б. Кнопка витрины кладёт товар и запускает полёт ----------
  await page.evaluate(() => {
    window.__ghosts = 0
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.dataset && n.dataset.cartFly !== undefined)
            window.__ghosts++
        }
      }
    }).observe(document.body, { childList: true })
  })
  await page.click('.blh__cta')
  await page.waitForTimeout(1200)
  const added = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('cart'))
    let items = 0
    try {
      items = JSON.parse(localStorage.getItem(key) || '{}')?.items?.length ?? 0
    }
    catch {}
    return { ghosts: window.__ghosts, items }
  })
  check(added.items > 0, `витрина кладёт товар в корзину (позиций ${added.items})`)
  check(added.ghosts === 1, `витрина запускает полёт в корзину (призраков ${added.ghosts})`)

  await ctx.close()
}

// ---------- 5. Подборка ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.blp', { timeout: 30000 })
  await page.waitForTimeout(3500)

  const initial = await page.evaluate(() => ({
    axes: [...document.querySelectorAll('.blp__tab')].map(t => t.textContent.trim()),
    buckets: [...document.querySelectorAll('.blp__bucket')].map(b => b.textContent.trim().replace(/\s+/g, ' ')),
    cards: document.querySelectorAll('.blp__grid .pc-card').length,
    more: document.querySelector('.blp__more')?.textContent?.trim(),
    matched: document.querySelector('.blp__matched')?.textContent?.trim(),
    sortValue: document.querySelector('.blp__sort-select')?.value,
  }))

  console.log('\n5) подборка')
  check(initial.buckets.length === 3, `три корзины возраста (${initial.buckets.length})`)
  check(initial.cards === 4, `в сетке четыре товара (${initial.cards})`)
  check(!!initial.more && initial.more.includes('Показать ещё'), `кнопка «${initial.more}»`)
  check(/^\d+ товар/.test(initial.matched ?? ''), `счётчик отобранного: «${initial.matched}»`)
  check(!!initial.sortValue, `список сортировки на месте (${initial.sortValue})`)

  // Сумма по чипам не больше числа товаров: иначе один набор попал в несколько корзин.
  const sum = initial.buckets.reduce((acc, label) => acc + Number(label.split(' ').pop()), 0)
  const total = await page.evaluate(() => Number(document.querySelector('.blp__all')?.textContent?.match(/\d+/)?.[0] ?? 0))
  check(sum <= total, `корзины возраста не пересекаются (сумма ${sum} при ${total} товарах)`)

  // Сортировка меняет порядок и не сбрасывает отбор.
  await page.selectOption('.blp__sort-select', 'cheap')
  await page.waitForTimeout(700)
  const cheap = await page.evaluate(() =>
    [...document.querySelectorAll('.blp__grid .pc-card')]
      .map(c => Number((c.textContent.match(/(\d[\d\s ]*)\s*₸/) ?? [])[1]?.replace(/\D/g, '') ?? 0))
      .filter(Boolean),
  )
  check(
    cheap.length > 1 && cheap.every((v, i) => i === 0 || cheap[i - 1] <= v),
    `«Сначала дешевле» упорядочивает сетку (${cheap.join(' → ')})`,
  )
  const bucketStill = await page.evaluate(() => !!document.querySelector('.blp__bucket--on'))
  check(bucketStill, 'сортировка не сбрасывает выбранную корзину')

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
    `«Показать ещё» раскрывает корзину, а не весь бренд (4 → ${afterMore.cards} при ${bucketCount} в корзине)`,
  )
  check(afterMore.bucketOn, 'выбранная корзина осталась выбранной')

  // «Все N товаров» — наоборот, снимает отбор.
  await page.click('.blp__all')
  await page.waitForTimeout(600)
  const afterAll = await page.evaluate(() => document.querySelectorAll('.blp__grid .pc-card').length)
  check(afterAll === total, `«Все товары» показывают весь бренд (${afterAll} из ${total})`)

  // Переключение оси меняет корзины.
  const priceIndex = initial.axes.indexOf('По цене') + 1
  await page.click(`.blp__tabs .blp__tab:nth-child(${priceIndex})`)
  await page.waitForTimeout(600)
  const priceBuckets = await page.evaluate(() =>
    [...document.querySelectorAll('.blp__bucket')].map(b => b.textContent.trim().replace(/\s+/g, ' ')),
  )
  check(priceBuckets.some(b => b.includes('₸')), `ось «по цене» даёт свои корзины (${priceBuckets[0]})`)

  await ctx.close()
}

// ---------- 6. Тёмная карточка хита, описание, категории, «Наверх» ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.bls', { timeout: 30000 })
  await page.waitForTimeout(2500)

  const spot = await page.evaluate(() => {
    const el = document.querySelector('.bls')
    const cs = getComputedStyle(el)
    const name = document.querySelector('.bls__name')
    const flag = document.querySelector('.blh__flag-name')
    return {
      radius: cs.borderRadius,
      dark: cs.backgroundImage.includes('linear-gradient'),
      nameColor: name ? getComputedStyle(name).color : null,
      specs: document.querySelectorAll('.bls__spec').length,
      rating: document.querySelector('.bls__rating')?.textContent?.trim().replace(/\s+/g, ' '),
      sameAsHero: name?.textContent?.trim() === flag?.textContent?.trim(),
      buttons: document.querySelectorAll('.bls__cta, .bls__wish').length,
    }
  })

  console.log('\n6) карточка хита')
  check(spot.radius === '30px', `радиус 30 (${spot.radius})`)
  check(spot.dark, 'тёмная градиентная подложка')
  check(spot.nameColor === 'rgb(255, 255, 255)', `название белым (${spot.nameColor})`)
  check(spot.specs >= 2, `характеристики в чипах (${spot.specs})`)
  check(!spot.sameAsHero, 'хит не повторяет витрину шапки')
  check(spot.buttons === 2, `две кнопки (${spot.buttons})`)
  check(!/отзыв покупателей/.test(spot.rating ?? ''), `склонение отзывов: «${spot.rating}»`)

  const about = await page.evaluate(() => {
    const text = document.querySelector('.bct__text')
    const li = document.querySelector('.bct__text li')
    return {
      card: !!text,
      radius: text ? getComputedStyle(text).borderRadius : null,
      h2: text ? getComputedStyle(text.querySelector('h2')).fontSize : null,
      bulletMarker: li ? getComputedStyle(li, '::before').maskImage !== 'none' : false,
      facts: [...document.querySelectorAll('.bfc__row')].map(r => r.textContent.trim().replace(/\s+/g, ' ')),
      cats: [...document.querySelectorAll('.bct__cat')].map(a => ({
        text: a.textContent.trim(),
        href: a.getAttribute('href'),
        height: getComputedStyle(a).height,
      })),
    }
  })

  console.log('\n7) описание, справка и категории')
  check(about.card && about.radius === '26px', `карточка описания радиус 26 (${about.radius})`)
  check(about.h2 === '26px', `заголовок описания 26px (${about.h2})`)
  check(about.bulletMarker, 'вместо маркера — галочка')
  check(about.facts.length >= 3, `в справке ${about.facts.length} строк: ${about.facts.join(', ')}`)
  check(about.cats.length > 0, `ссылки на категории: ${about.cats.map(c => c.text).join(', ')}`)
  check(
    about.cats.every(c => c.height === '46px' && c.href?.includes('/brand/lego')),
    'плитки категорий 46px и ведут на бренд-лендинги',
  )

  // ---------- 8. Кнопка «Наверх» ----------
  const beforeScroll = await page.evaluate(() => !!document.querySelector('.bct__top'))
  await page.evaluate(() => window.scrollTo(0, 900))
  await page.waitForTimeout(800)
  const afterScroll = await page.evaluate(() => {
    const el = document.querySelector('.bct__top')
    return el ? { pos: getComputedStyle(el).position, bottom: getComputedStyle(el).bottom } : null
  })
  console.log('\n8) кнопка «Наверх»')
  check(!beforeScroll, 'в начале страницы кнопки нет')
  check(!!afterScroll && afterScroll.pos === 'fixed', `появляется при прокрутке (${afterScroll?.pos})`)

  await page.click('.bct__top')
  await page.waitForTimeout(1200)
  const backTop = await page.evaluate(() => window.scrollY)
  check(backTop < 50, `возвращает наверх (scrollY ${Math.round(backTop)})`)

  await ctx.close()
}

// ---------- 9. Обычный бренд не изменился ----------
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await page.goto(`${BASE}/brand/zuru`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(3500)
  const plain = await page.evaluate(() => ({
    landing: !!document.querySelector('.blh'),
    rails: !!document.querySelector('.blc, .blm'),
    sidebar: !!document.querySelector('aside'),
  }))

  console.log('\n9) бренд без флага собственной страницы')
  check(!plain.landing, 'лендинга нет')
  check(!plain.rails, 'лент коллекций и акций нет')
  check(plain.sidebar, 'обычный шаблон с фильтрами на месте')
  await ctx.close()
}

// ---------- 10. Телефон: значения макета ----------
{
  const { ctx, page } = await open({
    viewport: { width: 412, height: 900 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  })
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.blh', { timeout: 30000 })
  await page.waitForTimeout(3500)

  const mob = await page.evaluate(() => {
    const css = (sel, prop) => {
      const el = document.querySelector(sel)
      return el ? getComputedStyle(el)[prop] : null
    }
    const rail = document.querySelector('.blc__rail')
    const tile = document.querySelector('.blc__tile')
    return {
      h1: css('.blh__h1', 'fontSize'),
      bandRadius: css('.blh', 'borderRadius'),
      statCols: css('.blh__stats', 'gridTemplateColumns').split(' ').length,
      tileWidth: tile ? getComputedStyle(tile).width : null,
      // Лента идёт от края экрана: левый край плитки левее содержимого страницы.
      railLeft: rail ? Math.round(rail.getBoundingClientRect().left) : null,
      arrowsHidden: css('.blc__arrows', 'display') === 'none',
      grid: css('.blp__grid', 'gridTemplateColumns').split(' ').length,
    }
  })

  console.log('\n10) телефон')
  check(mob.h1 === '38px', `заголовок 38px (${mob.h1})`)
  check(mob.bandRadius === '24px', `полоса радиус 24 (${mob.bandRadius})`)
  check(mob.statCols === 2, `цифры в две колонки (${mob.statCols})`)
  check(mob.tileWidth === '172px', `плитка коллекции 172px (${mob.tileWidth})`)
  check(mob.railLeft <= 0, `лента идёт от края экрана (левый край ${mob.railLeft})`)
  check(mob.arrowsHidden, 'стрелок на телефоне нет')
  check(mob.grid === 2, `сетка в две колонки (${mob.grid})`)

  // Кнопка «Наверх» не должна лечь на таб-бар.
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(800)
  const top = await page.evaluate(() => {
    const el = document.querySelector('.bct__top')
    return el ? { bottom: getComputedStyle(el).bottom } : null
  })
  check(!!top && top.bottom === '104px', `«Наверх» поднята над таб-баром (${top?.bottom})`)

  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: лендинг бренда по макету' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

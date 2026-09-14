/*
 * Лендинг бренда — макет `Бренд LEGO v2.dc.html`.
 *
 * Страница показывается только бренду с флагом собственной страницы
 * (`brands.is_custom_page`), поэтому страж ходит на /brand/lego. Проверяются
 * полосы макета и поведение: синяя шапка с витриной, липкое меню разделов,
 * полоса условий, мозаика серий со шторкой, подборка с ползунками, карточки
 * по возрасту, тёмная полоса хита, лента «Рекомендуем», полоса бонусов,
 * статический текст о бренде, заявка в WhatsApp, «Наверх» — и то, что
 * обычному бренду ничего из этого не досталось.
 *
 * ВАЖНО: мерить только на СБОРКЕ. На dev-сервере порядок слоёв Tailwind
 * другой, preflight перебивает наши классы, и заголовок вместо 50px выходит
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

const DESKTOP = { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 }

// ---------- 1. Шапка ----------
{
  const { ctx, page } = await open(DESKTOP)
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
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
      fullBleed: band ? Math.round(band.getBoundingClientRect().width) : 0,
      blue: band ? getComputedStyle(band).backgroundImage.includes('linear-gradient') : false,
      studs: !!document.querySelector('.blh__studs'),
      h1Size: css('.blh__h1', 'fontSize'),
      h1Text: document.querySelector('.blh__h1')?.textContent?.trim().replace(/\s+/g, ' '),
      markBg: css('.blh__mark', 'backgroundColor'),
      pill: document.querySelector('.blh__pill')?.textContent?.trim(),
      crumbs: document.querySelectorAll('.blh__crumbs a').length,
      stats: document.querySelectorAll('.blh__stat').length,
      statNums: [...document.querySelectorAll('.blh__stat-num')].map(n => n.textContent.trim()),
      buttons: [...document.querySelectorAll('.blh__cta, .blh__ghost')].map(b => b.textContent.trim()),
      tagPrice: document.querySelector('.blh__tag-price')?.textContent?.trim(),
      hasAdd: !!document.querySelector('.blh__add'),
      /*
       * Признак липкого режима шапки — распорка, которую она рисует вместо
       * себя в потоке. На лендинге шапка не липкая: над плавающей капсулой
       * разделов она была бы второй полосой.
       */
      headerSpacer: !!document.querySelector('.sh-spacer'),
    }
  })

  console.log('\n1) шапка, десктоп')
  check(hero.fullBleed >= 1430, `полоса во всю ширину (${hero.fullBleed}px при окне 1440)`)
  check(hero.blue && hero.studs, 'синий градиент и сетка шипов')
  check(hero.h1Size === '50px', `заголовок 50px (${hero.h1Size})`)
  check(/Собирайте вместе с LEGO/.test(hero.h1Text ?? ''), `H1 «${hero.h1Text}»`)
  check(hero.markBg === 'rgb(253, 199, 0)', `имя бренда на жёлтой плашке (${hero.markBg})`)
  check(/Официальный бренд/.test(hero.pill ?? ''), `плашка бренда: «${hero.pill}»`)
  check(hero.crumbs >= 1, `хлебные крошки в шапке (${hero.crumbs} ссылок)`)
  check(hero.stats === 4, `четыре цифры (${hero.statNums.join(', ')})`)
  check(hero.buttons.length === 2, `две кнопки: ${hero.buttons.join(' / ')}`)
  check(!!hero.tagPrice && hero.hasAdd, `витрина с ценой «${hero.tagPrice}» и кнопкой корзины`)
  check(!hero.headerSpacer, 'шапка сайта на лендинге не липкая')

  /*
   * Срок доставки и кэшбэк берутся из условий магазина и из данных, а не из
   * макета: там стояли «1–2 дня» и «10%», а /terms обещает 1–3 дня по Алматы,
   * и бонусами по товарам выходит 5%.
   */
  const promises = await page.evaluate(() => ({
    stats: [...document.querySelectorAll('.blh__stat')].map(s => s.textContent.replace(/\s+/g, ' ').trim()),
    benefits: [...document.querySelectorAll('.blb__item')].map(s => s.textContent.replace(/\s+/g, ' ').trim()),
  }))
  console.log('\n2) обещания совпадают с условиями магазина')
  check(promises.benefits.length === 4, `четыре условия в полосе (${promises.benefits.length})`)
  check(
    promises.stats.some(s => s.includes('1–3 дня')) && promises.benefits.some(b => b.includes('1–3 дня')),
    'срок доставки 1–3 дня, как в /terms',
  )
  check(
    !promises.stats.some(s => s.includes('1–2 дня')) && !promises.benefits.some(b => b.includes('1–2 дня')),
    'нигде не обещаны «1–2 дня» из макета',
  )
  check(
    promises.benefits.some(b => /Обмен 14 дней/.test(b)),
    'обмен 14 дней, как в /returns',
  )

  // ---------- 3. Мозаика серий ----------
  const series = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.blc__tile')]
    const first = tiles[0]?.getBoundingClientRect()
    const second = tiles[1]?.getBoundingClientRect()
    return {
      count: tiles.length,
      firstWider: first && second ? first.width > second.width * 1.5 : false,
      names: [...document.querySelectorAll('.blc__name')].map(n => n.textContent.trim()),
      caps: [...document.querySelectorAll('.blc__cap')].map(n => n.textContent.trim()),
      empties: document.querySelectorAll('.blc__cap--empty').length,
    }
  })
  console.log('\n3) мозаика серий')
  check(series.count === 7, `семь серий (${series.count})`)
  check(series.firstWider, 'первая плитка крупнее остальных')
  check(series.names.length === 7, `названия серий текстом: ${series.names.slice(0, 3).join(', ')}…`)
  check(series.empties === 3, `пустые серии помечены обещанием (${series.empties})`)

  // Шторка «Все серии».
  await page.click('.blc__all')
  await page.waitForTimeout(800)
  const sheet = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.blc__sheet-tile')]
    const empty = tiles.filter(t => t.classList.contains('blc__sheet-tile--empty'))
    const filled = tiles.filter(t => !t.classList.contains('blc__sheet-tile--empty'))
    return {
      tiles: tiles.length,
      filledAreLinks: filled.length > 0 && filled.every(
        a => a.tagName === 'A' && a.getAttribute('href')?.startsWith('/brand/lego/'),
      ),
      emptyAreNotLinks: empty.length > 0 && empty.every(t => t.tagName !== 'A'),
    }
  })
  check(sheet.tiles === 7, `в шторке все семь серий (${sheet.tiles})`)
  check(sheet.filledAreLinks, 'серии с товарами — ссылки на свои страницы')
  check(sheet.emptyAreNotLinks, 'пустые серии не ссылки: их страницы закрыты noindex')

  await page.fill('.blc__search-input', 'city')
  await page.waitForTimeout(500)
  check(
    await page.evaluate(() => document.querySelectorAll('.blc__sheet-tile').length) === 1,
    'поиск по названию отбирает',
  )
  await page.keyboard.press('Escape')
  await page.waitForTimeout(700)

  await ctx.close()
}

// ---------- 4. Подборка с ползунками ----------
{
  const { ctx, page } = await open(DESKTOP)
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.blp__card', { timeout: 30000 })
  await page.waitForTimeout(3500)

  const start = await page.evaluate(() => ({
    sliders: document.querySelectorAll('.rf__area').length,
    inputs: document.querySelectorAll('.rf__input').length,
    ageBounds: [...document.querySelectorAll('.rf__input')].slice(0, 2).map(i => `${i.min}-${i.max}`),
    caps: [...document.querySelectorAll('.rf__cap')]
      .filter(c => c.offsetParent !== null)
      .map(c => c.textContent.trim()),
    tones: [...document.querySelectorAll('.rf')].map(r => r.className.match(/rf--(\w+)/)?.[1]),
    studs: document.querySelectorAll('.rf__studs').length,
    themes: [...document.querySelectorAll('.blp__block')][0]?.textContent?.replace(/\s+/g, ' ').trim(),
    seriesChips: document.querySelectorAll('.blp__block:nth-of-type(2) .blp__chip').length,
    cards: document.querySelectorAll('.blp__grid .pc-card').length,
    found: document.querySelector('.blp__found')?.textContent?.trim(),
    reset: !!document.querySelector('.blp__reset'),
  }))

  console.log('\n4) подборка')
  check(start.sliders === 2 && start.inputs === 4, `два двойных ползунка (${start.sliders}/${start.inputs})`)
  check(start.ageBounds[0] === '4-12', `границы возраста из данных (${start.ageBounds[0]})`)
  check(start.caps.length >= 2 && start.caps.some(c => c.includes('₸')), `подписи на пузырьках: ${start.caps.join(' | ')}`)
  check(
    start.tones.join(',') === 'blue,yellow' && start.studs === 2,
    `полосы по макету RangeFilter: тона ${start.tones.join(', ')}, шипы ${start.studs}`,
  )
  check(
    start.caps.some(c => /^\d+\s(год|года|лет)/.test(c)),
    `возраст склоняется: ${start.caps.find(c => /(год|года|лет)/.test(c))}`,
  )
  check(/Интерес/.test(start.themes ?? ''), `чипы интересов: ${start.themes?.slice(0, 60)}`)
  check(start.cards === 8, `в сетке восемь товаров (${start.cards})`)
  check(!start.reset, 'кнопки сброса нет, пока ничего не выбрано')

  // Ползунок возраста сужает выдачу.
  const total = Number(start.found?.match(/\d+/)?.[0] ?? 0)
  await page.evaluate(() => {
    const input = document.querySelectorAll('.rf__input')[0]
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '10')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await page.waitForTimeout(700)
  const narrowed = await page.evaluate(() => ({
    found: Number(document.querySelector('.blp__found')?.textContent?.match(/\d+/)?.[0] ?? 0),
    cap: [...document.querySelectorAll('.rf__cap')].filter(c => c.offsetParent !== null)[0]?.textContent?.trim(),
    reset: !!document.querySelector('.blp__reset'),
  }))
  check(narrowed.found > 0 && narrowed.found < total, `ползунок возраста сужает выдачу (${total} → ${narrowed.found})`)
  check(/^10/.test(narrowed.cap ?? ''), `подпись показывает новый отрезок («${narrowed.cap}»)`)
  check(narrowed.reset, 'появилась кнопка «Сбросить»')

  await page.click('.blp__reset')
  await page.waitForTimeout(600)
  check(
    await page.evaluate(() => Number(document.querySelector('.blp__found')?.textContent?.match(/\d+/)?.[0] ?? 0)) === total,
    `сброс возвращает всё (${total})`,
  )

  // Чип темы.
  const themeCount = await page.evaluate(() => {
    const chip = document.querySelector('.blp__chip')
    const n = Number(chip?.querySelector('.blp__chip-count')?.textContent?.trim() ?? 0)
    chip?.click()
    return n
  })
  await page.waitForTimeout(600)
  check(
    await page.evaluate(() => Number(document.querySelector('.blp__found')?.textContent?.match(/\d+/)?.[0] ?? 0)) === themeCount,
    `чип темы отбирает ровно своё число (${themeCount})`,
  )

  // Сортировка не сбрасывает отбор.
  await page.selectOption('.blp__sort-select', 'cheap')
  await page.waitForTimeout(700)
  const cheap = await page.evaluate(() =>
    [...document.querySelectorAll('.blp__grid .pc-card')]
      .map(c => Number((c.textContent.match(/(\d[\d\s ]*)\s*₸/) ?? [])[1]?.replace(/\D/g, '') ?? 0))
      .filter(Boolean),
  )
  check(
    cheap.length > 1 && cheap.every((v, i) => i === 0 || cheap[i - 1] <= v),
    `«Сначала дешевле» упорядочивает сетку (${cheap.slice(0, 4).join(' → ')})`,
  )
  check(
    await page.evaluate(() => !!document.querySelector('.blp__chip--on')),
    'сортировка не сбрасывает выбранный чип',
  )

  await ctx.close()
}

// ---------- 5. Возрастные карточки, хит, лента, бонусы ----------
{
  const { ctx, page } = await open(DESKTOP)
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.bla', { timeout: 30000 })
  await page.waitForTimeout(3000)

  const ages = await page.evaluate(() => ({
    cards: [...document.querySelectorAll('.bla__card')].map(c => ({
      age: c.querySelector('.bla__age')?.textContent?.trim(),
      count: c.querySelector('.bla__count')?.textContent?.trim(),
    })),
  }))
  console.log('\n5) карточки по возрасту')
  check(ages.cards.length === 3, `три карточки (${ages.cards.map(c => c.age).join(', ')})`)
  check(ages.cards.every(c => /\d/.test(c.count ?? '')), `счётчики заполнены: ${ages.cards.map(c => c.count).join(' / ')}`)

  // Нажатие ведёт в подборку и выставляет отрезок.
  await page.evaluate(() => document.querySelectorAll('.bla__card')[2]?.click())
  await page.waitForTimeout(1200)
  const applied = await page.evaluate(() => ({
    cap: [...document.querySelectorAll('.rf__cap')].filter(c => c.offsetParent !== null)[0]?.textContent?.trim(),
    reset: !!document.querySelector('.blp__reset'),
  }))
  check(/^10/.test(applied.cap ?? ''), `карточка «10+ лет» выставила отрезок («${applied.cap}»)`)
  check(applied.reset, 'подборка показывает, что отбор применён')

  // Тёмная полоса хита.
  await page.evaluate(() => document.querySelector('.bls')?.scrollIntoView())
  await page.waitForTimeout(6000)
  const spot = await page.evaluate(() => {
    const band = document.querySelector('.bls')
    const img = document.querySelector('.bls__img img')
    return {
      fullBleed: band ? Math.round(band.getBoundingClientRect().width) : 0,
      dark: band ? getComputedStyle(band).backgroundImage.includes('linear-gradient') : false,
      studs: !!document.querySelector('.bls__studs'),
      imgLoaded: img ? img.naturalWidth > 100 : false,
      buttons: document.querySelectorAll('.bls__cta, .bls__wish').length,
      sameAsHero: document.querySelector('.bls__name')?.textContent?.trim()
        === document.querySelector('.blh__tag-price')?.textContent?.trim(),
    }
  })
  console.log('\n6) полоса хита')
  check(spot.fullBleed >= 1430, `полоса во всю ширину (${spot.fullBleed}px)`)
  check(spot.dark && spot.studs, 'тёмный градиент и шипы')
  check(spot.imgLoaded, 'фотография хита загрузилась')
  check(spot.buttons === 2, `две кнопки (${spot.buttons})`)

  // Лента «Рекомендуем» — товары ДРУГИХ брендов.
  const recs = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.blr__item .pc-card')]
    return {
      count: items.length,
      hrefs: items.map(c => c.querySelector('a')?.getAttribute('href') ?? '').slice(0, 12),
      sub: document.querySelector('.blr__sub')?.textContent?.trim(),
    }
  })
  console.log('\n7) лента «Рекомендуем»')
  check(recs.count > 2, `в ленте ${recs.count} товаров`)
  check(!recs.hrefs.some(h => /lego/i.test(h)), 'в ленте нет товаров самого бренда')
  check(!!recs.sub, `подпись честная: «${recs.sub}»`)

  // Полоса бонусов: процент совпадает с тем, что в шапке.
  const bonus = await page.evaluate(() => ({
    band: document.querySelector('.blo__note')?.textContent?.replace(/\s+/g, ' ').trim(),
    heroStat: [...document.querySelectorAll('.blh__stat')].map(s => s.textContent).join(' '),
  }))
  const bandShare = bonus.band?.match(/до (\d+)%/)?.[1]
  console.log('\n8) полоса бонусов')
  check(!!bandShare && bonus.heroStat.includes(`${bandShare}%`), `процент один и тот же в шапке и в полосе (${bandShare}%)`)
  check(!/до 10%/.test(bonus.band ?? '') || bandShare === '10', 'нет обещания «до 10%» из макета, если данные говорят другое')

  await ctx.close()
}

// ---------- 9. Текст о бренде, справка, заявка ----------
{
  const { ctx, page } = await open(DESKTOP)
  await page.goto(`${BASE}/brand/lego`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.bct__text', { timeout: 30000 })
  await page.waitForTimeout(2500)

  const about = await page.evaluate(() => {
    const text = document.querySelector('.bct__text')
    return {
      h2: text?.querySelector('h2')?.textContent?.trim(),
      h3: [...(text?.querySelectorAll('h3') ?? [])].map(h => h.textContent.trim()),
      words: (text?.textContent ?? '').trim().split(/\s+/).length,
      seriesLinks: [...(text?.querySelectorAll('a') ?? [])]
        .map(a => a.getAttribute('href'))
        .filter(h => h?.startsWith('/brand/lego/')),
      facts: [...document.querySelectorAll('.bfc__row')].length,
      cats: [...document.querySelectorAll('.bct__cat')].map(a => a.getAttribute('href')),
      bullet: (() => {
        const li = text?.querySelector('li')
        return li ? getComputedStyle(li, '::before').maskImage !== 'none' : false
      })(),
    }
  })

  console.log('\n9) текст о бренде')
  check(/Конструкторы LEGO в Алматы/.test(about.h2 ?? ''), `H2 текста: «${about.h2}»`)
  check(about.h3.length >= 5, `подзаголовки под запросы (${about.h3.length}): ${about.h3.slice(0, 3).join(' / ')}`)
  check(about.words > 700, `объём текста: ${about.words} слов`)
  check(about.seriesLinks.length >= 4, `ссылки на страницы серий внутри текста (${about.seriesLinks.length})`)
  check(about.bullet, 'вместо маркера — галочка')
  check(about.facts >= 3, `в справке ${about.facts} строк`)

  /*
   * Блок «Частые вопросы» должен быть ВИДИМЫМ и совпадать с разметкой
   * FAQPage. Раньше разметка отдавала три вопроса, которых на странице не
   * было вовсе, — Google такие блоки игнорирует.
   */
  const faq = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('.blf__q')].map(q => q.textContent.trim())
    const node = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(n => JSON.parse(n.textContent))
      .find(d => d['@type'] === 'FAQPage')
    return {
      visible,
      marked: node ? node.mainEntity.map(q => q.name) : [],
      answered: node ? node.mainEntity.every(q => (q.acceptedAnswer?.text ?? '').length > 40) : false,
    }
  })
  check(faq.visible.length >= 5, `вопросов на странице: ${faq.visible.length}`)
  check(
    JSON.stringify(faq.marked) === JSON.stringify(faq.visible),
    'разметка FAQPage повторяет видимые вопросы, а не свои',
  )
  check(faq.answered, 'у каждого вопроса в разметке есть развёрнутый ответ')
  check((about.cats ?? []).length > 0, `плитки категорий: ${about.cats?.join(', ')}`)

  // Заявка уходит в WhatsApp с номером набора.
  await page.fill('.blq__input', '60380')
  await page.waitForTimeout(400)
  const request = await page.evaluate(() => {
    const link = document.querySelector('.blq__cta')
    return { href: link?.getAttribute('href') ?? '', target: link?.getAttribute('target') }
  })
  console.log('\n10) заявка на набор')
  check(request.href.startsWith('https://wa.me/'), `ведёт в WhatsApp магазина (${request.href.slice(0, 32)}…)`)
  check(decodeURIComponent(request.href).includes('60380'), 'номер набора подставлен в сообщение')

  // «Наверх».
  const before = await page.evaluate(() => !!document.querySelector('.bct__top'))
  await page.evaluate(() => window.scrollTo(0, 1200))
  await page.waitForTimeout(800)
  const after = await page.evaluate(() => !!document.querySelector('.bct__top'))
  console.log('\n11) кнопка «Наверх»')
  check(!before || after, 'появляется при прокрутке')
  check(after, 'видна на середине страницы')

  await ctx.close()
}

// ---------- 12. Телефон ----------
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
    return {
      h1: css('.blh__h1', 'fontSize'),
      shotBand: css('.blh__shot-band', 'display'),
      stageHidden: css('.blh__stage-wrap', 'display') === 'none',
      statsHidden: css('.blh__stats', 'display') === 'none',
      bento: css('.blc__bento', 'gridTemplateColumns').split(' ').length,
      grid: css('.blp__grid', 'gridTemplateColumns').split(' ').length,
      subnav: css('.blsn', 'position'),
      subnavHidden: css('.blsn', 'visibility'),
    }
  })

  console.log('\n12) телефон')
  check(mob.h1 === '30px', `заголовок 30px (${mob.h1})`)
  check(mob.shotBand !== 'none' && mob.stageHidden, 'витрина карточкой сверху, круг спрятан')
  check(mob.statsHidden, 'цифры шапки спрятаны')
  check(mob.bento === 2, `мозаика в две колонки (${mob.bento})`)
  check(mob.grid === 2, `сетка товаров в две колонки (${mob.grid})`)
  check(mob.subnav === 'fixed', `меню разделов плавающее, как в каталоге (${mob.subnav})`)
  check(mob.subnavHidden === 'hidden', 'у верха страницы капсула спрятана')

  /*
   * Капсула тёмная: под ней почти вся страница белая, и светлое стекло на
   * белом не читалось. Признак — светлый текст кнопок.
   */
  const capsuleInk = await page.evaluate(() => {
    const pill = document.querySelector('.blsn__pill')
    if (!pill)
      return 0
    const [r, g, b] = getComputedStyle(pill).color.match(/\d+/g).map(Number)
    return Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / 2.55) / 100
  })
  check(capsuleInk > 0.6, `кнопки капсулы светлые на тёмном (яркость ${capsuleInk})`)

  await ctx.close()
}

// ---------- 13. Обычный бренд ----------
{
  const { ctx, page } = await open(DESKTOP)
  await page.goto(`${BASE}/brand/zuru`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(3500)
  const plain = await page.evaluate(() => ({
    landing: !!document.querySelector('.blh'),
    bands: !!document.querySelector('.blc, .bla, .blq'),
    sidebar: !!document.querySelector('aside'),
    headerSpacer: !!document.querySelector('.sh-spacer'),
  }))

  console.log('\n13) бренд без флага собственной страницы')
  check(!plain.landing, 'лендинга нет')
  check(!plain.bands, 'полос лендинга нет')
  check(plain.sidebar, 'обычный шаблон с фильтрами на месте')
  check(plain.headerSpacer, 'у обычного бренда шапка осталась липкой')
  await ctx.close()
}

await browser.close()
console.log(fails.length === 0 ? '\nЗЕЛЁНЫЙ: лендинг бренда по макету v2' : `\nКРАСНЫЙ: ${fails.length} провал(ов)`)
process.exit(fails.length === 0 ? 0 : 1)

/*
 * Плашка «цена и корзина» в карточке товара — components/product/CartControl.vue,
 * по макету Claude Design CartControl.dc.html (25 ноября 2026).
 *
 * Что проверяется:
 *  1. Пустая: шар 44×44 справа, в 4px от края; цена 17px/800 в одну строку;
 *     у товара со скидкой старая цена 13px зачёркнутая; «N шт» и «+»
 *     спрятаны, «+» не нажать. Ни одна цена на странице не подходит к шару
 *     ближе 3px — на 360px пятизначные цены по макету уходили под шар. Это же
 *     на 375, 384 и 412px — ширины ходовых телефонов между проверяемыми.
 *  2. «В корзину» — шар КАТИТСЯ влево (промежуточные положения, а не прыжок)
 *     и поворачивается на угол по пройденному пути; встаёт слева 38×38; след
 *     на всю ширину; «1 шт»; справа «+»; рамка карточки синяя.
 *  3. Второй клик туда же, пока шар катится, ничего не меняет: двойной клик —
 *     одна штука. До 25.11.2026 так клались две.
 *  4. «+» — «2 шт», и число подпрыгивает (в макете прыжок не срабатывал).
 *  5. «−» дважды — всё катится обратно, шар снова button.pc-add.
 *  6. Клавиатура: Enter по «В корзину» — фокус на «+», второй Enter — 2 шт.
 *     До 25.11.2026 фокус пропадал вместе с кнопкой.
 *  7. prefers-reduced-motion: шар встаёт на место сразу, без качения.
 *  8. Серверная разметка: цена есть, кнопок в плашке нет (шар — span), и до
 *     гидрации плашка та же, что после: место, размер и вид каждой части.
 *
 * Стенд — сборка на локальной базе:
 *   pnpm build && PORT=3141 NUXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
 *     NUXT_PUBLIC_SUPABASE_KEY=<anon из supabase status> node .output/server/index.mjs
 *   node check-cart-control.mjs --base=http://localhost:3141 [--frames=<папка>]
 * Можно и превью (--base=https://dev.uhti.kz): страж кладёт товар в корзину,
 * но запись гостевой корзины в базу, GA4 и картинки Supabase он не пускает
 * (open() ниже). Читается одна строка товара — её берёт корзина.
 * --frames — раскадровка качения на 390px при скорости 1/10: посмотреть глазами.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const BASE = arg('base') || 'http://localhost:3141'
const FRAMES = arg('frames')
// Скидочные товары: в плашке видна и старая цена
const PAGE = '/catalog/promotions'

const VIEWS = [
  { id: '360px', width: 360, height: 780, dpr: 3, phone: true },
  { id: '390px', width: 390, height: 844, dpr: 3, phone: true },
  { id: '1440px', width: 1440, height: 900, dpr: 1, phone: false },
]

const fails = []
function check(ok, text) {
  console.log(`${ok ? '  ok  ' : ' ПРОВАЛ '} ${text}`)
  if (!ok)
    fails.push(text)
}
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

/** Угол поворота, как в CartControl.vue: целые полуобороты по пути шара, не меньше одного */
function rollAngle(width) {
  const dist = Math.max(0, width - 52)
  return -Math.max(180, Math.round(dist / (Math.PI * 41) * 2) * 180)
}

/** Снимок плашки (в странице): где шар, что видно */
function snap(root) {
  // Правый край самого текста, а не растянутого по ширине span
  const textRight = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().right
  }
  const cs = el => getComputedStyle(el)
  const r = root.getBoundingClientRect()
  const rel = el => el.getBoundingClientRect()
  const ball = root.querySelector('.cc-ball')
  const price = root.querySelector('.cc-price')
  const now = root.querySelector('.cc-price__now')
  const old = root.querySelector('.cc-price__old')
  const label = root.querySelector('.cc-label')
  const plus = root.querySelector('.cc-plus')
  const trail = root.querySelector('.cc-trail')
  return {
    w: r.width,
    h: r.height,
    ball: {
      x: rel(ball).left - r.left,
      right: r.right - rel(ball).right,
      top: rel(ball).top - r.top,
      w: rel(ball).width,
      h: rel(ball).height,
      pcAdd: ball.matches('button.pc-add'),
      label: ball.getAttribute('aria-label'),
    },
    price: { opacity: +cs(price).opacity },
    now: {
      font: `${cs(now).fontSize}/${cs(now).fontWeight}`,
      h: rel(now).height,
      right: textRight(now) - r.left,
      text: now.textContent.trim(),
    },
    old: old && { font: `${cs(old).fontSize}/${cs(old).fontWeight}`, line: cs(old).textDecorationLine },
    label: label && { opacity: +cs(label).opacity, text: label.textContent.trim() },
    plus: plus && { opacity: +cs(plus).opacity, pe: cs(plus).pointerEvents, inert: plus.inert, x: rel(plus).left - r.left },
    trail: trail && { opacity: +cs(trail).opacity },
    active: root.closest('.pc-card')?.classList.contains('pc-card--active') ?? null,
  }
}

/**
 * В странице: ждёт, пока плашка перейдёт в состояние `want` (в корзине или нет),
 * и пишет кадры `ms` миллисекунд — положение шара и следа, накопленный поворот
 * «+». Заодно время кликов по плашке относительно переключения.
 * Взводится ДО нажатия, результат — window.__ccRoll: «−» переключает плашку
 * сразу, и наблюдатель, поставленный вместе с нажатием, не успевал.
 */
function armRoll(root, [want, ms]) {
  window.__ccRoll = new Promise((resolve) => {
    const ball = root.querySelector('.cc-ball')
    const spin = root.querySelector('.cc-spin')
    const trail = root.querySelector('.cc-trail')
    const clicks = []
    root.addEventListener('click', () => clicks.push(performance.now()), true)
    const out = []
    let t0 = 0
    let turned = 0
    let last = null
    function frame() {
      const r = root.getBoundingClientRect()
      const m = new DOMMatrix(getComputedStyle(spin).transform)
      const a = Math.atan2(m.b, m.a) * 180 / Math.PI
      if (last !== null) {
        let d = a - last
        if (d > 180)
          d -= 360
        if (d < -180)
          d += 360
        turned += d
      }
      last = a
      out.push({
        t: Math.round(performance.now() - t0),
        x: +(ball.getBoundingClientRect().left - r.left).toFixed(1),
        w: +ball.getBoundingClientRect().width.toFixed(1),
        trail: +(trail.getBoundingClientRect().left - r.left).toFixed(1),
        turned: Math.round(turned),
      })
      if (performance.now() - t0 < ms)
        requestAnimationFrame(frame)
      else
        resolve({ out, clicks: clicks.map(c => Math.round(c - t0)) })
    }
    const mo = new MutationObserver(() => {
      if (root.classList.contains('cc--on') === want) {
        mo.disconnect()
        t0 = performance.now()
        frame()
      }
    })
    mo.observe(root, { attributes: true, attributeFilter: ['class'] })
  })
}

/** В странице: наибольший масштаб «N шт» за `ms` миллисекунд; результат — window.__ccBump */
function armBump(root, ms) {
  window.__ccBump = new Promise((resolve) => {
    const num = root.querySelector('.cc-num')
    const t0 = performance.now()
    let top = 1
    ;(function frame() {
      top = Math.max(top, new DOMMatrix(getComputedStyle(num).transform).a)
      if (performance.now() - t0 < ms)
        requestAnimationFrame(frame)
      else
        resolve(+top.toFixed(3))
    })()
  })
}

/** В странице: зазор от конца каждой цены до шара на всех пустых плашках, меньший — первым */
function priceGaps() {
  return [...document.querySelectorAll('.cc:has(button.pc-add)')].flatMap((root) => {
    const ball = root.querySelector('.cc-ball').getBoundingClientRect().left
    return [...root.querySelectorAll('.cc-price__now, .cc-price__old')].map((el) => {
      const range = document.createRange()
      range.selectNodeContents(el)
      return { text: el.textContent.trim(), gap: ball - range.getBoundingClientRect().right, font: getComputedStyle(el).fontSize }
    })
  }).sort((a, b) => a.gap - b.gap)
}

async function center(locator) {
  const b = await locator.boundingBox()
  return [b.x + b.width / 2, b.y + b.height / 2]
}

/** Первая плашка товара со скидкой, которого нет в корзине, — на виду */
async function openCard(page) {
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('button.pc-add', { timeout: 60000 })
  // Плашка помечается: локатор с :has(button.pc-add) после нажатия сам
  // перескочил бы на соседнюю карточку — у этой шар уже не pc-add.
  await page.locator('.cc:has(button.pc-add):has(.cc-price__old)').first().evaluate(el => el.setAttribute('data-cc-guard', ''))
  const root = page.locator('.cc[data-cc-guard]')
  await root.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  return { root, handle: await root.elementHandle() }
}

const browser = await chromium.launch()

/**
 * Контекст браузера, из которого наружу не уходит лишнее. На превью
 * (dev.uhti.kz) база боевая: гостевая корзина — это запись в неё
 * (save_guest_cart), «add_to_cart» ушёл бы в GA4, а картинки товаров — трафик
 * Supabase. Плашке ничего из этого не нужно.
 */
async function open(options) {
  const ctx = await browser.newContext(options)
  await ctx.route(/\/rest\/v1\/rpc\/save_guest_cart|googletagmanager\.com|google-analytics\.com|\/storage\/v1\//, route => route.abort())
  return ctx
}

for (const v of VIEWS) {
  console.log(`\n— ${v.id}, DPR ${v.dpr}`)
  const ctx = await open({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: v.dpr,
    isMobile: v.phone,
    hasTouch: v.phone,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const press = v.phone ? (x, y) => page.touchscreen.tap(x, y) : (x, y) => page.mouse.click(x, y)
  const { root, handle } = await openCard(page)

  // 1. Пустая
  const off = await root.evaluate(snap)
  check(off.h === 52 && near(off.ball.w, 44) && near(off.ball.h, 44) && near(off.ball.right, 4) && near(off.ball.top, 4), `пустая: плашка ${off.h}px, шар ${off.ball.w}×${off.ball.h} в ${off.ball.right}px от края и ${off.ball.top}px сверху (макет: 52, 44×44, 4 и 4)`)
  check(off.now.font === '17px/800' && off.old?.font === '13px/500' && off.old?.line === 'line-through', `цена ${off.now.font}, старая ${off.old?.font} ${off.old?.line}`)
  check(off.now.h < 25, `цена «${off.now.text}» в одну строку (${off.now.h.toFixed(1)}px)`)
  const fit = await page.evaluate(priceGaps)
  check(fit.length > 0 && fit[0].gap >= 3, `цены на странице (${fit.length}) не подходят к шару ближе 3px: меньший зазор ${fit[0]?.gap.toFixed(1)}px у «${fit[0]?.text}» (${fit[0]?.font})`)
  check(off.label.opacity === 0 && off.plus.opacity === 0 && off.plus.pe === 'none' && off.plus.inert, `«N шт» и «+» спрятаны, «+» не нажать`)
  check(off.ball.pcAdd && off.ball.label === 'В корзину', `шар — button.pc-add «${off.ball.label}»`)

  // 2–3. Кладём — и второй клик туда же, пока шар катится
  const [cx, cy] = await center(root.locator('.cc-ball'))
  await root.evaluate(armRoll, [true, 1100])
  await press(cx, cy)
  await page.waitForFunction(el => el.classList.contains('cc--on'), handle, { timeout: 20000 })
  await press(cx, cy)
  const roll = await page.evaluate(() => window.__ccRoll)
  const first = roll.out[0]
  const last = roll.out.at(-1)
  const between = new Set(roll.out.map(s => s.x).filter(x => x < first.x - 2 && x > last.x + 2)).size
  check(near(first.x, off.ball.x, 2) && near(last.x, 7) && near(last.w, 38, 0.5), `шар уехал влево: ${first.x} → ${last.x}px, ${last.w}px (макет: 7 и 38)`)
  check(between >= 5, `катится, а не прыгает: промежуточных положений ${between}`)
  const angle = rollAngle(off.w)
  check(Math.abs(last.turned - angle) <= 20, `«+» повернулся на ${last.turned}° (путь по плашке ${off.w}px — ${angle}°)`)
  check(near(last.trail, 0), `след на всю ширину (левый край ${last.trail})`)
  const second = roll.clicks.filter(t => t >= 0)
  const on1 = await root.evaluate(snap)
  check(second.length === 1 && second[0] < 450 && on1.label.text === '1 шт', `второй клик через ${second[0]} мс после включения — «${on1.label.text}» (двойной клик — одна штука)`)
  check(on1.label.opacity === 1 && on1.plus.opacity === 1 && on1.plus.pe === 'auto' && !on1.plus.inert && near(on1.plus.x, on1.w - 45), `«1 шт» видно, справа «+» (с ${on1.plus.x.toFixed(1)}px)`)
  check(on1.price.opacity === 0 && on1.active === true && !on1.ball.pcAdd && on1.ball.label === 'Уменьшить количество', `цена спрятана, рамка карточки синяя, шар — «${on1.ball.label}»`)

  // 4. «+»
  await root.evaluate(armBump, 500)
  await press(...await center(root.locator('.cc-plus')))
  const bump = await page.evaluate(() => window.__ccBump)
  const on2 = await root.evaluate(snap)
  check(on2.label.text === '2 шт' && bump >= 1.1, `«+» — «${on2.label.text}», число подпрыгнуло до ×${bump} (макет: 1,18)`)

  // 5. «−» дважды — обратно
  const minus = await center(root.locator('.cc-ball'))
  await press(...minus)
  await page.waitForTimeout(350)
  await root.evaluate(armRoll, [false, 1100])
  await press(...minus)
  const back = await page.evaluate(() => window.__ccRoll)
  const off2 = await root.evaluate(snap)
  const b0 = back.out[0]
  const b1 = back.out.at(-1)
  const backBetween = new Set(back.out.map(s => s.x).filter(x => x > b0.x + 2 && x < b1.x - 2)).size
  check(off2.ball.pcAdd && near(off2.ball.right, 4) && near(off2.ball.w, 44) && backBetween >= 5, `«−» дважды — шар укатился обратно (${b0.x} → ${b1.x}px, промежуточных ${backBetween}) и снова button.pc-add`)
  check(Math.abs(b1.turned + angle) <= 20, `и повернулся обратно на ${b1.turned}°`)
  check(off2.price.opacity === 1 && off2.trail.opacity === 0 && off2.label.opacity === 0 && off2.active === false, 'цена снова видна, следа и «N шт» нет, рамка обычная')

  // 6. Клавиатура
  if (!v.phone) {
    await root.locator('.cc-ball').focus()
    await page.keyboard.press('Enter')
    await page.waitForFunction(el => el.classList.contains('cc--on'), handle, { timeout: 20000 })
    await page.waitForTimeout(300)
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    const k = await root.evaluate(snap)
    check(focused === 'Увеличить количество' && k.label.text === '2 шт', `клавиатура: после Enter фокус на «${focused}», второй Enter — «${k.label.text}»`)
  }

  check(errors.length === 0, `ошибок на странице нет${errors.length ? `: ${errors.join(' | ')}` : ''}`)
  await ctx.close()
}

// 1 — на промежуточных ширинах телефонов: только цены у шара
for (const width of [375, 384, 412]) {
  const ctx = await open({ viewport: { width, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('button.pc-add', { timeout: 60000 })
  const fit = await page.evaluate(priceGaps)
  console.log(`\n— ${width}px, DPR 3`)
  check(fit.length > 0 && fit[0].gap >= 3, `цены на странице (${fit.length}) не подходят к шару ближе 3px: меньший зазор ${fit[0]?.gap.toFixed(1)}px у «${fit[0]?.text}» (${fit[0]?.font})`)
  await ctx.close()
}

// 7. prefers-reduced-motion
{
  console.log('\n— prefers-reduced-motion, 1440px')
  const ctx = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const { root } = await openCard(page)
  await root.evaluate(armRoll, [true, 200])
  await page.mouse.click(...await center(root.locator('.cc-ball')))
  const roll = await page.evaluate(() => window.__ccRoll)
  check(near(roll.out[0].x, 7) && near(roll.out[0].trail, 0), `шар сразу слева (${roll.out[0].x}px в первом кадре), след сразу на всю ширину`)
  await ctx.close()
}

// 8. Серверная разметка и подмена при гидрации
{
  console.log('\n— серверная разметка, 390px')
  const html = await (await fetch(`${BASE}${PAGE}`)).text()
  const prices = (html.match(/class="cc-price__now/g) || []).length
  const spans = (html.match(/<span[^>]*class="cc-ball"/g) || []).length
  const buttons = (html.match(/<button[^>]*class="[^"]*cc-ball/g) || []).length
  check(prices > 0 && spans === prices && buttons === 0, `цен в плашках ${prices}, шаров-span ${spans}, кнопок ${buttons}`)

  // Плашка до гидрации (серверная, шар — span) и после (живая): положение,
  // размер и вид каждой видимой части. Попиксельно не сравнивается: края букв
  // старой цены рисуются чуть по-разному при тех же символах, координатах и
  // цвете (проверено 25.11.2026 — до гидрации и после совпадает всё, кроме
  // сглаживания), а глазу это не видно.
  const look = async (js) => {
    const ctx = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, javaScriptEnabled: js })
    const page = await ctx.newPage()
    await page.goto(`${BASE}${PAGE}`, { waitUntil: 'networkidle' })
    if (js)
      await page.waitForSelector('button.pc-add', { timeout: 60000 })
    const parts = await page.locator('.cc:has(.cc-price__old)').first().evaluate((root) => {
      const r = root.getBoundingClientRect()
      const props = ['color', 'backgroundColor', 'backgroundImage', 'boxShadow', 'borderTopColor', 'opacity', 'fontSize', 'fontWeight', 'textDecorationLine']
      return Object.fromEntries(['.cc', '.cc-price', '.cc-price__old', '.cc-price__now', '.cc-ball', '.cc-bar--h', '.cc-bar--v'].map((sel) => {
        const el = sel === '.cc' ? root : root.querySelector(sel)
        const b = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        // Текст корня не сравнивается: в живой плашке есть спрятанное «1 шт»
        const text = sel === '.cc' ? '' : el.textContent.trim()
        return [sel, `${[b.left - r.left, b.top - r.top, b.width, b.height].map(v => v.toFixed(1)).join(',')} ${text} ${props.map(p => cs[p]).join(' ')}`]
      }))
    })
    await ctx.close()
    return parts
  }
  const [ssr, live] = [await look(false), await look(true)]
  const differ = Object.keys(ssr).filter(k => ssr[k] !== live[k])
  for (const k of differ)
    console.log(`        ${k}\n          до:    ${ssr[k]}\n          после: ${live[k]}`)
  check(differ.length === 0, `до гидрации и после плашка та же: место, размер и вид ${Object.keys(ssr).length} частей${differ.length ? ` — разошлись ${differ.join(', ')}` : ''}`)
}

// Раскадровка для глаз
if (FRAMES) {
  mkdirSync(FRAMES, { recursive: true })
  const ctx = await open({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const { root, handle } = await openCard(page)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 })
  const box = await root.boundingBox()
  const clip = { x: box.x - 14, y: box.y - 10, width: box.width + 28, height: box.height + 30 }
  const film = async (name, act, want) => {
    const shots = []
    await act()
    await page.waitForFunction(([el, on]) => el.classList.contains('cc--on') === on, [handle, want], { timeout: 20000 })
    const t0 = Date.now()
    while (shots.length < 16) {
      // Анимация идёт в 10 раз медленнее: подпись — время настоящей скорости
      const t = Math.round((Date.now() - t0) / 10)
      shots.push({ t, png: (await page.screenshot({ clip })).toString('base64') })
      await page.waitForTimeout(350)
    }
    const strip = await browser.newPage({ deviceScaleFactor: 1 })
    await strip.setContent(`<body style="margin:0;background:#e5e7eb;display:grid;grid-template-columns:repeat(2,auto);gap:6px;padding:6px">${shots.map(s => `<figure style="margin:0;font:12px sans-serif"><img style="width:${Math.round(clip.width)}px;display:block" src="data:image/png;base64,${s.png}"><figcaption>${s.t} мс</figcaption></figure>`).join('')}</body>`)
    writeFileSync(`${FRAMES}/${name}.png`, await strip.screenshot({ fullPage: true }))
    await strip.close()
  }
  const [cx, cy] = await center(root.locator('.cc-ball'))
  await film('on', () => page.touchscreen.tap(cx, cy), true)
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  await page.waitForTimeout(600)
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.1 })
  const [mx, my] = await center(root.locator('.cc-ball'))
  await film('off', () => page.touchscreen.tap(mx, my), false)
  console.log(`\nраскадровка: ${FRAMES}/on.png и ${FRAMES}/off.png`)
  await ctx.close()
}

await browser.close()
console.log(fails.length ? `\nПРОВАЛОВ: ${fails.length}` : '\nвсё ок')
process.exit(fails.length ? 1 : 0)

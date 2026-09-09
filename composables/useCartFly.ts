/**
 * «Товар летит в корзину» — макет `design_handoff_cart_fly` (Товар.dc.html).
 *
 * Миниатюра товара по дуге улетает из точки нажатия в иконку корзины, корзина
 * пружинисто пульсирует и даёт кольцо-вспышку. Смысл — на длинных страницах
 * каталога и на карточке товара кнопка «в корзину» стоит далеко от счётчика, и
 * без этого добавление проходит незаметно.
 *
 * Анимация не участвует в вёрстке: призрак живёт в `document.body` с
 * `position: fixed` и снимается по завершении. Своего состояния нет, стор не
 * читается и не пишется — полёт ничего не ждёт и ничего не задерживает.
 *
 * Тайминги, кривые и геометрия взяты из макета один в один.
 */

/**
 * Явный `data-cart-target` надёжнее подписи: `aria-label` оставлен запасным
 * путём на случай, если атрибут где-то не проставлен.
 */
const CART_TARGET_SELECTOR = '[data-cart-target],[aria-label="Корзина"]'
const GHOST_Z_INDEX = 9999
/** Один клик — один полёт, даже если обработчик стоит и на карточке, и на странице. */
const THROTTLE_MS = 200
/** Ниже этой ширины корзина живёт в нижней панели, выше — в шапке. */
const MOBILE_WIDTH = 860

interface CartTarget {
  el: HTMLElement
  rect: DOMRect
  explicit: boolean
}

let lastFlightAt = 0

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function isOnScreen(rect: DOMRect): boolean {
  return rect.width > 1 && rect.height > 1
    && rect.bottom > -4 && rect.top < window.innerHeight + 4
    && rect.right > -4 && rect.left < window.innerWidth + 4
}

/**
 * Иконок корзины на странице несколько (шапка, нижняя панель, панель каталога).
 * Берётся видимая: на узком экране самая нижняя, на широком — самая верхняя.
 */
function findCartTarget(): CartTarget | null {
  let pool: CartTarget[] = []

  document.querySelectorAll<HTMLElement>(CART_TARGET_SELECTOR).forEach((el) => {
    const rect = el.getBoundingClientRect()
    if (isOnScreen(rect))
      pool.push({ el, rect, explicit: el.hasAttribute('data-cart-target') })
  })

  if (pool.length === 0)
    return null

  const explicit = pool.filter(item => item.explicit)
  if (explicit.length > 0)
    pool = explicit

  if (pool.length > 1) {
    const isMobile = window.innerWidth < MOBILE_WIDTH
    pool.sort((a, b) => (isMobile ? b.rect.top - a.rect.top : a.rect.top - b.rect.top))
  }

  return pool[0] ?? null
}

function pulse(el: HTMLElement | null | undefined) {
  el?.animate?.(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(1.24)' },
      { transform: 'scale(.96)' },
      { transform: 'scale(1)' },
    ],
    { duration: 440, easing: 'cubic-bezier(.34,1.4,.5,1)' },
  )
}

function ring(rect: DOMRect) {
  const size = Math.max(rect.width, rect.height) + 12
  const node = document.createElement('div')

  node.style.cssText = [
    'position:fixed',
    'pointer-events:none',
    `z-index:${GHOST_Z_INDEX - 1}`,
    'border-radius:999px',
    'border:2px solid var(--primary,#2b7fff)',
    `left:${rect.left + rect.width / 2 - size / 2}px`,
    `top:${rect.top + rect.height / 2 - size / 2}px`,
    `width:${size}px`,
    `height:${size}px`,
  ].join(';')

  document.body.appendChild(node)

  const animation = node.animate?.(
    [
      { transform: 'scale(.5)', opacity: 0.85 },
      { transform: 'scale(1.55)', opacity: 0 },
    ],
    { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' },
  )

  if (!animation) {
    node.remove()
    return
  }

  animation.onfinish = () => node.remove()
}

/** Источник слегка проседает — нажатие видно на самой карточке. */
function dip(el: HTMLElement) {
  el.animate?.(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(.945)' },
      { transform: 'scale(1)' },
    ],
    { duration: 300, easing: 'cubic-bezier(.3,.8,.4,1)' },
  )
}

/**
 * Картинка для призрака.
 *
 * Сначала `currentSrc`, а не `src`: у наших картинок стоит srcset, и браузер
 * уже скачал КОНКРЕТНУЮ ступеньку. Взяв `src`, призрак попросил бы другой файл
 * и полетел бы пустым, пока тот грузится.
 */
function findImageUrl(el: HTMLElement): string {
  const img = el instanceof HTMLImageElement ? el : el.querySelector<HTMLImageElement>('img')
  const fromImg = img?.currentSrc || img?.getAttribute('src')
  if (fromImg)
    return fromImg

  const nodes = [el, ...Array.from(el.querySelectorAll<HTMLElement>('*')).slice(0, 24)]
  for (const node of nodes) {
    const match = (getComputedStyle(node).backgroundImage || '').match(/url\(["']?(.*?)["']?\)/)
    if (match?.[1])
      return match[1]
  }

  return ''
}

/**
 * @param origin   источник: картинка товара (карточка, кадр галереи)
 * @param imageUrl картинка призрака; без неё берётся из `origin`
 * @param fallback чем заменить источник, если он уехал за экран (обычно нажатая кнопка)
 */
function flyToCart(
  origin: HTMLElement | null | undefined,
  imageUrl?: string,
  fallback?: HTMLElement | null,
) {
  if (import.meta.server)
    return

  const now = Date.now()
  if (now - lastFlightAt < THROTTLE_MS)
    return
  lastFlightAt = now

  let source = origin ?? null
  if (fallback && (!source || !isOnScreen(source.getBoundingClientRect())))
    source = fallback

  const target = findCartTarget()

  if (!source || !source.animate || prefersReducedMotion()) {
    pulse(target?.el)
    return
  }

  const from = source.getBoundingClientRect()
  if (!isOnScreen(from)) {
    pulse(target?.el)
    return
  }

  // Корзины на экране нет — целимся в правый верхний угол, откуда она приедет.
  const to = target ? target.rect : new DOMRect(window.innerWidth - 74, 16, 46, 46)
  const url = imageUrl || findImageUrl(source)
  const size = Math.min(Math.max(Math.min(from.width, from.height), 62), 128)
  const fromX = from.left + from.width / 2
  const fromY = from.top + from.height / 2
  const toX = to.left + to.width / 2
  const toY = to.top + to.height / 2

  // Три вложенных узла: внешний ведёт по X, средний по Y — разные кривые дают
  // дугу; внутренний масштабирует и вращает саму плитку.
  const wrap = document.createElement('div')
  const lift = document.createElement('div')
  const tile = document.createElement('div')

  wrap.dataset.cartFly = ''
  wrap.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    `z-index:${GHOST_Z_INDEX}`,
    'pointer-events:none',
    'will-change:transform',
  ].join(';')
  lift.style.cssText = 'will-change:transform'
  tile.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    `margin:${-size / 2}px 0 0 ${-size / 2}px`,
    'border-radius:18px',
    'background:#fff center center/74% no-repeat',
    'border:1px solid rgba(255,255,255,.9)',
    'box-shadow:0 16px 36px rgba(15,23,42,.24),inset 0 1px 0 #fff',
    'will-change:transform,opacity',
  ].join(';')
  if (url)
    tile.style.backgroundImage = `url("${url}")`

  wrap.appendChild(lift)
  lift.appendChild(tile)
  document.body.appendChild(wrap)

  const distance = Math.hypot(toX - fromX, toY - fromY)
  const duration = Math.max(480, Math.min(840, 360 + distance * 0.42))
  const base = { duration, fill: 'forwards' as FillMode }

  dip(source)

  wrap.animate(
    [{ transform: `translate(${fromX}px,0)` }, { transform: `translate(${toX}px,0)` }],
    { ...base, easing: 'cubic-bezier(.22,.62,.36,1)' },
  )
  lift.animate(
    [{ transform: `translate(0,${fromY}px)` }, { transform: `translate(0,${toY}px)` }],
    { ...base, easing: 'cubic-bezier(.62,.02,.86,.42)' },
  )
  const flight = tile.animate(
    [
      { transform: 'scale(.84) rotate(-3deg)', opacity: 0, offset: 0 },
      { transform: 'scale(1.03) rotate(-1deg)', opacity: 1, offset: 0.14 },
      { transform: 'scale(.6) rotate(4deg)', opacity: 1, offset: 0.64 },
      { transform: 'scale(.16) rotate(10deg)', opacity: 0.3, offset: 1 },
    ],
    { ...base, easing: 'ease-in' },
  )

  let landed = false
  const land = () => {
    if (landed)
      return
    landed = true
    wrap.remove()
    // Цель ищется заново: страницу могли прокрутить, пока призрак летел.
    const arrival = findCartTarget() ?? target
    if (arrival) {
      pulse(arrival.el)
      ring(arrival.el.getBoundingClientRect())
    }
  }

  flight.onfinish = land
  // Страховка: анимация может не досчитать, если вкладка ушла в фон.
  setTimeout(land, duration + 260)
}

export function useCartFly() {
  return {
    flyToCart,
    pulseCart: (el?: HTMLElement | null) => pulse(el ?? findCartTarget()?.el),
  }
}

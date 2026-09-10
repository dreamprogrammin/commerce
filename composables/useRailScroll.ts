/**
 * Горизонтальная лента с кнопками и протяжкой мышью — макет
 * `Бренд LEGO.dc.html`, секции «Коллекции» и «Акции и новинки».
 *
 * Пальцем лента едет нативной прокруткой, мышью — протяжкой, стрелки листают
 * на ширину окна. Кнопки гаснут на краях.
 */
export function useRailScroll() {
  const railRef = ref<HTMLElement | null>(null)
  const atStart = ref(true)
  const atEnd = ref(true)

  function syncEdges() {
    const el = railRef.value
    if (!el)
      return
    const max = el.scrollWidth - el.clientWidth
    atStart.value = el.scrollLeft <= 6
    // Лента короче окна — обе кнопки погашены, листать нечего.
    atEnd.value = max <= 6 || el.scrollLeft >= max - 6
  }

  /**
   * Снап гасится на время своей прокрутки. При `scroll-snap-type: mandatory`
   * браузер доводит ленту до ближайшей точки после КАЖДОЙ записи в
   * `scrollLeft`, и программная прокрутка стоит на месте.
   */
  function withoutSnap(el: HTMLElement, run: () => void) {
    const previous = el.style.scrollSnapType
    el.style.scrollSnapType = 'none'
    run()
    // Возврат после доводки: раньше — и снап оборвёт плавную прокрутку.
    window.setTimeout(() => {
      el.style.scrollSnapType = previous
      syncEdges()
    }, 320)
  }

  /** Пролистнуть на долю ширины окна. `direction`: -1 назад, 1 вперёд. */
  function nudge(direction: number, share = 0.8) {
    const el = railRef.value
    if (!el)
      return
    withoutSnap(el, () => {
      el.scrollBy({
        left: direction * Math.max(220, el.clientWidth * share),
        behavior: 'smooth',
      })
    })
  }

  /**
   * Протяжка мышью. Именно `mouse*`, а не `pointer*`: как только контейнер
   * фактически сдвинулся, гестурой распоряжается браузер и прилетает
   * `pointercancel` — протяжка обрывалась на первом же шаге. Тач не трогаем,
   * там работает нативная прокрутка.
   */
  function onMouseDown(event: MouseEvent) {
    const el = railRef.value
    if (!el || event.button !== 0)
      return

    const startX = event.clientX
    const startLeft = el.scrollLeft
    const snap = el.style.scrollSnapType
    let moved = false

    el.style.scrollBehavior = 'auto'
    el.style.scrollSnapType = 'none'
    el.style.cursor = 'grabbing'

    const move = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX
      if (Math.abs(delta) > 3)
        moved = true
      el.scrollLeft = startLeft - delta
    }

    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      el.style.scrollBehavior = ''
      el.style.scrollSnapType = snap
      el.style.cursor = ''
      syncEdges()
      // После протяжки гасим клик, иначе отпускание кнопки открывает карточку,
      // над которой остановилась мышь.
      if (moved) {
        const block = (clickEvent: Event) => {
          clickEvent.preventDefault()
          clickEvent.stopPropagation()
          el.removeEventListener('click', block, true)
        }
        el.addEventListener('click', block, true)
        window.setTimeout(() => el.removeEventListener('click', block, true), 400)
      }
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  onMounted(() => {
    syncEdges()
    window.addEventListener('resize', syncEdges)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', syncEdges)
  })

  return { railRef, atStart, atEnd, syncEdges, nudge, onMouseDown }
}

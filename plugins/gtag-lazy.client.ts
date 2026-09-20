/**
 * Google Analytics поднимается по первому действию посетителя, а не сразу.
 *
 * ЗАЧЕМ. Замер главной по бою (эмуляция телефона, процессор /4) показал:
 * скрипт Analytics съедает 343 мс процессорного времени в самое дорогое
 * окно — пока страница ещё не отвечает на касания. Счётчик подключён с
 * `defer`, но `defer` откладывает только загрузку, а не исполнение.
 *
 * ПОЧЕМУ НИЧЕГО НЕ ТЕРЯЕТСЯ. В ручном режиме (`initMode: 'manual'`)
 * nuxt-gtag всё равно создаёт `window.dataLayer` и кладёт в очередь `js` и
 * `config <id>` — то есть просмотр страницы записан с самого начала. Наш
 * плагин подгружает внешний скрипт, и очередь уходит целиком. События
 * покупок (`view_item`, `add_to_cart`) тоже копятся в очереди и не пропадают.
 *
 * ЗАПАСНОЙ ПУТЬ — ВАЖНАЯ ЧАСТЬ. Если ждать ТОЛЬКО касания, из статистики
 * выпадут все, кто ушёл, ничего не нажав, а это заметная доля. Поэтому есть
 * таймер: даже неподвижный посетитель попадёт в учёт через несколько секунд
 * после загрузки — к этому времени страница уже отрисована и оживлена, и
 * счётчик никому не мешает.
 */

/** Через сколько поднять счётчик, если посетитель ничего не делает. */
const IDLE_FALLBACK_MS = 5000

const TRIGGERS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const

export default defineNuxtPlugin({
  name: 'gtag-lazy',
  parallel: true,
  setup() {
    const { initialize } = useGtag()

    let started = false
    let timer: ReturnType<typeof setTimeout> | undefined

    // `capture: true` — чтобы поймать действие даже если обработчик страницы
    // остановит всплытие; `passive: true` — чтобы не мешать прокрутке.
    const options = { passive: true, capture: true } as const

    const start = () => {
      if (started)
        return
      started = true

      for (const event of TRIGGERS)
        window.removeEventListener(event, start, options)
      if (timer)
        clearTimeout(timer)

      initialize()
    }

    for (const event of TRIGGERS)
      window.addEventListener(event, start, options)

    timer = setTimeout(start, IDLE_FALLBACK_MS)
  },
})

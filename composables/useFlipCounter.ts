import { gsap } from 'gsap'

export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  // Следим за `totalPrice`
  watch(source, (newValue, oldValue) => {
    const columns = columnsRef.value
    // Запускаем, только если колонки уже в DOM и значение действительно изменилось
    if (!columns || columns.length === 0 || newValue === oldValue)
      return

    const numDigits = columns.length
    const digits = String(Math.round(newValue)).padStart(numDigits, '0').split('')

    digits.forEach((digit, index) => {
      const column = columns[index]
      if (column) {
        const ribbon = column.children[0] as HTMLElement | undefined
        if (ribbon) {
          const digitHeight = column.clientHeight
          const targetY = -Number.parseInt(digit) * digitHeight

          gsap.to(ribbon, {
            y: targetY,
            duration: 1.2 + (index * 0.1),
            ease: 'power3.inOut',
            overwrite: true,
          })
        }
      }
    })
  }, {
    // ВАЖНО: `flush: 'post'` заставляет watch срабатывать ПОСЛЕ обновления DOM.
    flush: 'post',
  })
}

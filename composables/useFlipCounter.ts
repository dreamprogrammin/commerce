import { gsap } from 'gsap'

export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  watch(source, (newValue, oldValue) => {
    const columns = columnsRef.value

    if (!columns || columns.length === 0 || newValue === oldValue) {
      return
    }

    const numDigits = columns.length
    const oldDigits = String(Math.round(oldValue)).padStart(numDigits, '0').split('')
    const newDigits = String(Math.round(newValue)).padStart(numDigits, '0').split('')

    newDigits.forEach((digit, index) => {
      const column = columns[index]
      if (!column)
        return

      const ribbon = column.querySelector('.digit-ribbon') as HTMLElement | null
      if (!ribbon)
        return

      // Анимируем только если цифра изменилась
      if (oldDigits[index] !== digit) {
        const digitHeight = column.clientHeight
        const targetY = -Number.parseInt(digit, 10) * digitHeight

        // Основная анимация
        gsap.to(ribbon, {
          y: targetY,
          duration: 0.8 + (index * 0.08),
          ease: 'power3.out',
          overwrite: true,
        })

        // Дополнительный эффект: подсветка при изменении
        gsap.fromTo(column, { scale: 1, backgroundColor: 'transparent' }, {
          scale: 1.1,
          backgroundColor: 'rgba(var(--primary), 0.1)',
          duration: 0.3,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        })
      }
    })
  }, {
    flush: 'post',
    immediate: false,
  })
}

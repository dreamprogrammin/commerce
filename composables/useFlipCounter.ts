import { gsap } from 'gsap'

export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  let isInitialized = false

  const setDigitPositions = (value: number, animate = true) => {
    const columns = columnsRef.value

    if (!columns || columns.length === 0) {
      return
    }

    // БЕЗ padStart - берем цифры как есть
    const digits = String(Math.round(value)).split('')

    digits.forEach((digit, index) => {
      const column = columns[index]
      if (!column)
        return

      const ribbon = column.querySelector('.digit-ribbon') as HTMLElement | null
      if (!ribbon)
        return

      const digitHeight = column.clientHeight
      const targetY = -Number.parseInt(digit, 10) * digitHeight

      if (animate) {
        gsap.to(ribbon, {
          y: targetY,
          duration: 0.8 + (index * 0.08),
          ease: 'power3.out',
          overwrite: true,
        })

        gsap.fromTo(column, { scale: 1, backgroundColor: 'transparent' }, {
          scale: 1.1,
          backgroundColor: 'rgba(var(--primary), 0.1)',
          duration: 0.3,
          yoyo: true,
          repeat: 1,
          ease: 'power2.inOut',
        })
      }
      else {
        gsap.set(ribbon, { y: targetY })
      }
    })
  }

  watch(columnsRef, (columns) => {
    if (columns && columns.length > 0 && !isInitialized) {
      nextTick(() => {
        setDigitPositions(source.value, false)
        isInitialized = true
      })
    }
  }, { immediate: true })

  watch(source, (newValue, oldValue) => {
    if (!isInitialized || newValue === oldValue) {
      return
    }

    const columns = columnsRef.value
    if (!columns || columns.length === 0) {
      return
    }

    // БЕЗ padStart
    const oldDigits = String(Math.round(oldValue)).split('')
    const newDigits = String(Math.round(newValue)).split('')

    // Если изменилась длина числа (например, 999 -> 1000), перерисовываем все
    if (oldDigits.length !== newDigits.length) {
      nextTick(() => {
        setDigitPositions(newValue, true)
      })
      return
    }

    // Анимируем только измененные цифры
    newDigits.forEach((digit, index) => {
      if (oldDigits[index] !== digit) {
        const column = columns[index]
        if (!column)
          return

        const ribbon = column.querySelector('.digit-ribbon') as HTMLElement | null
        if (!ribbon)
          return

        const digitHeight = column.clientHeight
        const targetY = -Number.parseInt(digit, 10) * digitHeight

        gsap.to(ribbon, {
          y: targetY,
          duration: 0.8 + (index * 0.08),
          ease: 'power3.out',
          overwrite: true,
        })

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
  })
}

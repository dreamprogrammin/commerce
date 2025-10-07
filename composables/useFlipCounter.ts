import type { Ref } from 'vue'
import { gsap } from 'gsap'

export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  let isInitialized = false

  // Функция для установки позиции цифр
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
      if (digitHeight === 0)
        return // Элемент еще не отрендерен

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

  // Инициализация при появлении колонок в DOM
  watch(columnsRef, (columns) => {
    if (columns && columns.length > 0 && !isInitialized) {
      nextTick(() => {
        // Проверяем что колонки действительно отрендерены (имеют высоту)
        const firstColumn = columns[0]
        if (firstColumn && firstColumn.clientHeight > 0) {
          setDigitPositions(source.value, false)
          isInitialized = true
        }
      })
    }
  }, { immediate: true, flush: 'post' })

  // Следим за изменением значения
  watch(source, (newValue, oldValue) => {
    // Ждем инициализации
    if (!isInitialized) {
      return
    }

    if (newValue === oldValue) {
      return
    }

    const columns = columnsRef.value
    if (!columns || columns.length === 0) {
      return
    }

    // БЕЗ padStart
    const oldDigits = String(Math.round(oldValue)).split('')
    const newDigits = String(Math.round(newValue)).split('')

    // Если изменилась длина числа, перерисовываем все
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
        if (digitHeight === 0)
          return

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

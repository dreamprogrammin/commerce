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
        return

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
          backgroundColor: 'rgba(59, 130, 246, 0.1)', // Используем прямой цвет вместо CSS переменной
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

  // Следим за columnsRef - когда колонки появляются, инициализируем
  watch(columnsRef, (columns) => {
    if (columns && columns.length > 0 && !isInitialized) {
      // Используем requestAnimationFrame для гарантии что DOM готов
      requestAnimationFrame(() => {
        nextTick(() => {
          const firstColumn = columns[0]
          if (firstColumn && firstColumn.clientHeight > 0) {
            setDigitPositions(source.value, false)
            isInitialized = true
          }
        })
      })
    }
  }, {
    immediate: true,
    flush: 'post',
    deep: true, // Следим за изменениями внутри массива
  })

  // Следим за изменением значения
  watch(source, (newValue, oldValue) => {
    if (!isInitialized || newValue === oldValue) {
      return
    }

    // Дополнительная задержка для гарантии что DOM обновился
    nextTick(() => {
      const columns = columnsRef.value
      if (!columns || columns.length === 0) {
        return
      }

      const oldDigits = String(Math.round(oldValue)).split('')
      const newDigits = String(Math.round(newValue)).split('')

      // Если изменилась длина числа, ждем обновления DOM и перерисовываем
      if (oldDigits.length !== newDigits.length) {
        // Сбрасываем инициализацию чтобы переинициализировать с новым количеством колонок
        isInitialized = false
        requestAnimationFrame(() => {
          nextTick(() => {
            const cols = columnsRef.value
            const firstCol = cols?.[0]
            if (cols && cols.length > 0 && firstCol && firstCol.clientHeight > 0) {
              setDigitPositions(newValue, true)
              isInitialized = true
            }
          })
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
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            duration: 0.3,
            yoyo: true,
            repeat: 1,
            ease: 'power2.inOut',
          })
        }
      })
    })
  }, {
    flush: 'post',
  })
}

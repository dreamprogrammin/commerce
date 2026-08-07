import type { Ref } from 'vue'
import { gsap } from 'gsap'

/** Барабан всегда собран из десяти цифр — см. `v-for="d in 10"` в разметке. */
const ROWS_IN_RIBBON = 10

/**
 * Сдвиг барабана в процентах его собственной высоты.
 *
 * В пикселях это считать нельзя. Строка цифры равна 1.5em, и в мобильной
 * панели корзины (17px) она даёт дробные 25.5px, а `clientHeight` по
 * спецификации округляется до целого — 26. Ошибка в 0.5px копилась на каждую
 * цифру: девятка промахивалась на 4.5px, и барабан вставал между строк —
 * цифры «плыли». В сайдбаре шрифт 22px, 1.5em = 33px ровно, поэтому там баг
 * не проявлялся.
 *
 * Проценты берутся от высоты самого барабана, поэтому шаг в одну цифру —
 * всегда ровно 100/10, независимо от дробности пикселей.
 */
function ribbonOffsetPercent(digit: string): number {
  return -Number.parseInt(digit, 10) * (100 / ROWS_IN_RIBBON)
}

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

      // clientHeight здесь — только признак того, что колонка отрисована
      // (в скрытой колонке он 0), но не мера сдвига.
      if (column.clientHeight === 0)
        return

      const targetY = ribbonOffsetPercent(digit)

      if (animate) {
        gsap.to(ribbon, {
          yPercent: targetY,
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
        // y: 0 — на случай, если на барабане остался пиксельный сдвиг:
        // GSAP складывает y и yPercent, и остаток сместил бы всю ленту.
        gsap.set(ribbon, { y: 0, yPercent: targetY })
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

          if (column.clientHeight === 0)
            return

          const targetY = ribbonOffsetPercent(digit)

          gsap.to(ribbon, {
            yPercent: targetY,
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

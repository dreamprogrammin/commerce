import { gsap } from 'gsap'

export function useFlipCounter(
  // `source` - это ref или computed, за которым мы следим (наш `totalPrice`)
  source: Ref<number>,
  // `columnsRef` - это ref на массив HTML-элементов (наши "колонки" с цифрами)
  columnsRef: Ref<HTMLElement[]>,
) {
  // Функция, которая запускает анимацию
  const animate = (targetNumber: number) => {
    // Получаем DOM-элементы из ref
    const columns = columnsRef.value
    if (!columns || columns.length === 0)
      return

    // Превращаем число в массив цифр, дополняя нулями слева
    const numDigits = columns.length
    const digits = String(Math.round(targetNumber)).padStart(numDigits, '0').split('')

    // Анимируем каждую колонку
    digits.forEach((digit, index) => {
      const column = columns[index]
      if (column) {
        // Высота одной цифры (предполагаем, что она равна высоте колонки)
        const ribbon = column.children[0] as HTMLElement | undefined
        // Вычисляем, на сколько нужно сместить ленту

        // Запускаем GSAP анимацию
        if (ribbon) {
          const digitHeight = column.clientHeight
          const targetY = -Number.parseInt(digit) * digitHeight

          gsap.to(ribbon, { // <-- Анимируем `ribbon`
            y: targetY,
            duration: 1.2 + (index * 0.1),
            ease: 'power3.inOut',
            overwrite: true,
          })
        }
      }
    })
  }

  // Следим за изменением source (totalPrice) и запускаем анимацию
  watch(source, (newValue) => {
    animate(newValue)
  })

  // Возвращаем функцию animate, чтобы запустить ее при монтировании
  return { animate }
}

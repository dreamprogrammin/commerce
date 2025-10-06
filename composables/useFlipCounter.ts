import type { Ref } from 'vue'
import { gsap } from 'gsap'

/**
 * Composable для создания "флип"-анимации счетчика.
 * @param source - Реактивный источник данных (ref или computed) с числом.
 * @param columnsRef - Ref, содержащий массив HTML-элементов ("окошек" для цифр).
 */
export function useFlipCounter(
  source: Ref<number>,
  columnsRef: Ref<HTMLElement[]>,
) {
  // Watch'ер, который следит за изменением исходного числа
  watch(source, (newValue) => {
    // `nextTick` гарантирует, что мы работаем с DOM после того, как Vue его обновил.
    nextTick(() => {
      const columns = columnsRef.value
      // Выходим, если DOM-элементы еще не готовы
      if (!columns || columns.length === 0)
        return

      // Получаем количество "окошек" из DOM
      const numDigits = columns.length
      // Превращаем целевое число в строку с ведущими нулями
      const targetString = String(Math.round(newValue)).padStart(numDigits, '0')

      // Проходим по каждой "колонке" / "окошку"
      for (let i = 0; i < numDigits; i++) {
        const column = columns[i]
        if (column) {
          // Находим внутри "ленту" с цифрами
          const ribbon = column.querySelector('.digit-ribbon') as HTMLElement | null
          // Получаем символ для этой колонки
          const digit = targetString[i] // Тип `string | undefined`

          // Запускаем анимацию, только если все на месте
          if (ribbon && digit !== undefined) {
            const digitHeight = column.clientHeight

            if (digitHeight > 0) {
              // `parseInt` здесь безопасен, так как `digit` точно `string`
              const targetY = -Number.parseInt(digit, 10) * digitHeight

              // Используем GSAP для плавной анимации `transform: translateY`
              gsap.to(ribbon, {
                y: targetY,
                duration: 1.0 + (i * 0.1), // Каждая следующая цифра анимируется чуть дольше
                ease: 'power3.inOut',
                overwrite: true, // Прерывает предыдущие анимации на этом элементе
              })
            }
          }
        }
      }
    })
  }, {
    // `immediate: true` заставляет watch сработать сразу при инициализации,
    // чтобы установить начальное значение счетчика (обычно "00000").
    immediate: true,
  })
}

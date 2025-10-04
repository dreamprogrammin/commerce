import type { CountUpOptions } from 'countup.js'
import { CountUp } from 'countup.js'

export function useCountUp(
  target: Ref<HTMLElement | null>,
  endVal: Ref<number>,
  options: CountUpOptions = {},
) {
  const countUpInstance = ref<CountUp | null>(null)

  onMounted(() => {
    if (target.value) {
      const defaultOptions: CountUpOptions = {
        duration: 1.5, // Длительность анимации в секундах
        decimalPlaces: 0, // Количество знаков после запятой
        separator: ' ', // Разделитель разрядов (пробел)
        ...options, // Позволяем переопределить стандартные опции
      }
      // Создаем экземпляр CountUp
      countUpInstance.value = new CountUp(target.value, endVal.value, defaultOptions)
      if (!countUpInstance.value.error) {
        countUpInstance.value.start()
      }
      else {
        console.error(countUpInstance.value.error)
      }
    }
  })

  // Следим за изменением целевого значения
  watch(endVal, (newValue) => {
    if (countUpInstance.value) {
      // Плавно обновляем до нового значения
      countUpInstance.value.update(newValue)
    }
  })
}

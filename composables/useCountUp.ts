import type { CountUpOptions } from 'countup.js'
import { CountUp } from 'countup.js'

export function useCountUp(
  target: Ref<HTMLElement | null>,
  endVal: Ref<number>,
  options: CountUpOptions = {},
) {
  const countUpInstance = ref<CountUp | null>(null)

  // НОВАЯ ФУНКЦИЯ ИНИЦИАЛИЗАЦИИ
  const start = () => {
    if (target.value && !countUpInstance.value) {
      const defaultOptions: CountUpOptions = {
        duration: 1,
        separator: ' ',
        ...options,
      }
      const instance = new CountUp(target.value, endVal.value, defaultOptions)
      if (!instance.error) {
        instance.start()
        countUpInstance.value = instance
      }
      else {
        console.error(instance.error)
      }
    }
  }

  watch(endVal, (newValue, oldValue) => {
    // Обновляем, только если экземпляр уже создан
    if (countUpInstance.value && newValue !== oldValue) {
      countUpInstance.value.update(newValue)
    }
  })

  // Возвращаем функцию start
  return { start }
}

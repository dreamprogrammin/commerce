import { gsap } from 'gsap'

export function useAnimatedCounter(
  // `source` - это ref или computed, за которым мы следим (наш `totalPrice`)
  source: Ref<number>,
) {
  // `output` - это ref, который будет плавно анимироваться
  const output = ref(source.value)

  // Следим за изменением источника
  watch(source, (newValue) => {
    // Используем GSAP для анимации
    gsap.to(output, {
      duration: 1, // Длительность анимации в секундах
      value: newValue, // Целевое значение
      ease: 'power2.out', // Тип "сглаживания"
      onUpdate: () => {
        // Округляем значение на каждом кадре анимации
        output.value = Math.round(output.value)
      },
    })
  })

  // Возвращаем анимированный ref
  return output
}

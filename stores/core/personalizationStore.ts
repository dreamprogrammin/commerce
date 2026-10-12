export const usePersonalizationStore = defineStore('personalization', () => {
  // Часть ключа запроса «Подобрали для вас» на главной: `invalidate()` после
  // заказа меняет ключ, и лента перезапрашивается. Начальное значение —
  // постоянное, а не `Date.now()`: ключ уходит в HTML, и метка времени
  // делала каждую пересборку главной платной записью ISR
  // (check-isr-stable-html.mjs).
  const trigger = ref(0)

  function invalidate() {
    console.warn('Данные для персонализации были инвалидированы. Запускаем триггер обновления...')

    trigger.value = Date.now()
  }

  return {
    trigger,
    invalidate,
  }
})

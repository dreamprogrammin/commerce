export const usePersonalizationStore = defineStore('personalization', () => {
  const trigger = ref(Date.now())

  function invalidate() {
    console.warn('Данные для персонализации были инвалидированы. Запускаем триггер обновления...')

    trigger.value = Date.now()
  }

  return {
    trigger,
    invalidate,
  }
})

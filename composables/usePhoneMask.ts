// composables/usePhoneMask.ts
const KZ_MOBILE_CODES = ['70', '74', '75', '76', '77', '78'] as const
const PHONE_LENGTH = 11

interface PhoneMaskReturn {
  formattedValue: Readonly<Ref<string>>
  rawValue: Ref<string>
  isValid: Readonly<Ref<boolean>>
  errorMessage: Readonly<Ref<string>>
  setValue: (value: string) => void
  handleInput: (event: Event) => void
  getInternationalFormat: () => string
  getDigits: () => string
  clear: () => void
}

export function usePhoneMask(initialValue = ''): PhoneMaskReturn {
  // Храним только цифры
  const rawValue = ref(normalizeDigits(initialValue))

  /**
   * Нормализует строку в чистые цифры
   */
  function normalizeDigits(value: string): string {
    let digits = value.replace(/\D/g, '')

    // 8 -> 7
    if (digits.startsWith('8')) {
      digits = '7' + digits.substring(1)
    }

    // Добавляем 7 если нет
    if (digits && !digits.startsWith('7')) {
      digits = '7' + digits
    }

    return digits.substring(0, PHONE_LENGTH)
  }

  /**
   * Форматирует цифры в +7 (XXX) XXX-XX-XX
   */
  function formatDigits(digits: string): string {
    if (!digits) return ''

    let result = '+7'

    if (digits.length > 1) {
      result += ` (${digits.substring(1, 4)}`
    }

    if (digits.length >= 5) {
      result += `) ${digits.substring(4, 7)}`
    }

    if (digits.length >= 8) {
      result += `-${digits.substring(7, 9)}`
    }

    if (digits.length >= 10) {
      result += `-${digits.substring(9, 11)}`
    }

    return result
  }

  /**
   * Форматированное значение для отображения
   */
  const formattedValue = computed(() => formatDigits(rawValue.value))

  /**
   * Проверка валидности номера
   */
  const isValid = computed(() => {
    const digits = rawValue.value

    if (digits.length !== PHONE_LENGTH) return false
    if (!digits.startsWith('7')) return false

    const mobileCode = digits.substring(1, 3)
    return KZ_MOBILE_CODES.includes(mobileCode as typeof KZ_MOBILE_CODES[number])
  })

  /**
   * Сообщение об ошибке
   */
  const errorMessage = computed(() => {
    const digits = rawValue.value

    if (!digits) return ''

    if (digits.length < PHONE_LENGTH) {
      return 'Введите полный номер телефона'
    }

    const mobileCode = digits.substring(1, 3)
    if (!KZ_MOBILE_CODES.includes(mobileCode as typeof KZ_MOBILE_CODES[number])) {
      return 'Неверный код оператора'
    }

    return ''
  })

  /**
   * Установить значение (принимает любой формат)
   */
  function setValue(value: string): void {
    rawValue.value = normalizeDigits(value)
  }

  /**
   * Обработчик события input - для использования с @input
   */
  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement
    setValue(target.value)
  }

  /**
   * Получить номер в международном формате +77001234567
   */
  function getInternationalFormat(): string {
    return rawValue.value ? `+${rawValue.value}` : ''
  }

  /**
   * Получить только цифры 77001234567
   */
  function getDigits(): string {
    return rawValue.value
  }

  /**
   * Очистить значение
   */
  function clear(): void {
    rawValue.value = ''
  }

  return {
    // Реактивные значения (readonly для безопасности)
    formattedValue: readonly(formattedValue),
    rawValue,
    isValid: readonly(isValid),
    errorMessage: readonly(errorMessage),

    // Методы
    setValue,
    handleInput,
    getInternationalFormat,
    getDigits,
    clear,
  }
}
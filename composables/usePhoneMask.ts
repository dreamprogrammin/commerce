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
  handleFocus: (event: FocusEvent) => void
  getInternationalFormat: () => string
  getDigits: () => string
  clear: () => void
}

export function usePhoneMask(initialValue = ''): PhoneMaskReturn {
  // Храним только цифры
  const rawValue = ref(normalizeDigits(initialValue))
  const isFocused = ref(false)

  /**
   * Нормализует строку в чистые цифры
   */
  function normalizeDigits(value: string): string {
    let digits = value.replace(/\D/g, '')

    // 8 -> 7 (только если это первая цифра)
    if (digits.startsWith('8') && digits.length > 1) {
      digits = '7' + digits.substring(1)
    }

    // Добавляем 7 если начинается не с 7 или 8
    if (digits && !digits.startsWith('7') && !digits.startsWith('8')) {
      digits = '7' + digits
    }

    return digits.substring(0, PHONE_LENGTH)
  }

  /**
   * Форматирует цифры в +7 (XXX) XXX-XX-XX
   */
  function formatDigits(digits: string): string {
    if (!digits) return ''

    // Если только одна цифра 8, показываем как есть пока пользователь вводит
    if (digits === '8') return '8'

    // Нормализуем 8 -> 7 для отображения
    let normalized = digits
    if (normalized.startsWith('8') && normalized.length > 1) {
      normalized = '7' + normalized.substring(1)
    }

    let result = '+7'

    if (normalized.length > 1) {
      result += ` (${normalized.substring(1, 4)}`
    }

    if (normalized.length >= 5) {
      result += `) ${normalized.substring(4, 7)}`
    }

    if (normalized.length >= 8) {
      result += `-${normalized.substring(7, 9)}`
    }

    if (normalized.length >= 10) {
      result += `-${normalized.substring(9, 11)}`
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
    let digits = rawValue.value

    // Нормализуем для проверки
    if (digits.startsWith('8')) {
      digits = '7' + digits.substring(1)
    }

    if (digits.length !== PHONE_LENGTH) return false
    if (!digits.startsWith('7')) return false

    const mobileCode = digits.substring(1, 3)
    return KZ_MOBILE_CODES.includes(mobileCode as typeof KZ_MOBILE_CODES[number])
  })

  /**
   * Сообщение об ошибке
   */
  const errorMessage = computed(() => {
    let digits = rawValue.value

    if (!digits) return ''

    // Нормализуем для проверки
    if (digits.startsWith('8')) {
      digits = '7' + digits.substring(1)
    }

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
   * Обработчик события input
   */
  function handleInput(event: Event): void {
    const target = event.target as HTMLInputElement
    const inputValue = target.value
    const cursorPosition = target.selectionStart || 0

    // Извлекаем цифры
    let digits = inputValue.replace(/\D/g, '')

    // Специальная логика для "8": оставляем как есть если это единственная цифра
    // Это позволяет пользователю начать с 8, а затем мы заменим на 7
    if (digits.length === 1 && digits === '8') {
      rawValue.value = '8'
    } else {
      rawValue.value = normalizeDigits(inputValue)
    }

    // Форматируем для отображения
    const formatted = formatDigits(rawValue.value)
    
    // Вычисляем позицию курсора
    const digitsBeforeCursor = inputValue.substring(0, cursorPosition).replace(/\D/g, '').length
    let newCursorPosition = 0
    let digitCount = 0

    for (let i = 0; i < formatted.length; i++) {
      const char = formatted[i]
      if (char && /\d/.test(char)) {
        digitCount++
        if (digitCount >= digitsBeforeCursor) {
          newCursorPosition = i + 1
          break
        }
      }
    }

    // Обновляем input
    target.value = formatted

    // Восстанавливаем курсор
    nextTick(() => {
      target.setSelectionRange(newCursorPosition, newCursorPosition)
    })
  }

  /**
   * Обработчик фокуса
   */
  function handleFocus(event: FocusEvent): void {
    isFocused.value = true
    const target = event.target as HTMLInputElement

    // Если поле пустое, устанавливаем начальное значение
    if (!rawValue.value) {
      rawValue.value = ''
      target.value = '+7 ('
      
      nextTick(() => {
        target.setSelectionRange(4, 4)
      })
    }
  }

  /**
   * Получить номер в международном формате +77001234567
   */
  function getInternationalFormat(): string {
    let digits = rawValue.value

    // Нормализуем 8 -> 7
    if (digits.startsWith('8')) {
      digits = '7' + digits.substring(1)
    }

    return digits ? `+${digits}` : ''
  }

  /**
   * Получить только цифры 77001234567
   */
  function getDigits(): string {
    let digits = rawValue.value

    // Нормализуем 8 -> 7
    if (digits.startsWith('8')) {
      digits = '7' + digits.substring(1)
    }

    return digits
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
    handleFocus,
    getInternationalFormat,
    getDigits,
    clear,
  }
}
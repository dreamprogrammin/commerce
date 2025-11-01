import type { Ref } from 'vue'

/**
 * Опции для Intersection Observer
 */
export interface ProgressiveImageOptions {
  rootMargin?: string // Отступ для срабатывания (по умолчанию '50px')
  threshold?: number // Порог видимости (0.01 = 1%)
}

/**
 * 🖼️ Композебл для прогрессивной загрузки изображений
 *
 * Особенности:
 * - Lazy loading через Intersection Observer
 * - Shimmer плейсхолдер во время загрузки
 * - Обработка ошибок загрузки
 * - Автоматический retry при сбое
 * - Поддержка кеша браузера
 *
 * @param imageUrl - реактивная ссылка на URL изображения
 * @param options - опции (rootMargin, threshold)
 * @returns объект с состоянием и методами
 *
 * @example
 * const imageUrl = toRef(props, 'src')
 * const { imageRef, isLoaded, isError, shouldLoad, onLoad, onError } = useProgressiveImage(imageUrl)
 */
export function useProgressiveImage(
  imageUrl: Ref<string | null | undefined>,
  options: ProgressiveImageOptions = {},
) {
  const {
    rootMargin = '50px',
    threshold = 0.01,
  } = options

  // --- СОСТОЯНИЕ ---
  const imageRef = ref<HTMLImageElement>()
  const isVisible = ref(false) // Видимо ли изображение в viewport
  const isLoaded = ref(false) // Загруженное ли изображение
  const isError = ref(false) // Произошла ли ошибка при загрузке
  const shouldLoad = ref(false) // Нужно ли начинать загрузку
  const retryCount = ref(0) // Количество попыток retry
  const maxRetries = 3 // Максимальное количество попыток

  let observer: IntersectionObserver | null = null

  /**
   * Обработчик успешной загрузки изображения
   */
  function onLoad() {
    isLoaded.value = true
    isError.value = false
    retryCount.value = 0
  }

  /**
   * Обработчик ошибки загрузки изображения
   */
  function onError() {
    isError.value = true

    // Пытаемся повторить загрузку несколько раз
    if (retryCount.value < maxRetries) {
      retryCount.value++
      console.warn(
        `❌ Ошибка загрузки изображения (попытка ${retryCount.value}/${maxRetries}):`,
        imageUrl.value,
      )

      // Добавляем небольшую задержку перед retry
      setTimeout(() => {
        if (imageRef.value) {
          // Триггерим переzагрузку добавив timestamp
          const separator = imageUrl.value?.includes('?') ? '&' : '?'
          imageRef.value.src = `${imageUrl.value}${separator}retry=${retryCount.value}`
        }
      }, 500 * retryCount.value) // Экспоненциальная задержка
    }
    else {
      console.error('🔴 Не удалось загрузить изображение после всех попыток:', imageUrl.value)
    }
  }

  /**
   * Инициализация Intersection Observer
   * Запускает загрузку когда изображение попадает в viewport + rootMargin
   */
  function initializeObserver() {
    if (!imageRef.value)
      return

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Элемент стал видимым
            isVisible.value = true
            shouldLoad.value = true

            // Отключаем observer после первого срабатывания
            if (observer) {
              observer.disconnect()
              observer = null
            }

            console.warn('👁️ Изображение видимо, начинаем загрузку:', imageUrl.value)
          }
        })
      },
      {
        rootMargin,
        threshold,
      },
    )

    observer.observe(imageRef.value)
  }

  /**
   * Очистка: отключаем observer при размонтировании
   */
  function cleanup() {
    if (observer) {
      observer.disconnect()
      observer = null
    }

    if (imageRef.value) {
      imageRef.value = undefined
    }
  }

  /**
   * Сброс состояния
   * Используется когда URL меняется
   */
  function resetState() {
    isLoaded.value = false
    isError.value = false
    retryCount.value = 0
    shouldLoad.value = false
  }

  // --- ЖИЗНЕННЫЙ ЦИКЛ ---

  /**
   * При монтировании: инициализируем observer
   */
  onMounted(() => {
    nextTick(() => {
      initializeObserver()
    })
  })

  /**
   * При размонтировании: очищаем ресурсы
   */
  onBeforeUnmount(() => {
    cleanup()
  })

  /**
   * Когда URL меняется: сбрасываем состояние и перезапускаем observer
   */
  watch(
    imageUrl,
    (newUrl, oldUrl) => {
      // Если URL не изменился - выходим
      if (newUrl === oldUrl)
        return

      console.warn('🔄 URL изображения изменился:', { oldUrl, newUrl })

      // Сбрасываем состояние
      resetState()

      // Если уже был observer - очищаем его
      if (observer) {
        observer.disconnect()
        observer = null
      }

      // Переинициализируем observer для нового URL
      nextTick(() => {
        if (imageRef.value) {
          initializeObserver()
        }
      })
    },
  )

  /**
   * Если URL меняется но shouldLoad уже true (например при быстром переключении),
   * не перезагружаем - используем закешированное значение
   */
  watch(
    [imageUrl, shouldLoad],
    ([newUrl, shouldLoadValue]) => {
      if (shouldLoadValue && newUrl) {
        // Обновляем src только если нужно загружать
        if (imageRef.value && imageRef.value.src !== newUrl) {
          imageRef.value.src = newUrl
        }
      }
    },
  )

  // --- ЭКСПОРТ ---
  return {
    // Refs
    imageRef,
    isVisible,
    isLoaded,
    isError,
    shouldLoad,
    retryCount,

    // Methods
    onLoad,
    onError,
    resetState,
    cleanup,
  }
}

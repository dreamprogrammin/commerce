import type { Ref } from 'vue'

/**
 * Опции для Intersection Observer
 */
export interface ProgressiveImageOptions {
  rootMargin?: string // Отступ для срабатывания (по умолчанию '50px')
  threshold?: number // Порог видимости (0.01 = 1%)
  eager?: boolean // 🎯 Загружать сразу без lazy loading (для видимых элементов)
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
 * - 🛡️ Отмена предыдущих запросов при смене URL
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
    eager = false, // 🎯 По умолчанию lazy loading
  } = options

  // --- СОСТОЯНИЕ ---
  const imageRef = ref<HTMLImageElement>()
  const isVisible = ref(false) // Видимо ли изображение в viewport
  const isLoaded = ref(false) // Загруженное ли изображение
  const isError = ref(false) // Произошла ли ошибка при загрузке
  const shouldLoad = ref(eager) // 🎯 Если eager=true, загружаем сразу
  const retryCount = ref(0) // Количество попыток retry
  const maxRetries = 3 // Максимальное количество попыток

  // 🛡️ AbortController для отмены предыдущего запроса
  let abortController: AbortController | null = null

  let observer: IntersectionObserver | null = null

  /**
   * Обработчик успешной загрузки изображения
   */
  function onLoad() {
    isLoaded.value = true
    isError.value = false
    retryCount.value = 0

    // 🛡️ Отменяем AbortController после успешной загрузки
    abortController = null
  }

  /**
   * Обработчик ошибки загрузки изображения
   */
  function onError() {
    isError.value = true

    // 🛡️ Если это отмена (AbortError) - игнорируем, это нормально
    if (abortController?.signal.aborted) {
      console.log('⏹️ Загрузка отменена (переключили изображение)')
      return
    }

    // Пытаемся повторить загрузку несколько раз
    if (retryCount.value < maxRetries) {
      retryCount.value++
      console.warn(
        `⚠️ Ошибка загрузки (попытка ${retryCount.value}/${maxRetries}), пытаемся еще раз...`,
        imageUrl.value,
      )

      // Добавляем задержку перед retry
      setTimeout(() => {
        if (imageRef.value && imageUrl.value) {
          // 🛡️ Просто переустанавливаем src (без параметров)
          // Это заставит браузер перезагрузить изображение
          imageRef.value.src = imageUrl.value
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

            console.log('👁️ Изображение видимо, начинаем загрузку:', imageUrl.value)
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

    // 🛡️ Отменяем текущий запрос при размонтировании
    if (abortController) {
      abortController.abort()
      abortController = null
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

    // 🛡️ ВАЖНО: Отменяем предыдущий запрос при смене URL
    if (abortController) {
      console.log('🛡️ Отменяем предыдущий запрос (смена URL)')
      abortController.abort()
      abortController = null
    }
  }

  // --- ЖИЗНЕННЫЙ ЦИКЛ ---

  /**
   * При монтировании: инициализируем observer (если не eager)
   */
  onMounted(() => {
    nextTick(() => {
      // 🎯 Если eager=true, не используем observer, просто загружаем сразу
      if (eager) {
        shouldLoad.value = true
        console.log('⚡ Eager loading: загружаем сразу без observer')
      }
      else {
        // Обычный lazy loading
        initializeObserver()
      }
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

      console.log('🔄 URL изображения изменился:', { oldUrl, newUrl })

      // 🛡️ Сбрасываем состояние и отменяем предыдущий запрос
      resetState()

      // Если уже был observer - очищаем его
      if (observer) {
        observer.disconnect()
        observer = null
      }

      // 🎯 Если eager=true, загружаем сразу без observer
      if (eager) {
        shouldLoad.value = true
        console.log('⚡ Eager loading: загружаем сразу при смене URL')
      }
      else {
        // Переинициализируем observer для нового URL
        nextTick(() => {
          if (imageRef.value) {
            initializeObserver()
          }
        })
      }
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
          // 🛡️ Создаем новый AbortController для отслеживания этого запроса
          abortController = new AbortController()

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

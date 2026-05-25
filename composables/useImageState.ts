import type { Ref } from 'vue'

export interface ProgressiveImageOptions {
  rootMargin?: string
  threshold?: number
  eager?: boolean
}

/**
 * 🖼️ Композебл для прогрессивной загрузки изображений
 *
 * ИСПРАВЛЕНО:
 * ✅ НЕ устанавливаем src напрямую — браузер сам выбирает из srcset
 * ✅ debouncedReady для задержки показа при быстром переключении (карусель)
 * ✅ Lazy loading через Intersection Observer
 * ✅ Браузерное кеширование
 */
export function useImageState(
  imageUrl: Ref<string | null | undefined>,
  options: ProgressiveImageOptions = {},
) {
  const {
    rootMargin = '200px',
    threshold = 0.01,
    eager = false,
  } = options

  // --- СОСТОЯНИЕ ---
  const imageRef = ref<HTMLImageElement>()
  const isVisible = ref(false)
  const isLoaded = ref(false)
  const isError = ref(false)
  const shouldLoad = ref(eager)

  /**
   * debouncedReady — становится true с задержкой 150ms после смены URL.
   * Используется в шаблоне для скрытия старого изображения пока новое грузится.
   * Это позволяет избежать мигания при быстром переключении (карусель).
   * НЕ управляет src напрямую — браузер сам выбирает размер из srcset.
   */
  const debouncedReady = ref(eager)

  // ⏱️ Debounce таймер
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let observer: IntersectionObserver | null = null

  /**
   * ✅ Обработчик успешной загрузки
   */
  function onLoad() {
    isLoaded.value = true
    isError.value = false
  }

  /**
   * ❌ Обработчик ошибки
   */
  function onError() {
    isError.value = true
    isLoaded.value = false
  }

  /**
   * 🔄 Обработка смены URL с debounce
   *
   * ВАЖНО: мы НЕ устанавливаем imageRef.value.src напрямую.
   * Прямая установка src переопределяет выбор браузера из srcset,
   * из-за чего всегда загружался lg вместо sm на мобилке.
   *
   * Вместо этого мы управляем только debouncedReady — флагом видимости,
   * а браузер сам выбирает нужный размер из srcset на основе sizes/экрана.
   */
  function handleUrlChange(newUrl: string | null | undefined) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (!newUrl || !shouldLoad.value) {
      return
    }

    // Сбрасываем состояние — показываем плейсхолдер
    isLoaded.value = false
    isError.value = false
    debouncedReady.value = false

    // 🎯 Debounce 150ms — оптимально для карусели.
    // После задержки разрешаем показ нового изображения.
    // src/srcset уже реактивно обновлены во Vue-шаблоне,
    // браузер сам выберет правильный вариант из srcset.
    debounceTimer = setTimeout(() => {
      debouncedReady.value = true
    }, 150)
  }

  /**
   * 🧹 Очистка
   */
  function cleanup() {
    if (observer) {
      observer.disconnect()
      observer = null
    }

    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  /**
   * 🔄 Сброс состояния
   */
  function resetState() {
    isLoaded.value = false
    isError.value = false
    debouncedReady.value = false
  }

  /**
   * 👁️ Инициализация Intersection Observer
   */
  function initializeObserver() {
    if (!imageRef.value || eager)
      return

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true
            shouldLoad.value = true

            if (observer) {
              observer.disconnect()
              observer = null
            }
          }
        })
      },
      { rootMargin, threshold },
    )

    observer.observe(imageRef.value)
  }

  // --- ЖИЗНЕННЫЙ ЦИКЛ ---

  onMounted(() => {
    nextTick(() => {
      if (eager) {
        shouldLoad.value = true
        debouncedReady.value = true
      }
      else {
        initializeObserver()
      }
    })
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  watch(
    imageUrl,
    (newUrl, oldUrl) => {
      if (newUrl === oldUrl)
        return
      resetState()
      handleUrlChange(newUrl)
    },
  )

  watch(
    shouldLoad,
    (shouldLoadValue) => {
      if (shouldLoadValue && imageUrl.value) {
        handleUrlChange(imageUrl.value)
      }
    },
    { immediate: true },
  )

  return {
    imageRef,
    isVisible,
    isLoaded,
    isError,
    shouldLoad,
    debouncedReady, // 🆕 используй в шаблоне вместо прямого управления src
    onLoad,
    onError,
    resetState,
    cleanup,
  }
}
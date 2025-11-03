import type { Ref } from 'vue'

export interface ProgressiveImageOptions {
  rootMargin?: string
  threshold?: number
  eager?: boolean
}

/**
 * 🖼️ Композебл для прогрессивной загрузки изображений
 *
 * УПРОЩЕННАЯ ВЕРСИЯ:
 * ✅ Lazy loading через Intersection Observer
 * ✅ Debounce для быстрого переключения
 * ✅ Preloading для eager изображений
 * ✅ Браузерное кеширование
 */
export function useProgressiveImage(
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
   */
  function handleUrlChange(newUrl: string | null | undefined) {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (!newUrl || !shouldLoad.value) {
      return
    }

    // Сбрасываем состояние для нового изображения
    isLoaded.value = false
    isError.value = false

    // 🎯 Debounce 150ms (оптимально для карусели)
    debounceTimer = setTimeout(() => {
      if (imageRef.value && newUrl) {
        imageRef.value.src = newUrl
      }
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
    onLoad,
    onError,
    resetState,
    cleanup,
  }
}

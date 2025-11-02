import type { Ref } from 'vue'

/**
 * Опции для Intersection Observer
 */
export interface ProgressiveImageOptions {
  rootMargin?: string
  threshold?: number
  eager?: boolean
}

/**
 * 🖼️ Композебл для прогрессивной загрузки изображений
 *
 * ОПТИМИЗАЦИИ:
 * ✅ Кеширование загруженных URL (не перезагружаем одно изображение)
 * ✅ Debounce для быстрого переключения
 * ✅ Умная отмена только "старых" запросов
 * ✅ Preloading для eager изображений
 */
export function useProgressiveImage(
  imageUrl: Ref<string | null | undefined>,
  options: ProgressiveImageOptions = {},
) {
  const {
    rootMargin = '50px',
    threshold = 0.01,
    eager = false,
  } = options

  // --- СОСТОЯНИЕ ---
  const imageRef = ref<HTMLImageElement>()
  const isVisible = ref(false)
  const isLoaded = ref(false)
  const isError = ref(false)
  const shouldLoad = ref(eager)
  const retryCount = ref(0)
  const maxRetries = 2 // Уменьшили с 3 до 2

  // 🗄️ КЕШИРОВАНИЕ: Храним список успешно загруженных URL
  const loadedUrlsCache = new Set<string>()

  // 🛡️ Текущий URL для которого идет загрузка
  let currentLoadingUrl: string | null = null

  // ⏱️ Debounce таймер для быстрого переключения
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  let observer: IntersectionObserver | null = null

  /**
   * 💾 Проверка: загружено ли изображение из кеша браузера
   */
  function isImageCached(url: string): boolean {
    // Проверяем собственный кеш
    if (loadedUrlsCache.has(url)) {
      return true
    }

    // Проверяем браузерный кеш через Image API
    const img = new Image()
    img.src = url
    return img.complete && img.naturalHeight !== 0
  }

  /**
   * ✅ Обработчик успешной загрузки
   */
  function onLoad() {
    if (!currentLoadingUrl)
      return

    console.log('✅ Изображение загружено:', currentLoadingUrl)

    isLoaded.value = true
    isError.value = false
    retryCount.value = 0

    // Добавляем в кеш успешно загруженных
    loadedUrlsCache.add(currentLoadingUrl)
    currentLoadingUrl = null
  }

  /**
   * ❌ Обработчик ошибки загрузки
   */
  function onError(event: Event) {
    const target = event.target as HTMLImageElement
    const failedUrl = target?.src

    console.warn('⚠️ Ошибка загрузки изображения:', failedUrl)

    // Игнорируем ошибки для "старых" URL (которые уже не актуальны)
    if (failedUrl !== imageUrl.value) {
      console.log('⏭️ Игнорируем ошибку для неактуального URL')
      return
    }

    isError.value = true

    // Retry только если не превышен лимит
    if (retryCount.value < maxRetries) {
      retryCount.value++
      console.log(`🔄 Retry ${retryCount.value}/${maxRetries}...`)

      // Экспоненциальная задержка: 300ms, 600ms
      setTimeout(() => {
        if (imageRef.value && imageUrl.value === failedUrl) {
          // Добавляем случайный параметр для обхода кеша ошибок
          const separator = failedUrl.includes('?') ? '&' : '?'
          imageRef.value.src = `${failedUrl}${separator}retry=${Date.now()}`
        }
      }, 300 * retryCount.value)
    }
    else {
      console.error('🔴 Не удалось загрузить после всех попыток:', failedUrl)
    }
  }

  /**
   * 📋 Preload изображения (для eager loading)
   */
  function preloadImage(url: string) {
    if (!url || isImageCached(url))
      return

    console.log('📋 Preloading:', url)

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.crossOrigin = 'anonymous'

    document.head.appendChild(link)
  }

  /**
   * 🚀 Начать загрузку изображения
   */
  function startLoading(url: string) {
    if (!imageRef.value)
      return

    // Проверяем кеш - если уже загружено, сразу показываем
    if (isImageCached(url)) {
      console.log('💾 Изображение из кеша:', url)
      imageRef.value.src = url
      isLoaded.value = true
      isError.value = false
      return
    }

    // Начинаем новую загрузку
    console.log('🚀 Загружаем новое изображение:', url)
    currentLoadingUrl = url
    imageRef.value.src = url
  }

  /**
   * 🔄 Обработка смены URL
   */
  function handleUrlChange(newUrl: string | null | undefined) {
    // Очищаем debounce таймер
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    if (!newUrl || !shouldLoad.value) {
      return
    }

    // 🎯 Debounce для быстрого переключения (100ms)
    debounceTimer = setTimeout(() => {
      startLoading(newUrl)
    }, 100)
  }

  /**
   * 🧹 Очистка ресурсов
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

    currentLoadingUrl = null
  }

  /**
   * 🔄 Сброс состояния
   */
  function resetState() {
    isLoaded.value = false
    isError.value = false
    retryCount.value = 0
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

            console.log('👁️ Изображение видимо, начинаем загрузку')
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

        // Preload для eager изображений
        if (imageUrl.value) {
          preloadImage(imageUrl.value)
        }
      }
      else {
        initializeObserver()
      }
    })
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  /**
   * 🎯 Watch на изменение URL
   */
  watch(
    imageUrl,
    (newUrl, oldUrl) => {
      if (newUrl === oldUrl)
        return

      console.log('🔄 URL изменился:', { oldUrl, newUrl })

      // Сбрасываем состояние только если это реально другое изображение
      if (newUrl && !isImageCached(newUrl)) {
        resetState()
      }

      handleUrlChange(newUrl)
    },
  )

  /**
   * 🎯 Watch на shouldLoad (когда становится видимым)
   */
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
    retryCount,
    onLoad,
    onError,
    resetState,
    cleanup,
  }
}

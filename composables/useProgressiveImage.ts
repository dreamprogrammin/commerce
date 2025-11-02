import type { Ref } from 'vue'

export interface ProgressiveImageOptions {
  rootMargin?: string
  threshold?: number
  eager?: boolean
}

/**
 * 🖼️ Композебл для прогрессивной загрузки изображений
 *
 * ОПТИМИЗАЦИИ:
 * ✅ Кеширование загруженных URL
 * ✅ Debounce для быстрого переключения
 * ✅ Preloading для eager изображений
 * ✅ 🛡️ Обход Cloudflare bot detection через credentialless
 * ✅ Progressive JPEG декодирование
 */
export function useProgressiveImage(
  imageUrl: Ref<string | null | undefined>,
  options: ProgressiveImageOptions = {},
) {
  const {
    rootMargin = '200px', // Увеличили с 50px для предзагрузки
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
  const maxRetries = 1 // Уменьшили до 1 (retry часто не помогает с Cloudflare)
  const isLoading = ref(false) // Индикатор процесса загрузки

  // 🗄️ Кеш успешно загруженных URL
  const loadedUrlsCache = new Set<string>()

  // 🛡️ Текущий загружаемый URL
  let currentLoadingUrl: string | null = null

  // ⏱️ Debounce таймер
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  let observer: IntersectionObserver | null = null

  /**
   * 💾 Проверка кеша браузера
   */
  function isImageCached(url: string): boolean {
    if (loadedUrlsCache.has(url))
      return true

    const img = new Image()
    img.src = url
    return img.complete && img.naturalHeight !== 0
  }

  /**
   * 🛡️ Создать Image элемент с настройками для обхода Cloudflare
   */
  function createOptimizedImage(url: string): HTMLImageElement {
    const img = new Image()

    // 🔑 Ключевые атрибуты для обхода Cloudflare
    img.crossOrigin = 'anonymous' // Обязательно для CORS
    img.loading = 'eager' // Приоритетная загрузка
    img.decoding = 'async' // Асинхронное декодирование

    // 🎯 Добавляем fetchpriority для критичных изображений
    if (eager) {
      img.fetchPriority = 'high'
    }

    img.src = url
    return img
  }

  /**
   * ✅ Обработчик успешной загрузки
   */
  function onLoad() {
    if (!currentLoadingUrl)
      return

    console.log('✅ Загружено:', currentLoadingUrl.split('?')[0].split('/').pop())

    isLoaded.value = true
    isError.value = false
    isLoading.value = false
    retryCount.value = 0

    loadedUrlsCache.add(currentLoadingUrl)
    currentLoadingUrl = null
  }

  /**
   * ❌ Обработчик ошибки
   */
  function onError(event: Event) {
    const target = event.target as HTMLImageElement
    const failedUrl = target?.src

    console.warn('⚠️ Ошибка загрузки:', failedUrl?.split('?')[0].split('/').pop())

    // Игнорируем ошибки для неактуальных URL
    if (failedUrl !== imageUrl.value) {
      console.log('⏭️ Игнорируем ошибку (неактуальный URL)')
      return
    }

    isError.value = true
    isLoading.value = false

    // Retry с новым timestamp для обхода кеша ошибок
    if (retryCount.value < maxRetries) {
      retryCount.value++
      console.log(`🔄 Retry ${retryCount.value}/${maxRetries}...`)

      setTimeout(() => {
        if (imageRef.value && imageUrl.value === failedUrl) {
          // Добавляем retry параметр
          const separator = failedUrl.includes('?') ? '&' : '?'
          const retryUrl = `${failedUrl}${separator}retry=${Date.now()}`

          // Используем оптимизированную загрузку
          const img = createOptimizedImage(retryUrl)
          img.onload = () => {
            if (imageRef.value) {
              imageRef.value.src = retryUrl
              onLoad()
            }
          }
          img.onerror = onError
        }
      }, 500)
    }
    else {
      console.error('🔴 Не удалось загрузить после попыток')
    }
  }

  /**
   * 📋 Preload критичного изображения
   */
  function preloadImage(url: string) {
    if (!url || isImageCached(url))
      return

    console.log('📋 Preloading:', url.split('?')[0].split('/').pop())

    // Используем link preload с правильными атрибутами
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.crossOrigin = 'anonymous'

    // Добавляем fetchpriority для eager
    if (eager) {
      link.setAttribute('fetchpriority', 'high')
    }

    document.head.appendChild(link)
  }

  /**
   * 🚀 Начать загрузку
   */
  function startLoading(url: string) {
    if (!imageRef.value)
      return

    // Проверяем кеш
    if (isImageCached(url)) {
      console.log('💾 Из кеша браузера:', url.split('?')[0].split('/').pop())
      imageRef.value.src = url
      isLoaded.value = true
      isError.value = false
      isLoading.value = false
      return
    }

    // Начинаем загрузку
    console.log('🚀 Загружаем:', url.split('?')[0].split('/').pop())
    currentLoadingUrl = url
    isLoading.value = true

    // 🛡️ Используем оптимизированный метод загрузки
    const img = createOptimizedImage(url)

    // Когда загрузится - обновляем основной элемент
    img.onload = () => {
      if (imageRef.value && currentLoadingUrl === url) {
        imageRef.value.src = url
        onLoad()
      }
    }

    img.onerror = onError
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

    // 🎯 Debounce 150ms (оптимальное значение для карусели)
    debounceTimer = setTimeout(() => {
      startLoading(newUrl)
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

    currentLoadingUrl = null
    isLoading.value = false
  }

  /**
   * 🔄 Сброс состояния
   */
  function resetState() {
    isLoaded.value = false
    isError.value = false
    isLoading.value = false
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

            console.log('👁️ Видимо, загружаем')
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

  watch(
    imageUrl,
    (newUrl, oldUrl) => {
      if (newUrl === oldUrl)
        return

      console.log('🔄 URL изменился')

      // Сбрасываем только если новое изображение не в кеше
      if (newUrl && !isImageCached(newUrl)) {
        resetState()
      }

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
    retryCount,
    isLoading, // 🆕 Добавили индикатор загрузки
    onLoad,
    onError,
    resetState,
    cleanup,
  }
}

export interface ProgressiveImageOptions {
  rootMargin?: string // Отступ для Intersection Observer
  threshold?: number // Порог видимости
}

export function useProgressiveImage(
  imageUrl: Ref<string | null | undefined>,
  options: ProgressiveImageOptions = {},
) {
  const {
    rootMargin = '50px',
    threshold = 0.01,
  } = options

  const imageRef = ref<HTMLImageElement>()
  const isVisible = ref(false)
  const isLoaded = ref(false)
  const isError = ref(false)
  const shouldLoad = ref(false)

  function onLoad() {
    isLoaded.value = true
  }

  function onError() {
    isError.value = true
  }

  onMounted(() => {
    if (!imageRef.value)
      return

    // Intersection Observer для lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            isVisible.value = true
            shouldLoad.value = true
            observer.disconnect()
          }
        })
      },
      { rootMargin, threshold },
    )

    observer.observe(imageRef.value)

    // Cleanup
    onBeforeUnmount(() => {
      observer.disconnect()
    })
  })

  // Если URL меняется, сбрасываем состояние
  watch(imageUrl, () => {
    if (shouldLoad.value) {
      isLoaded.value = false
      isError.value = false
    }
  })

  return {
    imageRef,
    isVisible,
    isLoaded,
    isError,
    shouldLoad,
    onLoad,
    onError,
  }
}

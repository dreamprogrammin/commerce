<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useProgressiveImage } from '@/composables/useProgressiveImage'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_SIZES } from '@/config/images'

/**
 * Props для компонента ProgressiveImage
 */
interface Props {
  /** URL изображения */
  src: string | null | undefined

  /** Alt текст */
  alt: string

  /** Aspect ratio: 'square', 'video', 'portrait' */
  aspectRatio?: 'square' | 'video' | 'portrait'

  /** Как заполняется контейнер: cover, contain, fill */
  objectFit?: 'cover' | 'contain' | 'fill'

  /** Тип плейсхолдера: shimmer, blur, color */
  placeholderType?: 'shimmer' | 'blur' | 'color'

  /** Цвет для плейсхолдера (градиент) */
  placeholderColor?: string

  /** Bucket name для хранилища (опционально для трансформации) */
  bucketName?: string

  /** Путь к файлу в bucket (опционально для трансформации) */
  filePath?: string

  /** Использовать трансформацию размеров */
  useTransform?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  aspectRatio: 'square',
  objectFit: 'cover',
  placeholderType: 'shimmer',
  placeholderColor: 'from-muted via-muted/70 to-muted',
  useTransform: true,
})

// --- COMPOSABLES ---
const { getImageUrl } = useSupabaseStorage()
const imageUrl = toRef(props, 'src')
const {
  imageRef,
  isLoaded,
  isError,
  shouldLoad,
  onLoad,
  onError,
  retryCount,
} = useProgressiveImage(imageUrl)

// --- СОСТОЯНИЕ ---
const showPlaceholder = computed(() => !isLoaded.value && !isError.value)

/**
 * 🛡️ Получить оптимизированный URL с кешем для обхода Cloudflare
 * Timestamp УЖЕ добавляется в getImageUrl(), не добавляем снова!
 */
const optimizedImageUrl = computed(() => {
  if (!shouldLoad.value || !imageUrl.value) {
    return undefined
  }

  // Если есть bucket и filePath - используем трансформацию
  if (props.bucketName && props.filePath && props.useTransform) {
    const url = getImageUrl(props.bucketName, props.filePath, {
      width: IMAGE_SIZES.CARD.width,
      height: IMAGE_SIZES.CARD.height,
      quality: 80,
      format: 'webp',
      resize: 'cover',
    })

    // ✅ URL уже содержит timestamp из getImageUrl()
    return url
  }

  // ✅ Прямой URL уже содержит timestamp из getImageUrl()
  return imageUrl.value
})

/**
 * CSS классы для различных aspect ratios
 */
const aspectRatioClass = computed(() => {
  switch (props.aspectRatio) {
    case 'video':
      return 'aspect-video'
    case 'portrait':
      return 'aspect-[3/4]'
    case 'square':
    default:
      return 'aspect-square'
  }
})

/**
 * CSS классы для object-fit
 */
const objectFitClass = computed(() => {
  switch (props.objectFit) {
    case 'contain':
      return 'object-contain'
    case 'fill':
      return 'object-fill'
    case 'cover':
    default:
      return 'object-cover'
  }
})

/**
 * CSS классы для плейсхолдера
 */
const placeholderClass = computed(() => {
  const classes = ['absolute', 'inset-0', 'transition-opacity', 'duration-300']

  switch (props.placeholderType) {
    case 'shimmer':
      classes.push('bg-gradient-to-br', 'animate-pulse')
      break
    case 'blur':
      classes.push('backdrop-blur-xl')
      break
    case 'color':
      classes.push('bg-muted')
      break
  }

  return classes
})

/**
 * Стиль для плейсхолдера (если используется gradient)
 */
const placeholderStyle = computed(() => {
  if (props.placeholderType === 'shimmer') {
    return {
      backgroundImage: `linear-gradient(to bottom right, ${props.placeholderColor})`,
    }
  }
  return {}
})

/**
 * Логирование для отладки в dev режиме
 */
const isDev = computed(() => import.meta.env.DEV)

if (isDev.value) {
  watchEffect(() => {
    console.log('🖼️ ProgressiveImage debug:', {
      src: imageUrl.value,
      isLoaded: isLoaded.value,
      isError: isError.value,
      shouldLoad: shouldLoad.value,
      retryCount: retryCount.value,
      mode: IMAGE_OPTIMIZATION_ENABLED ? '🚀 Transform' : '💾 Pre-optimized',
    })
  })
}
</script>

<template>
  <div
    class="relative overflow-hidden bg-muted"
    :class="aspectRatioClass"
  >
    <!--
      📋 ПЛЕЙСХОЛДЕР
      Показывается пока изображение загружается или если произошла ошибка
      Независимо от режима оптимизации
    -->
    <div
      v-if="showPlaceholder"
      :class="placeholderClass"
      :style="placeholderStyle"
    >
      <!-- Спиннер загрузки -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-8 h-8 border-4 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
      </div>

      <!-- Индикатор режима (только в dev) -->
      <div
        v-if="isDev"
        class="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded font-mono"
      >
        <div v-if="IMAGE_OPTIMIZATION_ENABLED">
          🚀 Supabase Transform
        </div>
        <div v-else>
          💾 Pre-optimized
        </div>
        <div v-if="retryCount > 0" class="text-yellow-300">
          ⚠️ Retry: {{ retryCount }}/3
        </div>
      </div>
    </div>

    <!--
      🖼️ ОСНОВНОЕ ИЗОБРАЖЕНИЕ
      Использует оптимизированный URL с timestamp для обхода Cloudflare
    -->
    <img
      ref="imageRef"
      :src="optimizedImageUrl || undefined"
      :alt="alt"
      class="w-full h-full transition-opacity duration-300"
      :class="[
        isLoaded ? 'opacity-100' : 'opacity-0',
        objectFitClass,
      ]"
      loading="lazy"
      crossorigin="anonymous"
      @load="onLoad"
      @error="onError"
    >

    <!--
      ❌ FALLBACK ПРИ ОШИБКЕ
      Показывается если не удалось загрузить изображение после всех retry
    -->
    <div
      v-if="isError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-muted text-muted-foreground"
    >
      <!-- Иконка ошибки -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-12 h-12 mb-2 opacity-50"
        viewBox="0 0 24 24"
      >
        <path
          fill="currentColor"
          d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
        />
      </svg>

      <!-- Текст ошибки -->
      <span class="text-xs text-center px-2">
        Не удалось загрузить изображение
      </span>

      <!-- Отладочная информация (dev mode) -->
      <span
        v-if="isDev"
        class="text-xs text-muted-foreground mt-2 font-mono"
      >
        {{ src }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Плавная анимация появления плейсхолдера */
@keyframes shimmer {
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
}

/* Опционально: можешь добавить более сложную shimmer анимацию */
.shimmer-animation {
  animation: shimmer 2s infinite;
}
</style>

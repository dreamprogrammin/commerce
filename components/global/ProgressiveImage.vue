<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useProgressiveImage } from '@/composables/useProgressiveImage'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_SIZES } from '@/config/images'

interface Props {
  src: string | null | undefined
  alt: string
  aspectRatio?: 'square' | 'video' | 'portrait'
  objectFit?: 'cover' | 'contain' | 'fill'
  placeholderType?: 'shimmer' | 'blur' | 'color'
  placeholderColor?: string
  bucketName?: string
  filePath?: string
  useTransform?: boolean
  eager?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  aspectRatio: 'square',
  objectFit: 'cover',
  placeholderType: 'shimmer',
  placeholderColor: 'from-muted via-muted/70 to-muted',
  useTransform: true,
})

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
  isLoading, // 🆕 Используем индикатор загрузки
} = useProgressiveImage(imageUrl, { eager: props.eager })

const showPlaceholder = computed(() => !isLoaded.value && !isError.value)

/**
 * 🛡️ Оптимизированный URL (кешированный, стабильный)
 */
const optimizedImageUrl = computed(() => {
  if (!shouldLoad.value || !imageUrl.value) {
    return undefined
  }

  if (props.bucketName && props.filePath && props.useTransform) {
    return getImageUrl(props.bucketName, props.filePath, {
      width: IMAGE_SIZES.CARD.width,
      height: IMAGE_SIZES.CARD.height,
      quality: 80,
      format: 'webp',
      resize: 'cover',
    })
  }

  return imageUrl.value
})

const aspectRatioClass = computed(() => {
  switch (props.aspectRatio) {
    case 'video': return 'aspect-video'
    case 'portrait': return 'aspect-[3/4]'
    case 'square':
    default: return 'aspect-square'
  }
})

const objectFitClass = computed(() => {
  switch (props.objectFit) {
    case 'contain': return 'object-contain'
    case 'fill': return 'object-fill'
    case 'cover':
    default: return 'object-cover'
  }
})

const isDev = computed(() => import.meta.env.DEV)

/**
 * 🎯 Preload для критичных изображений
 */
function addPreloadLink() {
  if (!optimizedImageUrl.value || !props.eager)
    return

  const existing = document.querySelector(`link[href="${optimizedImageUrl.value}"]`)
  if (existing)
    return

  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = optimizedImageUrl.value
  link.crossOrigin = 'anonymous'

  // High priority для eager изображений
  link.setAttribute('fetchpriority', 'high')

  document.head.appendChild(link)
  console.log('📋 Preload добавлен')
}

watch(optimizedImageUrl, () => {
  addPreloadLink()
}, { immediate: true })
</script>

<template>
  <div
    class="relative overflow-hidden bg-muted"
    :class="aspectRatioClass"
  >
    <!-- 📋 ПЛЕЙСХОЛДЕР -->
    <div
      v-if="showPlaceholder"
      class="absolute inset-0 bg-gradient-to-br animate-pulse transition-opacity duration-300"
      :class="placeholderColor"
    >
      <!-- Спиннер загрузки (только если реально грузится) -->
      <div
        v-if="isLoading"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="relative">
          <!-- Внешнее кольцо (медленное) -->
          <div class="w-12 h-12 border-4 border-muted-foreground/10 border-t-muted-foreground/30 rounded-full animate-spin" />
          <!-- Внутреннее кольцо (быстрое) -->
          <div
            class="absolute inset-0 w-12 h-12 border-4 border-transparent border-b-muted-foreground/40 rounded-full animate-spin"
            style="animation-duration: 0.8s"
          />
        </div>
      </div>

      <!-- Индикатор режима (только в dev) -->
      <div
        v-if="isDev"
        class="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-2 py-1 rounded font-mono backdrop-blur-sm"
      >
        <div class="flex items-center gap-1">
          <span v-if="IMAGE_OPTIMIZATION_ENABLED">🚀</span>
          <span v-else>💾</span>
          <span v-if="isLoading" class="animate-pulse">⏳</span>
        </div>
        <div v-if="retryCount > 0" class="text-yellow-300 text-[9px]">
          Retry {{ retryCount }}
        </div>
      </div>
    </div>

    <!-- 🖼️ ОСНОВНОЕ ИЗОБРАЖЕНИЕ -->
    <img
      ref="imageRef"
      :src="optimizedImageUrl || undefined"
      :alt="alt"
      class="w-full h-full transition-opacity duration-500"
      :class="[
        isLoaded ? 'opacity-100' : 'opacity-0',
        objectFitClass,
      ]"
      loading="lazy"
      crossorigin="anonymous"
      decoding="async"
      :fetchpriority="eager ? 'high' : 'auto'"
      @load="onLoad"
      @error="onError"
    >

    <!-- ❌ FALLBACK ПРИ ОШИБКЕ -->
    <div
      v-if="isError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-muted/50 backdrop-blur-sm text-muted-foreground"
    >
      <!-- Иконка ошибки -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="w-10 h-10 mb-2 opacity-40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>

      <span class="text-xs text-center px-2 opacity-60">
        Не загрузилось
      </span>

      <!-- Debug info -->
      <span
        v-if="isDev"
        class="text-[9px] text-muted-foreground/60 mt-1 font-mono px-2 text-center break-all max-w-full"
      >
        {{ optimizedImageUrl?.split('/').pop()?.slice(0, 20) }}...
      </span>
    </div>
  </div>
</template>

<style scoped>
/* Плавная анимация появления */
img {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Shimmer эффект для плейсхолдера */
@keyframes shimmer {
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>

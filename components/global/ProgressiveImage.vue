<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useImageState } from '@/composables/useImageState'
import { IMAGE_OPTIMIZATION_ENABLED, IMAGE_SIZES } from '@/config/images'

interface Props {
  src: string | null | undefined
  alt: string
  aspectRatio?: 'square' | 'video' | 'portrait' | '21/9' | '3/4'
  objectFit?: 'cover' | 'contain' | 'fill'
  placeholderType?: 'shimmer' | 'blur' | 'color' | 'lqip' // 🆕 Добавили LQIP
  placeholderColor?: string
  blurDataUrl?: string | null // 🆕 Base64 blur preview
  bucketName?: string
  filePath?: string
  useTransform?: boolean
  eager?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  aspectRatio: 'square',
  objectFit: 'cover',
  placeholderType: 'lqip', // 🎯 По умолчанию LQIP
  placeholderColor: 'from-muted via-muted/70 to-muted',
  blurDataUrl: null,
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
} = useImageState(imageUrl, { eager: props.eager })

const showPlaceholder = computed(() => !isLoaded.value && !isError.value)

/**
 * Оптимизированный URL (кешированный, стабильный)
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
    case '21/9': return 'aspect-[21/9]'
    case '3/4' : return 'aspect-[3/4]'
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
</script>

<template>
  <div
    class="relative overflow-hidden bg-muted"
    :class="aspectRatioClass"
  >
    <!-- 📋 ПЛЕЙСХОЛДЕР -->
    <div
      v-if="showPlaceholder"
      class="absolute inset-0 transition-opacity duration-300"
      :class="{
        'bg-gradient-to-br animate-pulse': placeholderType === 'shimmer',
        'backdrop-blur-xl bg-muted/30': placeholderType === 'blur',
        'bg-muted': placeholderType === 'color',
      }"
    >
      <!-- 🎨 LQIP - Blur Preview (как на Medium.com) -->
      <div
        v-if="placeholderType === 'lqip' && blurDataUrl"
        class="absolute inset-0"
      >
        <!-- Крошечное blur изображение -->
        <img
          :src="blurDataUrl"
          :alt="alt"
          class="w-full h-full object-cover blur-2xl scale-110 opacity-60"
          aria-hidden="true"
        >
        <!-- Overlay для красоты -->
        <div class="absolute inset-0 bg-gradient-to-br from-transparent via-black/5 to-black/10" />
      </div>

      <!-- Fallback если нет blurDataUrl -->
      <div
        v-else-if="placeholderType === 'lqip'"
        class="absolute inset-0 bg-gradient-to-br animate-pulse"
        :class="placeholderColor"
      />

      <!-- Shimmer градиент -->
      <div
        v-if="placeholderType === 'shimmer'"
        class="absolute inset-0 bg-gradient-to-br"
        :class="placeholderColor"
      />

      <!-- Blur эффект с паттерном -->
      <div
        v-if="placeholderType === 'blur'"
        class="absolute inset-0 flex items-center justify-center"
      >
        <svg class="w-full h-full opacity-20" viewBox="0 0 100 100">
          <defs>
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <circle cx="5" cy="5" r="2" fill="currentColor" class="text-muted-foreground" />
            </pattern>
          </defs>
          <rect width="100" height="100" fill="url(#grid)" />
        </svg>
      </div>

      <!-- Маленький спиннер (только для LQIP и blur) -->
      <div
        v-if="placeholderType === 'lqip' || placeholderType === 'blur'"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="w-6 h-6 border-2 border-white/40 border-t-white/80 rounded-full animate-spin" />
      </div>

      <!-- Обычный спиннер для shimmer/color -->
      <div
        v-if="placeholderType === 'shimmer' || placeholderType === 'color'"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="w-10 h-10 border-4 border-muted-foreground/10 border-t-muted-foreground/30 rounded-full animate-spin" />
      </div>

      <!-- Индикатор режима (только в dev) -->
      <div
        v-if="isDev"
        class="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-2 py-1 rounded font-mono backdrop-blur-sm"
      >
        <span v-if="IMAGE_OPTIMIZATION_ENABLED">🚀</span>
        <span v-else>💾</span>
        <span v-if="placeholderType === 'lqip'" class="ml-1">LQIP</span>
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
    </div>
  </div>
</template>

<style scoped>
img {
  transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1);
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

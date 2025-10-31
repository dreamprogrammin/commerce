<script setup lang="ts">
import { useProgressiveImage } from '@/composables/useProgressiveImage'
import { IMAGE_OPTIMIZATION_ENABLED } from '@/config/images'

const props = defineProps<{
  src: string | null | undefined
  alt: string
  aspectRatio?: string
  objectFit?: 'cover' | 'contain' | 'fill'
  placeholderType?: 'shimmer' | 'blur' | 'color'
  placeholderColor?: string
}>()

const {
  aspectRatio = 'square',
  objectFit = 'cover',
  placeholderType = 'shimmer',
  placeholderColor = 'from-muted via-muted/70 to-muted',
} = props

const imageUrl = toRef(props, 'src')
const {
  imageRef,
  isLoaded,
  isError,
  shouldLoad,
  onLoad,
  onError,
} = useProgressiveImage(imageUrl)

// 🎯 Определяем, показывать ли плейсхолдер
// На бесплатном тарифе (IMAGE_OPTIMIZATION_ENABLED = false) плейсхолдер ВСЕГДА нужен
// На платном тарифе (IMAGE_OPTIMIZATION_ENABLED = true) тоже оставляем для лучшего UX
const showPlaceholder = computed(() => !isLoaded.value && !isError.value)
</script>

<template>
  <div
    class="relative overflow-hidden bg-muted"
    :class="{
      'aspect-square': aspectRatio === 'square',
      'aspect-video': aspectRatio === 'video',
      'aspect-[3/4]': aspectRatio === 'portrait',
    }"
  >
    <!--
      Плейсхолдер показывается ВСЕГДА пока изображение грузится
      Независимо от IMAGE_OPTIMIZATION_ENABLED
    -->
    <div
      v-if="showPlaceholder"
      class="absolute inset-0 transition-opacity duration-300"
      :class="[
        placeholderType === 'shimmer' && 'bg-gradient-to-br animate-pulse',
        placeholderType === 'blur' && 'backdrop-blur-xl',
        placeholderType === 'color' && 'bg-muted',
      ]"
      :style="placeholderType === 'shimmer' ? `background-image: linear-gradient(to bottom right, ${placeholderColor})` : undefined"
    >
      <!-- Иконка загрузки -->
      <div class="absolute inset-0 flex items-center justify-center">
        <div class="w-8 h-8 border-4 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
      </div>

      <!--
        Подсказка для разработчиков (только в dev режиме)
        Показывает, какой режим активен
      -->
      <div v-if="import.meta.dev" class="absolute bottom-2 left-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
        {{ IMAGE_OPTIMIZATION_ENABLED ? '🚀 Supabase Transform' : '💾 Pre-optimized' }}
      </div>
    </div>

    <!-- Реальное изображение -->
    <img
      ref="imageRef"
      :src="shouldLoad && src ? src : undefined"
      :alt="alt"
      class="w-full h-full transition-opacity duration-300"
      :class="[
        isLoaded ? 'opacity-100' : 'opacity-0',
        objectFit === 'cover' && 'object-cover',
        objectFit === 'contain' && 'object-contain',
        objectFit === 'fill' && 'object-fill',
      ]"
      loading="lazy"
      @load="onLoad"
      @error="onError"
    >

    <!-- Fallback для ошибок -->
    <div
      v-if="isError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-muted text-muted-foreground"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 mb-2 opacity-50" viewBox="0 0 24 24">
        <path fill="currentColor" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
      </svg>
      <span class="text-xs">Не удалось загрузить</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Banner } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'

// 🔥 Используем getCachedData для предотвращения повторных загрузок
const { data: banners, pending } = useAsyncData(
  'home-banners',
  async () => {
    const supabase = useSupabaseClient()
    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .eq('placement', 'homepage_gender')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .limit(2)

    if (error) {
      console.error('Ошибка загрузки баннеров:', error)
      return []
    }

    return data as Banner[]
  },
  {
    lazy: true,
    default: () => [],
    // 🔥 Кешируем данные - вернуть из кеша если существуют
    getCachedData(key) {
      const data = useNuxtData(key)
      return data.data.value
    },
  },
)

const { getPublicUrl } = useSupabaseStorage()

function getBannerImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return null
  return getPublicUrl('banners', imageUrl)
}
</script>

<template>
  <div class="py-8 md:py-12">
    <!-- Улучшенный скелетон при загрузке -->
    <div v-if="pending" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Skeleton 1 -->
      <div class="relative h-48 md:h-80 lg:h-96 rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 animate-pulse">
        <div class="absolute bottom-0 left-0 right-0 p-6 space-y-3">
          <Skeleton class="h-7 w-3/4 bg-white/20" />
          <Skeleton class="h-4 w-1/2 bg-white/20" />
        </div>
      </div>

      <!-- Skeleton 2 -->
      <div class="relative h-48 md:h-80 lg:h-96 rounded-lg overflow-hidden bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100 animate-pulse">
        <div class="absolute bottom-0 left-0 right-0 p-6 space-y-3">
          <Skeleton class="h-7 w-3/4 bg-white/20" />
          <Skeleton class="h-4 w-1/2 bg-white/20" />
        </div>
      </div>
    </div>

    <!-- Баннеры с плавным появлением -->
    <div v-else-if="banners && banners.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <NuxtLink
        v-for="(banner, index) in banners"
        :key="banner.id"
        :to="banner.cta_link || '#'"
        class="group relative overflow-hidden rounded-lg shadow-md hover:shadow-xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
        :style="{ animationDelay: `${index * 150}ms` }"
        :class="{
          'pointer-events-none': !banner.cta_link,
        }"
      >
        <!-- Изображение с ProgressiveImage -->
        <div class="relative h-48 md:h-80 lg:h-96 bg-gradient-to-br from-gray-100 to-gray-200">
          <ProgressiveImage
            v-if="banner.image_url"
            :src="getBannerImageUrl(banner.image_url)"
            :alt="banner.title"
            aspect-ratio="video"
            object-fit="cover"
            placeholder-type="lqip"
            :blur-data-url="banner.blur_data_url || undefined"
            eager
            class="group-hover:scale-105 transition-transform duration-300"
          />

          <!-- Fallback если нет изображения -->
          <div
            v-else
            class="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-purple-100"
          >
            <Icon name="lucide:image" class="w-16 h-16 text-muted-foreground/50" />
          </div>

          <!-- Контент -->
          <div class="absolute bottom-0 left-0 right-0 p-6 text-white z-10">
            <h3 class="text-xl md:text-2xl font-bold mb-2 drop-shadow-lg">
              {{ banner.title }}
            </h3>
            <p
              v-if="banner.description"
              class="text-sm md:text-base text-white/95 line-clamp-2 drop-shadow-md"
            >
              {{ banner.description }}
            </p>
          </div>

          <!-- Иконка ссылки -->
          <div
            v-if="banner.cta_link"
            class="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10"
          >
            <Icon name="lucide:arrow-right" class="w-5 h-5 text-gray-900" />
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Пустое состояние (только если НЕ загрузка и баннеры пусты) -->
    <div
      v-else-if="!pending && (!banners || banners.length === 0)"
      class="text-center py-12 text-muted-foreground"
    >
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
        <Icon name="lucide:image-off" class="w-8 h-8 opacity-50" />
      </div>
      <p class="text-sm">
        Нет активных баннеров для отображения
      </p>
    </div>
  </div>
</template>

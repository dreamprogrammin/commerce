<script setup lang="ts">
import type { Brand } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'

interface Props {
  brands: Brand[]
}

defineProps<Props>()

const { getVariantUrl } = useSupabaseStorage()
const headerContainerClass = carouselContainerVariants({ contained: 'always' })

function getBrandLogoUrl(logoUrl: string | null) {
  if (!logoUrl)
    return null
  return getVariantUrl(BUCKET_NAME_BRANDS, logoUrl, 'sm')
}

// Drag-to-scroll (как в PopularCategories)
const scrollContainer = ref<HTMLElement | null>(null)
let isDown = false
let startX = 0
let scrollLeft = 0

onMounted(() => {
  const container = scrollContainer.value
  if (!container)
    return

  container.addEventListener('mousedown', (e) => {
    isDown = true
    container.style.cursor = 'grabbing'
    startX = e.pageX - container.offsetLeft
    scrollLeft = container.scrollLeft
  })

  container.addEventListener('mouseleave', () => {
    isDown = false
    container.style.cursor = 'grab'
  })

  container.addEventListener('mouseup', () => {
    isDown = false
    container.style.cursor = 'grab'
  })

  container.addEventListener('mousemove', (e) => {
    if (!isDown)
      return
    e.preventDefault()
    const x = e.pageX - container.offsetLeft
    const walk = (x - startX) * 2
    container.scrollLeft = scrollLeft - walk
  })
})
</script>

<template>
  <section v-if="brands && brands.length > 0" class="py-8 md:py-12 bg-linear-to-b from-background to-muted/10">
    <!-- Заголовок с кнопкой -->
    <div :class="headerContainerClass">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl md:text-3xl font-bold">
          Популярные бренды
        </h2>
        <NuxtLink
          to="/brands"
          class="text-sm md:text-base text-primary hover:underline flex items-center gap-1"
        >
          Смотреть все
          <Icon name="lucide:arrow-right" class="w-4 h-4" />
        </NuxtLink>
      </div>
    </div>

    <!-- Горизонтальный скролл (как Instagram Stories) -->
    <div
      ref="scrollContainer"
      class="overflow-x-auto hide-scrollbar cursor-grab active:cursor-grabbing scroll-smooth"
      style="-webkit-overflow-scrolling: touch;"
    >
      <div class="flex gap-4 md:gap-6 px-4 sm:px-6 lg:px-8 pb-2">
        <NuxtLink
          v-for="brand in brands"
          :key="brand.id"
          :to="`/brand/${brand.slug}`"
          class="flex flex-col items-center gap-2 group shrink-0"
        >
          <!-- Круглый аватар с градиентной рамкой (как в Instagram) -->
          <div class="relative">
            <!-- Градиентная рамка -->
            <div class="w-20 h-20 md:w-28 md:h-28 rounded-full bg-linear-to-tr from-purple-600 via-pink-600 to-orange-500 p-0.5 group-hover:p-0.75 transition-all duration-300">
              <!-- Белый фон -->
              <div class="w-full h-full rounded-full bg-background p-0.5">
                <!-- Логотип бренда -->
                <div class="relative w-full h-full rounded-full bg-muted/50 overflow-hidden flex items-center justify-center">
                  <div v-if="brand.logo_url" class="absolute inset-0 p-1 flex items-center justify-center">
                    <ProgressiveImage
                      :src="getBrandLogoUrl(brand.logo_url) || ''"
                      :blur-data-url="brand.blur_placeholder"
                      :alt="brand.name"
                      object-fit="contain"
                      :placeholder-type="brand.blur_placeholder ? 'lqip' : 'shimmer'"
                      class="w-full h-full"
                    />
                  </div>
                  <Icon
                    v-else
                    name="lucide:package"
                    class="w-9 h-9 md:w-11 md:h-11 text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <!-- Индикатор активности (опционально) -->
            <div class="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <!-- Название бренда -->
          <span class="text-xs md:text-sm font-medium text-center line-clamp-1 max-w-24 md:max-w-28 group-hover:text-primary transition-colors">
            {{ brand.name }}
          </span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>

<style scoped>
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>

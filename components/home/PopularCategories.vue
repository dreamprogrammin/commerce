<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'

const popularCategoriesStore = usePopularCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

const { data: popularCategories, pending: isLoading } = useAsyncData(
  'home-popular-categories',
  async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return popularCategoriesStore.popularCategories
  },
)

function getCategoryImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return '/images/placeholder.svg'

  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_MENU)
    || '/images/placeholder.svg'
}

// Touch scroll functionality
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
  <div class="py-8 md:py-12">
    <h2 class="text-2xl md:text-3xl font-bold tracking-tight text-center mb-8">
      Популярные категории
    </h2>

    <!-- Loading State -->
    <div v-if="isLoading">
      <!-- Mobile Loading -->
      <div class="md:hidden overflow-x-auto hide-scrollbar">
        <div class="flex gap-3 px-4 pb-2">
          <div v-for="i in 6" :key="i">
            <Skeleton class="h-20 w-40 rounded-2xl flex-shrink-0" />
          </div>
        </div>
      </div>

      <!-- Desktop Loading -->
      <div class="hidden md:flex flex-wrap gap-3 justify-center">
        <div v-for="i in 8" :key="i">
          <Skeleton class="h-32 w-28 rounded-2xl" />
        </div>
      </div>
    </div>

    <template v-else-if="popularCategories && popularCategories.length > 0">
      <!-- MOBILE: Горизонтальный скролл в 2 ряда -->
      <div
        ref="scrollContainer"
        class="md:hidden overflow-x-auto hide-scrollbar cursor-grab active:cursor-grabbing scroll-smooth"
        style="-webkit-overflow-scrolling: touch;"
      >
        <div class="flex flex-col gap-3 px-4 pb-2 h-[192px]">
          <div class="flex gap-3 flex-1">
            <NuxtLink
              v-for="category in popularCategories.filter((_, i) => i % 2 === 0)"
              :key="category.id"
              :to="category.href"
              class="group flex-shrink-0"
            >
              <div
                class="
                  flex items-center gap-3 h-[88px] w-52 px-3 py-3
                  bg-white
                  border border-gray-200 rounded-2xl
                  shadow-sm
                  transition-all duration-300
                  hover:shadow-md hover:border-gray-300
                  cursor-pointer
                  relative overflow-hidden
                "
              >
                <div class="absolute inset-0 bg-gradient-to-r from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
                <div class="relative w-14 h-14 flex items-center justify-center flex-shrink-0 bg-gray-50 rounded-xl">
                  <img
                    :src="getCategoryImageUrl(category.image_url || null)"
                    :alt="category.name"
                    class="w-full h-full object-contain p-1"
                    loading="lazy"
                  >
                </div>
                <span class="font-semibold text-sm text-gray-900 relative z-10 group-hover:text-gray-900 transition-colors leading-snug flex-1 break-words">
                  {{ category.name }}
                </span>
              </div>
            </NuxtLink>
          </div>
          <div class="flex gap-3 flex-1">
            <NuxtLink
              v-for="category in popularCategories.filter((_, i) => i % 2 === 1)"
              :key="category.id"
              :to="category.href"
              class="group flex-shrink-0"
            >
              <div
                class="
                  flex items-center gap-3 h-[88px] w-52 px-3 py-3
                  bg-white
                  border border-gray-200 rounded-2xl
                  shadow-sm
                  transition-all duration-300
                  hover:shadow-md hover:border-gray-300
                  cursor-pointer
                  relative overflow-hidden
                "
              >
                <div class="absolute inset-0 bg-gradient-to-r from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
                <div class="relative w-14 h-14 flex items-center justify-center flex-shrink-0 bg-gray-50 rounded-xl">
                  <img
                    :src="getCategoryImageUrl(category.image_url || null)"
                    :alt="category.name"
                    class="w-full h-full object-contain p-1"
                    loading="lazy"
                  >
                </div>
                <span class="font-semibold text-sm text-gray-900 relative z-10 group-hover:text-gray-900 transition-colors leading-snug flex-1 break-words">
                  {{ category.name }}
                </span>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- DESKTOP: Компактные вертикальные чипсы -->
      <div>
        <div class="hidden md:flex flex-wrap gap-3 justify-center">
          <NuxtLink
            v-for="category in popularCategories"
            :key="category.id"
            :to="category.href"
            class="group"
          >
            <div
              class="
              flex flex-col items-center gap-2 w-28 h-32 p-3
              bg-gradient-to-b from-gray-50 to-white
              border border-gray-200 rounded-2xl
              transition-all duration-300
              hover:shadow-lg hover:border-gray-300 hover:-translate-y-1
              cursor-pointer
              relative overflow-hidden
            "
            >
              <div class="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />
              <div class="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                <img
                  :src="getCategoryImageUrl(category.image_url || null)"
                  :alt="category.name"
                  class="w-full h-full object-contain"
                  loading="lazy"
                >
              </div>
              <span class="font-medium text-xs text-gray-700 text-center relative z-10 group-hover:text-gray-900 transition-colors leading-tight">
                {{ category.name }}
              </span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </template>

    <div v-else class="text-center text-muted-foreground py-10">
      <p>Популярные категории скоро появятся здесь.</p>
    </div>
  </div>
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

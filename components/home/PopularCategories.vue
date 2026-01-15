<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'

const popularCategoriesStore = usePopularCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

// 🔥 TanStack Query - популярные категории с автоматическим кешированием
const { data: popularCategories, isLoading, isFetching } = useQuery({
  queryKey: ['home-popular-categories'],
  queryFn: async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return popularCategoriesStore.popularCategories
  },
  staleTime: 5 * 60 * 1000, // 5 минут
  gcTime: 10 * 60 * 1000, // 10 минут
})

// ✅ Показываем skeleton только если идёт загрузка И данных нет
const showSkeleton = computed(() => (isLoading.value || isFetching.value) && !popularCategories.value)

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
    <h2 class="text-2xl md:text-3xl font-bold tracking-tight text-start mb-8">
      Популярные категории
    </h2>

    <!-- ✅ Обертка для всех состояний -->
    <div>
      <!-- Loading State -->
      <div v-if="showSkeleton">
        <!-- Mobile Loading -->
        <div class="md:hidden overflow-x-auto hide-scrollbar">
          <div class="flex gap-3 px-4 pb-2">
            <div v-for="i in 6" :key="i">
              <Skeleton class="h-20 w-40 rounded-2xl flex-shrink-0" />
            </div>
          </div>
        </div>

        <!-- Desktop Loading -->
        <div class="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto px-4">
          <div v-for="i in 8" :key="i">
            <Skeleton class="h-48 rounded-3xl" />
          </div>
        </div>
      </div>

      <!-- Content -->
      <ClientOnly v-else-if="popularCategories && popularCategories.length > 0">
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

        <!-- DESKTOP: Горизонтальные карточки как на скриншоте -->
        <div class="hidden md:block">
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <NuxtLink
              v-for="category in popularCategories"
              :key="category.id"
              :to="category.href"
              class="group"
            >
              <div
                class="
                relative h-48 rounded-3xl overflow-hidden
                bg-gradient-to-br from-gray-50 to-gray-100
                border border-gray-200
                transition-all duration-300
                hover:shadow-xl hover:border-gray-300 hover:-translate-y-1
                cursor-pointer
              "
              >
                <!-- Gradient overlay on hover -->
                <div class="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />

                <!-- Content -->
                <div class="absolute inset-0 flex flex-col p-4">
                  <!-- Category name - занимает верхнюю часть -->
                  <div class="flex-shrink-0 pr-20">
                    <h3 class="text-lg font-bold text-gray-900 leading-tight break-words">
                      {{ category.name }}
                    </h3>
                  </div>

                  <!-- Spacer -->
                  <div class="flex-1 min-h-0" />

                  <!-- Bottom section: Arrow + Image - фиксированная позиция внизу -->
                  <div class="flex-shrink-0 flex items-end justify-between">
                    <!-- Arrow button -->
                    <div class="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>

                    <!-- Product image - абсолютное позиционирование -->
                    <div class="absolute bottom-0 right-0 w-36 h-36 flex items-center justify-center p-3">
                      <img
                        :src="getCategoryImageUrl(category.image_url || null)"
                        :alt="category.name"
                        class="w-full h-full object-contain drop-shadow-lg"
                        loading="lazy"
                      >
                    </div>
                  </div>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Fallback для SSR -->
        <template #fallback>
          <div class="md:hidden overflow-x-auto hide-scrollbar">
            <div class="flex gap-3 px-4 pb-2">
              <div v-for="i in 6" :key="i">
                <Skeleton class="h-20 w-40 rounded-2xl flex-shrink-0" />
              </div>
            </div>
          </div>
          <div class="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-7xl mx-auto px-4">
            <div v-for="i in 8" :key="i">
              <Skeleton class="h-48 rounded-3xl" />
            </div>
          </div>
        </template>
      </ClientOnly>

      <!-- Empty state -->
      <div v-else class="text-center text-muted-foreground py-10">
        <p>Популярные категории скоро появятся здесь.</p>
      </div>
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
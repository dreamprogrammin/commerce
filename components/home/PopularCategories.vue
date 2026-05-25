<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { onMounted, ref } from 'vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { usePopularCategoriesStore } from '@/stores/publicStore/popularCategoriesStore'

const popularCategoriesStore = usePopularCategoriesStore()
const { getVariantUrl } = useSupabaseStorage()

// 🔥 TanStack Query - популярные категории с автоматическим кешированием
const { data: popularCategories, isLoading, isFetching } = useQuery({
  queryKey: ['home-popular-categories'],
  queryFn: async () => {
    await popularCategoriesStore.fetchPopularCategories()
    return popularCategoriesStore.popularCategories
  },
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

const categories = computed(() => popularCategories.value ?? null)

// Показываем skeleton только при загрузке без данных
const showSkeleton = computed(() => (isLoading.value || isFetching.value) && !categories.value)

function getCategoryImageUrl(imageUrl: string | null, size: 'sm' | 'md' = 'sm') {
  if (!imageUrl)
    return '/images/placeholder.svg'

  return getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, size)
    || '/images/placeholder.svg'
}

function getCategoryImageVariants(imageUrl: string | null) {
  if (!imageUrl) {
    return { sm: null, md: null, lg: null }
  }
  return {
    sm: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'sm'),
    md: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'md'),
    lg: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'lg'),
  }
}

// Touch scroll functionality
const scrollContainer = ref<HTMLElement | null>(null)
let isDown = false
let startX = 0
let scrollLeft = 0

onMounted(() => {
  // Touch scroll setup
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
    <h2 class="text-xl md:text-3xl font-bold tracking-tight text-start mb-8">
      Популярные категории
    </h2>

    <ClientOnly>
      <div v-if="showSkeleton">
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
      </div>

      <div v-else-if="categories && categories.length > 0">
        <div
          ref="scrollContainer"
          class="md:hidden overflow-x-auto hide-scrollbar cursor-grab active:cursor-grabbing scroll-smooth"
          style="-webkit-overflow-scrolling: touch;"
        >
          <div class="flex flex-col gap-3 px-4 pb-2 h-[192px]">
            <div class="flex gap-3 flex-1">
              <NuxtLink
                v-for="category in categories.filter((_, i) => i % 2 === 0)"
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
                  <ProgressiveImage
                    :src="getCategoryImageUrl(category.image_url || null)"
                    :src-sm="getCategoryImageVariants(category.image_url || null).sm"
                    :src-md="getCategoryImageVariants(category.image_url || null).md"
                    :src-lg="getCategoryImageVariants(category.image_url || null).lg"
                    :blur-data-url="category.blur_placeholder || null"
                    :alt="category.name"
                    object-fit="contain"
                    :placeholder-type="category.blur_placeholder ? 'lqip' : 'shimmer'"
                    sizes="56px"
                    class="w-14 h-14 flex-shrink-0 rounded-xl"
                  />
                  <span class="font-semibold text-sm text-gray-900 relative z-10 group-hover:text-gray-900 transition-colors leading-snug flex-1 break-words">
                    {{ category.name }}
                  </span>
                </div>
              </NuxtLink>
            </div>
            <div class="flex gap-3 flex-1">
              <NuxtLink
                v-for="category in categories.filter((_, i) => i % 2 === 1)"
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
                  <ProgressiveImage
                    :src="getCategoryImageUrl(category.image_url || null)"
                    :src-sm="getCategoryImageVariants(category.image_url || null).sm"
                    :src-md="getCategoryImageVariants(category.image_url || null).md"
                    :src-lg="getCategoryImageVariants(category.image_url || null).lg"
                    :blur-data-url="category.blur_placeholder || null"
                    :alt="category.name"
                    object-fit="contain"
                    :placeholder-type="category.blur_placeholder ? 'lqip' : 'shimmer'"
                    sizes="56px"
                    class="w-14 h-14 flex-shrink-0 rounded-xl"
                  />
                  <span class="font-semibold text-sm text-gray-900 relative z-10 group-hover:text-gray-900 transition-colors leading-snug flex-1 break-words">
                    {{ category.name }}
                  </span>
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>

        <div class="hidden md:block">
          <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <NuxtLink
              v-for="category in categories"
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
                <div class="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-primary/10 transition-all duration-300" />

                <div class="absolute inset-0 flex flex-col p-4">
                  <div class="flex-shrink-0 pr-16">
                    <h3 class="text-base font-bold text-gray-900 leading-tight break-words">
                      {{ category.name }}
                    </h3>
                  </div>

                  <div class="flex-1 min-h-0" />

                  <div class="flex-shrink-0 flex items-end justify-between">
                    <div class="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-all duration-300">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>

                    <ProgressiveImage
                      :src="getCategoryImageUrl(category.image_url || null, 'md')"
                      :src-sm="getCategoryImageVariants(category.image_url || null).sm"
                      :src-md="getCategoryImageVariants(category.image_url || null).md"
                      :src-lg="getCategoryImageVariants(category.image_url || null).lg"
                      :blur-data-url="category.blur_placeholder || null"
                      :alt="category.name"
                      object-fit="contain"
                      :placeholder-type="category.blur_placeholder ? 'lqip' : 'shimmer'"
                      sizes="96px"
                      class="absolute bottom-0 right-0 w-24 h-24"
                    />
                  </div>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <div v-else class="text-center text-muted-foreground py-10">
        <p>Популярные категории скоро появятся здесь.</p>
      </div>

      <template #fallback>
        <div>
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
        </div>
      </template>
    </ClientOnly>
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

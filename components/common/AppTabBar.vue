<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { Search } from 'lucide-vue-next'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { HeaderOverlayKey } from '@/types/app'

const searchSuggestions = [
  {
    title: 'Популярные запросы',
    items: ['футболки', 'джинсы', 'кроссовки', 'куртки'],
  },
  {
    title: 'Недавние поиски',
    items: ['платья', 'шорты', 'рюкзаки'],
  },
  {
    title: 'Рекомендуемые категории',
    items: ['Спортивная одежда', 'Школьная форма', 'Праздничные наряды'],
  },
]

const headerOverlay = inject(HeaderOverlayKey)

const containerClass = carouselContainerVariants({ contained: 'always' })

const activeMenuValue = ref<string | undefined>()
const isSearchOpen = ref(false)

// 🆕 Отслеживание загруженных изображений для каждой категории
const loadedImages = ref<Set<string>>(new Set())

// 🆕 Предзагрузка изображений при наведении (prefetch)
const imagePreloadQueue = ref<Set<string>>(new Set())

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

const menuTree = computed(() => categoriesStore.menuTree)

useAsyncData('category-data', () => categoriesStore.fetchCategoryData())
useAsyncData('additional-menu-items', () => categoriesStore.fetchAdditionalMenuItems())

const isAnyPopupOpenInTabBar = computed(
  () => !!activeMenuValue.value || isSearchOpen.value,
)

watch(isAnyPopupOpenInTabBar, (isOpen) => {
  if (isOpen) {
    headerOverlay?.showOverlay()
  }
  else {
    setTimeout(() => {
      if (!activeMenuValue.value && !isSearchOpen.value) {
        headerOverlay?.hideOverlay()
      }
    }, 50)
  }
})

// Загружаем изображения при открытии конкретного меню
watch(activeMenuValue, (newValue) => {
  if (newValue !== undefined) {
    if (isSearchOpen.value) {
      isSearchOpen.value = false
    }
    // Отмечаем, что изображения для этой категории нужно загрузить
    loadedImages.value.add(newValue)
  }
})

watch(isSearchOpen, (isOpen) => {
  if (isOpen !== undefined && activeMenuValue.value) {
    activeMenuValue.value = undefined
  }
})

onUnmounted(() => {
  if (isAnyPopupOpenInTabBar.value) {
    headerOverlay?.hideOverlay()
  }
})

function closeAllPopups() {
  activeMenuValue.value = undefined
  isSearchOpen.value = false
}

function getCategoryImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl)
    return null
  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_MENU)
}

// Проверяем, нужно ли загружать изображение
function shouldLoadImage(parentSlug: string): boolean {
  return loadedImages.value.has(parentSlug)
}

// 🆕 Безопасное получение URL изображения
function getImageSrc(imageUrl: string | null): string | undefined {
  const url = getCategoryImageUrl(imageUrl)
  return url ?? undefined
}

// 🆕 Предзагрузка изображений при наведении
function prefetchImages(parentSlug: string, children: any[]) {
  if (imagePreloadQueue.value.has(parentSlug))
    return

  imagePreloadQueue.value.add(parentSlug)

  // Предзагружаем первые 3-4 изображения
  children.slice(0, 4).forEach((child) => {
    if (child.image_url) {
      const imgUrl = getImageSrc(child.image_url)
      if (imgUrl) {
        const img = new Image()
        img.src = imgUrl
      }
    }
  })
}

// 🆕 Дебаунс для предзагрузки (предотвращаем спам)
const debouncedPrefetch = useDebounceFn((parentSlug: string, children: any[]) => {
  prefetchImages(parentSlug, children)
}, 200)

// Функция для закрытия меню после клика по ссылке
function handleLinkClick() {
  activeMenuValue.value = undefined
}

defineExpose({ closeAllPopups })
</script>

<template>
  <div class="flex w-full items-center gap-3">
    <!-- Поиск с инпутом -->
    <Popover v-model:open="isSearchOpen">
      <PopoverTrigger as-child>
        <button
          class="group max-w-xs flex-shrink-0 w-full justify-start bg-white/15 hover:bg-white/20 transition-all duration-200 p-0 h-11 rounded-xl px-4 relative backdrop-blur-sm border border-white/10 hover:border-white/20 shadow-lg"
        >
          <div class="relative w-full items-center flex">
            <span class="absolute start-0 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-[18px] text-white/80 transition-all duration-200 group-hover:text-white group-hover:scale-110" />
            </span>
            <span class="pl-8 pr-4 text-sm text-white/80 w-full text-left font-medium group-hover:text-white transition-colors duration-200">
              Поиск товаров
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent class="p-0 min-w-screen rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden bg-white dark:bg-gray-900">
        <div :class="`w-full ${containerClass}`">
          <div class="relative mb-6 p-6 sm:p-8 pb-0">
            <Input
              id="search-input"
              type="text"
              placeholder="Поиск товаров..."
              class="pl-12 h-14 text-base rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500 dark:focus:border-blue-400 transition-all duration-200 placeholder:text-gray-400"
              autofocus
            />
            <span class="absolute start-6 sm:start-8 top-6 sm:top-8 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-5 text-gray-400" />
            </span>
          </div>

          <div class="space-y-6 px-6 sm:px-8 pb-6 sm:pb-8">
            <div v-for="section in searchSuggestions" :key="section.title">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {{ section.title }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="item in section.items"
                  :key="item"
                  class="inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200 cursor-pointer bg-gray-100 dark:bg-gray-800 hover:bg-blue-500 text-gray-700 dark:text-gray-300 hover:text-white"
                >
                  {{ item }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- Навигационное меню -->
    <NavigationMenu
      v-model="activeMenuValue"
      class="static flex-1"
      :delay-duration="150"
    >
      <NavigationMenuList class="flex w-full items-center justify-start gap-2">
        <template v-for="rootItem in menuTree" :key="rootItem.id">
          <NavigationMenuItem :value="rootItem.slug">
            <template v-if="rootItem.children && rootItem.children.length > 0">
              <NuxtLink :to="rootItem.href" as-child>
                <NavigationMenuTrigger
                  :class="`${navigationMenuTriggerStyle()} font-semibold text-sm bg-white/15 hover:bg-white/25 transition-all duration-200 rounded-xl text-white border border-white/10 hover:border-white/20 px-5 h-11 backdrop-blur-sm shadow-lg hover:shadow-xl`"
                  @click="handleLinkClick"
                  @mouseenter="debouncedPrefetch(rootItem.slug, rootItem.children)"
                >
                  {{ rootItem.name }}
                </NavigationMenuTrigger>
              </NuxtLink>

              <NavigationMenuContent>
                <div class="min-w-screen h-[45vh] bg-white dark:bg-gray-900 overflow-y-auto">
                  <ul
                    :class="containerClass"
                    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 py-12"
                  >
                    <li
                      v-for="childItem in rootItem.children"
                      :key="childItem.id"
                      class="space-y-3"
                    >
                      <NuxtLink
                        :to="childItem.href"
                        class="group block select-none rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 hover:shadow-lg border border-gray-200 dark:border-gray-800 hover:border-blue-400 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                        @click="handleLinkClick"
                      >
                        <div
                          v-if="childItem.image_url"
                          class="mb-3 overflow-hidden dark:border-gray-800 dark:bg-gray-800"
                        >
                          <!-- 🆕 Transition для плавной загрузки -->
                          <Transition
                            enter-active-class="transition-opacity duration-300"
                            enter-from-class="opacity-0"
                            leave-active-class="transition-opacity duration-200"
                            leave-to-class="opacity-0"
                          >
                            <img
                              v-if="shouldLoadImage(rootItem.slug) && getImageSrc(childItem.image_url)"
                              :src="getImageSrc(childItem.image_url)"
                              :alt="childItem.name"
                              loading="lazy"
                              decoding="async"
                              class="h-16 w-1/2 object-cover transition-transform duration-300 group-hover:scale-105"
                            >
                            <div
                              v-else
                              class="h-16 w-1/2 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700"
                            >
                              <Icon name="lucide:image" class="w-8 h-8 text-gray-300 dark:text-gray-600 animate-pulse" />
                            </div>
                          </Transition>
                        </div>
                        <div class="text-sm font-bold leading-tight text-gray-900 dark:text-gray-100 mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {{ childItem.name }}
                        </div>
                        <p
                          v-if="childItem.description"
                          class="text-xs line-clamp-2 leading-relaxed text-gray-500 dark:text-gray-400"
                        >
                          {{ childItem.description }}
                        </p>
                      </NuxtLink>
                      <ul
                        v-if="childItem.children && childItem.children.length > 0"
                        class="ml-2 space-y-1 list-none"
                      >
                        <li
                          v-for="grandChildItem in childItem.children"
                          :key="grandChildItem.id"
                        >
                          <NuxtLink
                            :to="grandChildItem.href"
                            class="flex items-center gap-2 select-none rounded-lg py-1.5 px-3 text-xs leading-snug no-underline outline-none transition-colors duration-200 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium"
                            @click="handleLinkClick"
                          >
                            <Icon name="lucide:chevron-right" class="w-3 h-3" />
                            {{ grandChildItem.name }}
                          </NuxtLink>
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <div
                    v-if="
                      rootItem.children.length === 0
                        && !categoriesStore.isLoading
                    "
                    class="py-20 text-center"
                  >
                    <div class="inline-flex flex-col items-center gap-3">
                      <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
                        <Icon name="lucide:package-open" class="w-8 h-8 text-gray-400" />
                      </div>
                      <p class="text-sm text-gray-500 dark:text-gray-400 font-medium">
                        Скоро здесь появятся подкатегории
                      </p>
                    </div>
                  </div>
                  <div
                    v-if="categoriesStore.isLoading"
                    class="py-20 text-center"
                  >
                    <div class="inline-flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 font-medium">
                      <div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
                      Загрузка категорий
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
            <NuxtLink
              v-else
              :to="rootItem.href"
              :class="`${navigationMenuTriggerStyle()} font-semibold text-sm bg-white/15 hover:bg-white/25 transition-all duration-200 rounded-xl text-white border border-white/10 hover:border-white/20 px-5 h-11 backdrop-blur-sm shadow-lg hover:shadow-xl`"
            >
              {{ rootItem.name }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>

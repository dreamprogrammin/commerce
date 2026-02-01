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
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { HeaderOverlayKey } from '@/types/app'

const headerOverlay = inject(HeaderOverlayKey)

const containerClass = carouselContainerVariants({ contained: 'always' })

const activeMenuValue = ref<string | undefined>()
const isSearchOpen = ref(false)

// Поиск товаров
const {
  searchQuery,
  searchResults,
  isSearching,
  suggestions,
  hasResults,
  hasQuery,
  brandSuggestions,
  debouncedSearch,
  performSearch,
  selectSuggestion,
  removeHistoryItem,
  clearSearchHistory,
} = useProductSearch()

const { getImageUrl: getSupabaseImageUrl } = useSupabaseStorage()

// Живой поиск при вводе
watch(searchQuery, (newQuery) => {
  if (newQuery.trim().length >= 4) {
    debouncedSearch(newQuery)
  }
  else {
    searchResults.value = []
  }
})

// Очистка при закрытии
watch(isSearchOpen, (isOpen) => {
  if (isOpen !== undefined && activeMenuValue.value) {
    activeMenuValue.value = undefined
  }
  if (!isOpen) {
    searchQuery.value = ''
    searchResults.value = []
  }
})

function handleSearch() {
  performSearch()
  isSearchOpen.value = false
}

function handleSelectSuggestion(suggestion: string) {
  selectSuggestion(suggestion)
  isSearchOpen.value = false
}

function handleRemoveHistory(text: string, event: Event) {
  event.stopPropagation()
  removeHistoryItem(text)
}

function getProductImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl)
    return null
  return getSupabaseImageUrl(BUCKET_NAME_PRODUCT, imageUrl, {
    width: IMAGE_SIZES.THUMBNAIL.width,
    height: IMAGE_SIZES.THUMBNAIL.height,
    quality: 80,
    format: 'webp',
    resize: 'cover',
  })
}

function formatPrice(price: number, discount?: number): { original: string, final: string, hasDiscount: boolean } {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  const final = hasDiscount
    ? (price * (1 - discount / 100)).toLocaleString('ru-RU')
    : original

  return { original, final, hasDiscount }
}

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
    <!-- Поиск с Popover -->
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
      <PopoverContent
        class="p-0 min-w-screen rounded-2xl border border-gray-200 shadow-2xl overflow-hidden bg-white"
        align="start"
      >
        <div :class="`w-full ${containerClass}`">
          <!-- Поле поиска -->
          <div class="relative p-6 pb-4 border-b border-gray-100">
            <Input
              v-model="searchQuery"
              type="text"
              placeholder="Поиск игрушек..."
              class="pl-12 h-12 text-base rounded-xl border-2 border-gray-200 bg-white focus:border-blue-500 transition-all duration-200 placeholder:text-gray-400"
              autofocus
              @keydown.enter="handleSearch"
              @keydown.esc="isSearchOpen = false"
            />
            <span class="absolute start-6 top-6 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-5 text-gray-400" />
            </span>

            <!-- Кнопка очистки -->
            <button
              v-if="hasQuery"
              type="button"
              class="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100"
              @click="searchQuery = ''"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>

          <!-- Индикатор загрузки -->
          <div v-if="isSearching" class="p-8 flex justify-center">
            <div class="flex items-center gap-3 text-blue-500">
              <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin" />
              <span class="text-sm font-medium">Поиск...</span>
            </div>
          </div>

          <!-- Результаты поиска -->
          <div v-else-if="hasResults || brandSuggestions.length > 0" class="max-h-[60vh] overflow-y-auto p-4 space-y-4">
            <!-- Бренды -->
            <div v-if="brandSuggestions.length > 0" class="space-y-2">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2">
                Бренды
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <NuxtLink
                  v-for="brand in brandSuggestions"
                  :key="brand.id"
                  :to="`/brand/all?brand=${brand.slug}`"
                  class="flex items-center gap-3 px-3 py-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg hover:shadow-md transition-all border border-blue-100"
                  @click="isSearchOpen = false"
                >
                  <Icon name="lucide:tag" class="w-4 h-4 text-blue-600 shrink-0" />
                  <span class="text-sm font-medium text-gray-900 truncate">
                    {{ brand.name }}
                  </span>
                </NuxtLink>
              </div>
            </div>

            <!-- Товары -->
            <div v-if="hasResults" class="space-y-2">
              <div class="flex items-center justify-between px-2">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Товары · {{ searchResults.length }}
                </h3>
                <button
                  type="button"
                  class="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  @click="handleSearch"
                >
                  Показать все
                </button>
              </div>

              <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <NuxtLink
                  v-for="product in searchResults.slice(0, 6)"
                  :key="product.id"
                  :to="`/catalog/products/${product.slug}`"
                  class="group flex flex-col gap-2 p-3 bg-white rounded-xl hover:shadow-lg transition-all duration-200 border border-gray-100 hover:border-blue-200"
                  @click="isSearchOpen = false"
                >
                  <!-- Изображение товара -->
                  <div class="aspect-square rounded-lg overflow-hidden bg-gray-50">
                    <ProgressiveImage
                      v-if="product.product_images[0]?.image_url"
                      :src="getProductImageUrl(product.product_images[0].image_url)"
                      :alt="product.name"
                      aspect-ratio="square"
                      object-fit="cover"
                      placeholder-type="lqip"
                      :blur-data-url="product.product_images[0].blur_placeholder"
                      :bucket-name="BUCKET_NAME_PRODUCT"
                      :file-path="product.product_images[0].image_url"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      eager
                    />
                    <div v-else class="w-full h-full flex items-center justify-center">
                      <Icon name="lucide:package" class="w-8 h-8 text-gray-300" />
                    </div>
                  </div>

                  <!-- Информация о товаре -->
                  <div class="flex-1 flex flex-col gap-1">
                    <h4 class="text-sm font-medium text-gray-900 line-clamp-2 leading-tight">
                      {{ product.name }}
                    </h4>

                    <div class="flex items-center gap-1.5 mt-auto">
                      <span
                        class="text-base font-bold"
                        :class="formatPrice(product.price, product.discount_percentage).hasDiscount ? 'text-red-600' : 'text-gray-900'"
                      >
                        {{ formatPrice(product.price, product.discount_percentage).final }} ₸
                      </span>

                      <span
                        v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                        class="text-xs text-gray-400 line-through"
                      >
                        {{ formatPrice(product.price, product.discount_percentage).original }} ₸
                      </span>
                    </div>

                    <div
                      v-if="product.stock_quantity > 0"
                      class="flex items-center gap-1 text-xs text-green-600"
                    >
                      <Icon name="lucide:check-circle" class="w-3 h-3" />
                      <span>В наличии</span>
                    </div>
                    <div
                      v-else
                      class="text-xs text-gray-400"
                    >
                      Нет в наличии
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>

          <!-- Нет результатов -->
          <div v-else-if="hasQuery && !isSearching" class="p-8 text-center">
            <Icon name="lucide:search-x" class="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h3 class="text-lg font-semibold text-gray-700 mb-2">
              Ничего не найдено
            </h3>
            <p class="text-sm text-gray-500 mb-4">
              Попробуйте изменить поисковый запрос
            </p>
            <Button
              variant="outline"
              size="sm"
              @click="searchQuery = ''"
            >
              Очистить поиск
            </Button>
          </div>

          <!-- Подсказки и история -->
          <div v-else class="max-h-[60vh] overflow-y-auto p-4 space-y-4">
            <div v-if="suggestions.length > 0">
              <div class="flex items-center justify-between px-2 mb-3">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {{ hasQuery ? 'Из истории' : 'Недавние запросы' }}
                </h3>
                <button
                  v-if="suggestions.some(s => s.type === 'history')"
                  type="button"
                  class="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  @click="clearSearchHistory"
                >
                  Очистить
                </button>
              </div>

              <div class="space-y-1">
                <button
                  v-for="(item, index) in suggestions"
                  :key="index"
                  type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 text-base rounded-lg hover:bg-blue-50 active:bg-blue-100 transition-all duration-200 text-left group"
                  @click="handleSelectSuggestion(item.text)"
                >
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
                    :class="item.type === 'history' ? 'bg-gray-100 group-hover:bg-blue-100' : 'bg-blue-50 group-hover:bg-blue-100'"
                  >
                    <Icon
                      :name="item.type === 'history' ? 'lucide:history' : 'lucide:trending-up'"
                      class="w-4 h-4 transition-colors"
                      :class="item.type === 'history' ? 'text-gray-600 group-hover:text-blue-600' : 'text-blue-500'"
                    />
                  </div>
                  <span class="flex-1 truncate text-gray-700 group-hover:text-gray-900 font-medium">
                    {{ item.text }}
                  </span>
                  <button
                    v-if="item.type === 'history'"
                    type="button"
                    class="w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all"
                    @click="handleRemoveHistory(item.text, $event)"
                  >
                    <Icon name="lucide:x" class="w-4 h-4 text-gray-400 hover:text-red-600" />
                  </button>
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
      <NavigationMenuList class="flex w-full items-center justify-end gap-2">
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
                          class="mb-3 overflow-hidden dark:border-gray-800 dark:bg-gray-800 rounded-lg aspect-square w-16"
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
                              class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            >
                            <div
                              v-else
                              class="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700"
                            >
                              <Icon name="lucide:image" class="w-8 h-8 text-gray-300 dark:text-gray-600 animate-pulse" />
                            </div>
                          </Transition>
                        </div>
                        <div class="text-sm font-bold leading-tight text-gray-900 dark:text-gray-100 mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {{ childItem.name }}
                        </div>
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

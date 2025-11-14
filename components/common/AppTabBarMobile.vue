<script setup lang="ts">
import { Search, X } from 'lucide-vue-next'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
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
]

const headerOverlay = inject(HeaderOverlayKey)

const isMenuOpen = ref(false)
const isSearchOpen = ref(false)
const searchQuery = ref('')

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

const menuTree = computed(() => categoriesStore.menuTree)
const additionalMenuItems = computed(() => categoriesStore.additionalMenuItems || [])

// Собираем все категории с изображениями для масонри
const categoriesForMasonry = computed(() => {
  const result: typeof menuTree.value = []

  menuTree.value.forEach((root) => {
    // Добавляем корневую если есть изображение
    if (root.image_url) {
      result.push(root)
    }

    // Добавляем дочерние категории с изображениями
    if (root.children) {
      root.children.forEach((child) => {
        if (child.image_url) {
          result.push(child)
        }

        // Добавляем подкатегории третьего уровня с изображениями
        if (child.children) {
          child.children.forEach((grandChild) => {
            if (grandChild.image_url) {
              result.push(grandChild)
            }
          })
        }
      })
    }
  })

  return result
})

useAsyncData('category-data', () => categoriesStore.fetchCategoryData())
useAsyncData('additional-menu-items', () => categoriesStore.fetchAdditionalMenuItems())

const isAnyPopupOpen = computed(() => isMenuOpen.value || isSearchOpen.value)

watch(isAnyPopupOpen, (isOpen) => {
  if (isOpen) {
    headerOverlay?.showOverlay()
    document.body.style.overflow = 'hidden'
  }
  else {
    headerOverlay?.hideOverlay()
    document.body.style.overflow = ''
  }
})

onUnmounted(() => {
  if (isAnyPopupOpen.value) {
    headerOverlay?.hideOverlay()
    document.body.style.overflow = ''
  }
})

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
  if (isMenuOpen.value) {
    isSearchOpen.value = false
  }
}

function toggleSearch() {
  isSearchOpen.value = !isSearchOpen.value
  if (isSearchOpen.value) {
    isMenuOpen.value = false
    nextTick(() => {
      const input = document.getElementById('mobile-search-input') as HTMLInputElement
      input?.focus()
    })
  }
}

function closeAll() {
  isMenuOpen.value = false
  isSearchOpen.value = false
}

function getCategoryImageUrl(imageUrl: string | null) {
  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_MENU)
}

// Функция для определения высоты карточки (случайная для эффекта масонри)
function getCardHeight(index: number): string {
  const heights = ['h-32', 'h-40', 'h-36', 'h-44', 'h-32', 'h-40'] as const
  return heights[index % heights.length] || 'h-36'
}

defineExpose({ closeAll })
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <!-- Кнопка поиска -->
    <button
      class="group flex-1 flex items-center justify-center gap-2 bg-white dark:bg-gray-800 h-11 rounded-lg px-4 transition-all duration-200 border-2 border-blue-500 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 shadow-md"
      @click="toggleSearch"
    >
      <Search class="size-5 text-blue-500 dark:text-blue-400 transition-all duration-200" />
      <span class="text-sm text-gray-700 dark:text-gray-300 font-semibold">
        Поиск
      </span>
    </button>

    <!-- Кнопка меню -->
    <button
      class="group flex items-center justify-center gap-2 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 h-11 px-6 rounded-lg transition-all duration-200 shadow-md"
      :aria-label="isMenuOpen ? 'Закрыть меню' : 'Открыть меню'"
      @click="toggleMenu"
    >
      <div class="relative w-5 h-5 flex items-center justify-center">
        <span
          class="absolute w-4 h-0.5 bg-white transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'rotate-45' : '-translate-y-1'"
        />
        <span
          class="absolute w-4 h-0.5 bg-white transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'opacity-0' : 'opacity-100'"
        />
        <span
          class="absolute w-4 h-0.5 bg-white transition-all duration-300 rounded-full"
          :class="isMenuOpen ? '-rotate-45' : 'translate-y-1'"
        />
      </div>
      <span class="text-sm text-white font-semibold">
        Каталог товаров
      </span>
    </button>

    <!-- Поисковая панель -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div
        v-if="isSearchOpen"
        class="fixed inset-x-0 top-[var(--header-height,64px)] bottom-0 bg-white dark:bg-gray-900 z-[45] overflow-y-auto"
      >
        <div class="p-4 space-y-6">
          <!-- Поисковое поле -->
          <div class="relative">
            <Input
              id="mobile-search-input"
              v-model="searchQuery"
              type="text"
              placeholder="Что ищете?"
              class="pl-11 h-12 text-base rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <span class="absolute start-0 inset-y-0 flex items-center justify-center px-3">
              <Search class="size-5 text-gray-400 dark:text-gray-500" />
            </span>
          </div>

          <!-- Подсказки поиска -->
          <div class="space-y-6">
            <div v-for="section in searchSuggestions" :key="section.title">
              <h4 class="text-[11px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                <div class="w-1 h-4 bg-blue-500 rounded-full" />
                {{ section.title }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="item in section.items"
                  :key="item"
                  class="inline-flex select-none rounded-lg px-4 py-2 text-[13px] font-medium leading-none outline-none transition-all duration-300 bg-gray-50 dark:bg-gray-800 hover:bg-blue-500 dark:hover:bg-blue-600 text-gray-700 dark:text-gray-300 hover:text-white border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 active:scale-95 hover:shadow-lg hover:shadow-blue-500/20"
                  @click="searchQuery = item"
                >
                  {{ item }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Боковое меню с масонри -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-out"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isMenuOpen"
        class="fixed inset-y-0 right-0 w-full bg-white dark:bg-gray-900 z-[45] overflow-y-auto"
      >
        <div class="sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-200 dark:border-gray-800">
          <!-- Заголовок -->
          <div class="flex items-center justify-between p-4">
            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
              Каталог
            </h2>
            <button
              class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-300"
              aria-label="Закрыть меню"
              @click="toggleMenu"
            >
              <X class="size-6 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        <!-- Загрузка -->
        <div
          v-if="categoriesStore.isLoading"
          class="py-20 text-center text-sm text-gray-500 dark:text-gray-400 font-medium flex items-center justify-center gap-3"
        >
          <div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
          Загрузка
        </div>

        <!-- Дополнительные пункты (Акции, Новинки) -->
        <div v-if="!categoriesStore.isLoading && additionalMenuItems.length > 0" class="p-4 grid grid-cols-2 gap-3">
          <NuxtLink
            v-for="item in additionalMenuItems"
            :key="item.id"
            :to="item.href"
            class="relative overflow-hidden rounded-2xl h-28 group"
            :class="item.id === 'new' ? 'bg-gradient-to-br from-yellow-100 to-yellow-200 dark:from-yellow-900/30 dark:to-yellow-800/30' : 'bg-gradient-to-br from-red-100 to-pink-200 dark:from-red-900/30 dark:to-pink-800/30'"
            @click="closeAll"
          >
            <div class="absolute inset-0 p-4 flex flex-col justify-between">
              <div>
                <Icon
                  v-if="item.icon"
                  :name="item.icon"
                  class="w-10 h-10 mb-2"
                  :class="item.id === 'new' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'"
                />
                <h3 class="text-base font-bold" :class="item.id === 'new' ? 'text-yellow-900 dark:text-yellow-100' : 'text-red-900 dark:text-red-100'">
                  {{ item.name }}
                </h3>
              </div>
            </div>
          </NuxtLink>
        </div>

        <!-- Масонри сетка категорий -->
        <div v-if="!categoriesStore.isLoading && categoriesForMasonry.length > 0" class="p-4 columns-2 gap-3 space-y-3">
          <NuxtLink
            v-for="(category, index) in categoriesForMasonry"
            :key="category.id"
            :to="category.href"
            class="relative overflow-hidden rounded-2xl block break-inside-avoid group"
            :class="getCardHeight(index)"
            @click="closeAll"
          >
            <!-- Изображение фона -->
            <div v-if="category.image_url" class="absolute inset-0">
              <img
                :src="getCategoryImageUrl(category.image_url) || undefined"
                :alt="category.name"
                class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              >
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </div>

            <!-- Фон без изображения -->
            <div
              v-else
              class="absolute inset-0 bg-gradient-to-br"
              :class="[
                index % 6 === 0 ? 'from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30' : '',
                index % 6 === 1 ? 'from-purple-100 to-purple-200 dark:from-purple-900/30 dark:to-purple-800/30' : '',
                index % 6 === 2 ? 'from-pink-100 to-pink-200 dark:from-pink-900/30 dark:to-pink-800/30' : '',
                index % 6 === 3 ? 'from-green-100 to-green-200 dark:from-green-900/30 dark:to-green-800/30' : '',
                index % 6 === 4 ? 'from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30' : '',
                index % 6 === 5 ? 'from-teal-100 to-teal-200 dark:from-teal-900/30 dark:to-teal-800/30' : '',
              ]"
            />

            <!-- Контент -->
            <div class="relative h-full p-4 flex flex-col justify-end">
              <div>
                <Icon
                  v-if="category.icon_name"
                  :name="category.icon_name"
                  class="w-8 h-8 mb-2"
                  :class="category.image_url ? 'text-white' : 'text-gray-700 dark:text-gray-300'"
                />
                <h3
                  class="text-base font-bold leading-tight"
                  :class="category.image_url ? 'text-white' : 'text-gray-900 dark:text-white'"
                >
                  {{ category.name }}
                </h3>
                <p
                  v-if="category.description"
                  class="text-xs mt-1 line-clamp-2"
                  :class="category.image_url ? 'text-white/90' : 'text-gray-600 dark:text-gray-400'"
                >
                  {{ category.description }}
                </p>
              </div>
            </div>

            <!-- Индикатор наведения -->
            <div class="absolute inset-0 border-2 border-transparent group-hover:border-blue-500 dark:group-hover:border-blue-400 rounded-2xl transition-colors duration-300 pointer-events-none" />
          </NuxtLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

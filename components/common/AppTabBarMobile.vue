<script setup lang="ts">
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
const expandedCategories = ref<Set<string>>(new Set())
const searchQuery = ref('')

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

const menuTree = computed(() => categoriesStore.menuTree)

useAsyncData('category-data', () => categoriesStore.fetchCategoryData())

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
  expandedCategories.value.clear()
}

function toggleCategory(categoryId: string) {
  if (expandedCategories.value.has(categoryId)) {
    expandedCategories.value.delete(categoryId)
  }
  else {
    expandedCategories.value.add(categoryId)
  }
}

function getCategoryImageUrl(imageUrl: string | null) {
  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_MENU)
}

defineExpose({ closeAll })
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <!-- Кнопка поиска -->
    <button
      class="group flex-1 flex items-center justify-start bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/30 h-10 rounded-2xl px-4 transition-all duration-500 border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50"
      @click="toggleSearch"
    >
      <Search class="size-[18px] text-gray-400 dark:text-gray-500 transition-all duration-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 mr-2" />
      <span class="text-[13px] text-gray-400 dark:text-gray-500 font-normal tracking-wide group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors duration-500">
        Поиск
      </span>
    </button>

    <!-- Кнопка меню -->
    <button
      class="group flex items-center justify-center bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/30 h-10 w-10 rounded-2xl transition-all duration-500 border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50"
      :aria-label="isMenuOpen ? 'Закрыть меню' : 'Открыть меню'"
      @click="toggleMenu"
    >
      <div class="relative w-5 h-5 flex items-center justify-center">
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'rotate-45' : '-translate-y-1.5'"
        />
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'opacity-0' : 'opacity-100'"
        />
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 transition-all duration-300 rounded-full"
          :class="isMenuOpen ? '-rotate-45' : 'translate-y-1.5'"
        />
      </div>
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
        class="fixed inset-x-0 top-[var(--header-height,64px)] bottom-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl z-[45] overflow-y-auto"
      >
        <div class="p-4 space-y-6">
          <!-- Поисковое поле -->
          <div class="relative">
            <Input
              id="mobile-search-input"
              v-model="searchQuery"
              type="text"
              placeholder="Что ищете?"
              class="pl-11 h-12 text-base rounded-2xl border-0 bg-gray-50/80 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/10 transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <span class="absolute start-0 inset-y-0 flex items-center justify-center px-3">
              <Search class="size-5 text-gray-400 dark:text-gray-500" />
            </span>
          </div>

          <!-- Подсказки поиска -->
          <div class="space-y-6">
            <div v-for="section in searchSuggestions" :key="section.title">
              <h4 class="text-[11px] uppercase tracking-widest font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {{ section.title }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="item in section.items"
                  :key="item"
                  class="inline-flex select-none rounded-full px-4 py-2 text-[13px] font-medium leading-none outline-none transition-all duration-300 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50 active:scale-95"
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

    <!-- Боковое меню -->
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
        class="fixed inset-y-0 right-0 w-[85vw] max-w-sm bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl z-[45] overflow-y-auto shadow-2xl"
      >
        <div class="p-6 space-y-1">
          <!-- Заголовок -->
          <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-100 dark:border-gray-800/50">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
              Категории
            </h2>
            <button
              class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors duration-300"
              aria-label="Закрыть меню"
              @click="toggleMenu"
            >
              <X class="size-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <!-- Загрузка -->
          <div
            v-if="categoriesStore.isLoading"
            class="py-12 text-center text-[13px] text-gray-400 dark:text-gray-500 font-normal tracking-wide flex items-center justify-center gap-3"
          >
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white" />
            Загрузка
          </div>

          <!-- Список категорий -->
          <nav v-else class="space-y-1">
            <div
              v-for="category in menuTree"
              :key="category.id"
              class="space-y-1"
            >
              <!-- Основная категория -->
              <div class="flex items-center">
                <NuxtLink
                  v-if="!category.children || category.children.length === 0"
                  :to="category.href"
                  class="flex-1 block px-4 py-3 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-300"
                  @click="closeAll"
                >
                  {{ category.name }}
                </NuxtLink>
                <button
                  v-else
                  class="flex-1 flex items-center justify-between px-4 py-3 rounded-xl text-[14px] font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-300 text-left"
                  @click="toggleCategory(category.id)"
                >
                  <span>{{ category.name }}</span>
                  <ChevronDown
                    class="size-4 transition-transform duration-300"
                    :class="expandedCategories.has(category.id) ? 'rotate-180' : ''"
                  />
                </button>
              </div>

              <!-- Подкатегории -->
              <Transition
                enter-active-class="transition-all duration-300 ease-out"
                enter-from-class="opacity-0 max-h-0"
                enter-to-class="opacity-100 max-h-[2000px]"
                leave-active-class="transition-all duration-200 ease-in"
                leave-from-class="opacity-100 max-h-[2000px]"
                leave-to-class="opacity-0 max-h-0"
              >
                <div
                  v-if="expandedCategories.has(category.id) && category.children"
                  class="ml-2 pl-3 border-l-2 border-gray-100 dark:border-gray-800/50 space-y-1 overflow-hidden"
                >
                  <div
                    v-for="child in category.children"
                    :key="child.id"
                    class="space-y-1"
                  >
                    <NuxtLink
                      :to="child.href"
                      class="block px-4 py-2.5 rounded-xl text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-300"
                      @click="closeAll"
                    >
                      {{ child.name }}
                    </NuxtLink>

                    <!-- Третий уровень -->
                    <div
                      v-if="child.children && child.children.length > 0"
                      class="ml-2 pl-3 space-y-0.5"
                    >
                      <NuxtLink
                        v-for="grandChild in child.children"
                        :key="grandChild.id"
                        :to="grandChild.href"
                        class="block px-4 py-2 rounded-lg text-[12px] font-normal text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-300"
                        @click="closeAll"
                      >
                        {{ grandChild.name }}
                      </NuxtLink>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </nav>
        </div>
      </div>
    </Transition>
  </div>
</template>

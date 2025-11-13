<script setup lang="ts">
import { ChevronDown, X } from 'lucide-vue-next'
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
      class="group flex-1 flex items-center justify-start bg-white/50 dark:bg-gray-900/50 hover:bg-white dark:hover:bg-gray-800 h-10 rounded-xl px-4 transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-blue-500/30 dark:hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/10"
      @click="toggleSearch"
    >
      <Search class="size-[18px] text-gray-500 dark:text-gray-400 transition-all duration-300 group-hover:text-blue-500 dark:group-hover:text-blue-400 mr-2" />
      <span class="text-[13px] text-gray-500 dark:text-gray-400 font-medium group-hover:text-gray-900 dark:group-hover:text-white transition-colors duration-300">
        Поиск
      </span>
    </button>

    <!-- Кнопка меню -->
    <button
      class="group flex items-center justify-center bg-white/50 dark:bg-gray-900/50 hover:bg-blue-500 dark:hover:bg-blue-600 h-10 w-10 rounded-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20"
      :aria-label="isMenuOpen ? 'Закрыть меню' : 'Открыть меню'"
      @click="toggleMenu"
    >
      <div class="relative w-5 h-5 flex items-center justify-center">
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 group-hover:bg-white transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'rotate-45' : '-translate-y-1.5'"
        />
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 group-hover:bg-white transition-all duration-300 rounded-full"
          :class="isMenuOpen ? 'opacity-0' : 'opacity-100'"
        />
        <span
          class="absolute w-5 h-0.5 bg-gray-600 dark:bg-gray-400 group-hover:bg-white transition-all duration-300 rounded-full"
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
        class="fixed inset-y-0 right-0 w-[85vw] max-w-sm bg-white dark:bg-gray-900 z-[45] overflow-y-auto shadow-2xl border-l border-gray-200 dark:border-gray-800"
      >
        <div class="p-6 space-y-1">
          <!-- Заголовок -->
          <div class="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center">
                <Icon name="lucide:layout-grid" class="w-4 h-4 text-white" />
              </div>
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                Категории
              </h2>
            </div>
            <button
              class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-300"
              aria-label="Закрыть меню"
              @click="toggleMenu"
            >
              <X class="size-5 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          <!-- Загрузка -->
          <div
            v-if="categoriesStore.isLoading"
            class="py-12 text-center text-[13px] text-gray-500 dark:text-gray-400 font-medium flex items-center justify-center gap-3"
          >
            <div class="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
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
                  class="flex-1 block px-4 py-3 rounded-lg text-[14px] font-bold text-gray-700 dark:text-gray-300 hover:text-white dark:hover:text-white hover:bg-blue-500 dark:hover:bg-blue-600 transition-all duration-300 border border-transparent hover:border-blue-500 dark:hover:border-blue-600"
                  @click="closeAll"
                >
                  {{ category.name }}
                </NuxtLink>
                <button
                  v-else
                  class="flex-1 flex items-center justify-between px-4 py-3 rounded-lg text-[14px] font-bold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-300 text-left border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                  @click="toggleCategory(category.id)"
                >
                  <span>{{ category.name }}</span>
                  <ChevronDown
                    class="size-4 transition-transform duration-300 text-blue-500"
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
                  class="ml-2 pl-3 border-l-2 border-blue-500/20 dark:border-blue-500/20 space-y-1 overflow-hidden"
                >
                  <div
                    v-for="child in category.children"
                    :key="child.id"
                    class="space-y-1"
                  >
                    <NuxtLink
                      :to="child.href"
                      class="block px-4 py-2.5 rounded-lg text-[13px] font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300"
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
                        class="block px-4 py-2 rounded-lg text-[12px] font-normal text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300"
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

<script setup lang="ts">
import type { IProductFilters } from '@/types' // Убедись, что этот тип существует и экспортирован
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// Импорт компонентов (убедись, что они лежат в `components/global/` или импортированы явно)

// Импорт сторов

// --- 1. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const categoriesStore = useCategoriesStore()

// --- 2. Реактивное состояние из сторов ---
const { products, isLoadingMore, hasMoreProducts } = storeToRefs(productsStore)

// --- 3. Локальное состояние для фильтров ---
interface ActiveFilters {
  sortBy: 'popularity' | 'newest' | 'price_asc' | 'price_desc'
  subCategoryIds: string[]
  price: [number, number]
}
const activeFilters = ref<ActiveFilters>({
  sortBy: 'popularity',
  subCategoryIds: [],
  price: [0, 50000], // Начальный диапазон по умолчанию
})

// --- 4. Вычисляемые свойства (Computeds) ---
const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const breadcrumbs = computed(() => categoriesStore.getBreadcrumbs(currentCategorySlug.value))
const title = computed(() => {
  const path = breadcrumbs.value
  if (Array.isArray(path) && path.length > 0) {
    return path[path.length - 1]?.name
  }
  return currentCategorySlug.value?.replace(/-/g, ' ') || 'Каталог'
})

// --- 5. Функции-обработчики ---

/**
 * Запускает полную перезагрузку товаров (с 1-й страницы).
 * Используется при смене фильтров.
 */
async function fetchProductsWithNewFilters() {
  const slug = currentCategorySlug.value
  if (!slug)
    return

  const filters: IProductFilters = {
    categorySlug: slug,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, false) // `false` = перезагрузка, а не дозагрузка
}

/**
 * Запускает дозагрузку следующей страницы товаров.
 */
async function loadMoreProducts() {
  const slug = currentCategorySlug.value
  if (!slug || isLoadingMore.value)
    return

  const filters: IProductFilters = {
    categorySlug: slug,
    sortBy: activeFilters.value.sortBy,
    subCategoryIds: activeFilters.value.subCategoryIds.length > 0 ? activeFilters.value.subCategoryIds : undefined,
    priceMin: activeFilters.value.price[0],
    priceMax: activeFilters.value.price[1],
  }
  await productsStore.fetchProducts(filters, true) // `true` = дозагрузка
}

// --- 6. Главная логика загрузки данных (Гибридный подход) ---

// `useAsyncData` отвечает за ПЕРВИЧНУЮ, БЫСТРУЮ загрузку на сервере.
await useAsyncData(
  `catalog-initial-${route.fullPath}`, // Уникальный ключ, чтобы кэш обновлялся при смене URL
  async () => {
    if (!currentCategorySlug.value)
      return

    // Собираем фильтры для SSR-запроса (только основные)
    const ssrFilters: IProductFilters = {
      categorySlug: currentCategorySlug.value,
      sortBy: 'popularity',
    }

    // Параллельно грузим категории и первые 4 товара
    const [_, initialProducts] = await Promise.all([
      categoriesStore.fetchCategoryData(),
      productsStore.fetchInitialProductsSSR(ssrFilters),
    ])

    // "Гидрируем" состояние стора данными с сервера.
    // Это гарантирует отсутствие ошибок гидратации.
    if (import.meta.server) {
      products.value = initialProducts
      if (initialProducts.length < 4) { // Если товаров меньше 4, то больше страниц нет
        hasMoreProducts.value = false
      }
    }

    return true
  },
  { watch: [currentCategorySlug] },
)

// `onMounted` отвечает за "дозагрузку" остатка первой страницы на клиенте,
// если на сервере мы загрузили неполную порцию.
onMounted(() => {
  // Если на сервере загрузилось 4 товара, значит, могут быть еще.
  // Запускаем полную загрузку первой страницы (12 товаров).
  if (hasMoreProducts.value && products.value.length === 4) {
    fetchProductsWithNewFilters()
  }
})

// `watchDebounced` отвечает за реакцию на ИЗМЕНЕНИЕ ФИЛЬТРОВ на клиенте
watchDebounced(
  activeFilters,
  () => {
    fetchProductsWithNewFilters()
  },
  { debounce: 500, deep: true },
)
</script>

<template>
  <div class="container py-8">
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />
    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="col-span-1 lg:sticky top-24 self-start">
        <!-- Оборачиваем сайдбар в ClientOnly, так как он зависит от клиентских данных (priceRange) -->
        <ClientOnly>
          <FilterSidebar v-model="activeFilters" />
          <template #fallback>
            <!-- Скелетон для сайдбара, пока клиент не "ожил" -->
            <div class="p-4 border rounded-lg bg-card space-y-4">
              <Skeleton class="h-8 w-1/2" />
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-full" />
            </div>
          </template>
        </ClientOnly>
      </aside>
      <main class="col-span-3">
        <CatalogHeader v-model:sort-by="activeFilters.sortBy" :title="title" />

        <!--
          Теперь у нас НЕТ v-if="isLoading" для всей сетки.
          Пользователь СРАЗУ видит первые товары, отрендеренные на сервере.
        -->
        <div v-if="products.length > 0" class="space-y-8">
          <ProductGrid :products="products" />

          <!-- Кнопка "Показать еще" -->
          <div v-if="hasMoreProducts" class="text-center">
            <Button variant="outline" size="lg" :disabled="isLoadingMore" @click="loadMoreProducts">
              <span v-if="isLoadingMore">Загрузка...</span>
              <span v-else>Показать ещё</span>
            </Button>
          </div>
        </div>

        <!-- Этот блок будет показан, только если ДАЖЕ первые товары не нашлись -->
        <div v-else class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
          <h3 class="text-2xl font-semibold">
            Товары не найдены
          </h3>
          <p class="mt-2">
            Попробуйте изменить фильтры или выбрать другую категорию.
          </p>
        </div>
      </main>
    </div>
  </div>
</template>

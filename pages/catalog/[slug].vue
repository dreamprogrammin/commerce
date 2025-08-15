<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// --- 2. Инициализация ---
const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const { getPublicUrl } = useSupabaseStorage()
const BUCKET_NAME = 'product-images'

// `storeToRefs` для безопасного доступа к реактивным свойствам стора
const { currentProduct, isLoading } = storeToRefs(productsStore)
const slug = route.params.slug as string

// --- 3. Загрузка данных ---
// `useAsyncData` теперь загружает все необходимые данные для страницы за один раз.
// Ключ `product-page-${slug}` гарантирует, что для каждого товара данные будут загружены
// и закэшированы отдельно.
const { error } = await useAsyncData(`product-page-${slug}`, async () => {
  // `Promise.all` запускает оба запроса параллельно, что немного быстрее.
  const [productData] = await Promise.all([
    productsStore.fetchProductBySlug(slug),
    categoriesStore.fetchCategoryData(), // Загружаем категории для хлебных крошек
  ])
  return { productData } // `useAsyncData` должен что-то возвращать
})

// --- 4. Обработка ошибок и состояния "не найдено" ---
// Проверяем, вернул ли наш `fetch` товар.
if (!currentProduct.value) {
  // Если товара нет, показываем стандартную страницу 404 Nuxt.
  throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
}

// --- 5. Вычисляемые свойства (Computeds) ---
// Этот computed теперь зависит от `currentProduct`, который гарантированно не `null`.
const breadcrumbs = computed(() => {
  const product = currentProduct.value
  if (!product)
    return [] // Дополнительная проверка на всякий случай

  const categorySlug = product.categories?.slug
  const categoryPath = categorySlug ? categoriesStore.getBreadcrumbs(categorySlug) : []

  // Добавляем сам товар как последний, некликабельный элемент
  return [
    ...categoryPath,
    { id: product.id, name: product.name }, // href не нужен
  ]
})

// --- 6. SEO и метаданные ---
// `useHead` для управления <title> и <meta> тегами страницы.
useHead({
  title: () => currentProduct.value?.name || 'Товар', // Делаем title реактивным
  meta: () => [
    { name: 'description', content: currentProduct.value?.description || `Купить ${currentProduct.value?.name} в нашем магазине` },
  ],
})

// --- 7. Локальное состояние UI ---
const quantity = ref(1)
</script>

<template>
  <div class="container py-12">
    <!-- ИЗМЕНЕНО: Добавлена проверка на `error` от `useAsyncData` -->
    <div v-if="error" class="text-center text-destructive py-20">
      <h1 class="text-2xl">
        Произошла ошибка при загрузке товара
      </h1>
      <p>{{ error.message }}</p>
    </div>
    <!-- Скелетон показывается, пока идет первоначальная загрузка -->
    <div v-else-if="isLoading && !currentProduct">
      <ProductImagesSkeleton />
    </div>
    <!-- Основной контент, когда товар успешно загружен -->
    <div v-else-if="currentProduct" class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <!-- Колонка с изображением -->
      <div>
        <Breadcrumbs :items="breadcrumbs" class="mb-4 md:hidden" />
        <div class="aspect-square bg-muted rounded-lg overflow-hidden border">
          <img
            v-if="currentProduct.image_url"
            :src="getPublicUrl(BUCKET_NAME, currentProduct.image_url) || undefined"
            :alt="currentProduct.name"
            class="w-full h-full object-cover"
          >
          <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
            Нет фото
          </div>
        </div>
      </div>

      <!-- Колонка с информацией -->
      <div class="space-y-6">
        <Breadcrumbs :items="breadcrumbs" class="hidden md:block" />
        <h1 class="text-3xl lg:text-4xl font-bold">
          {{ currentProduct.name }}
        </h1>
        <p class="text-4xl font-bold">
          {{ currentProduct.price }} ₸
        </p>

        <div v-if="currentProduct.description" class="prose prose-sm max-w-none text-muted-foreground">
          <p>{{ currentProduct.description }}</p>
        </div>

        <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
          При покупке вы получите <span class="font-bold">{{ currentProduct.bonus_points_award }} бонусов</span>
        </div>

        <div class="flex items-center gap-4 pt-4">
          <template v-if="currentProduct.stock_quantity > 0">
            <Input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="currentProduct.stock_quantity"
              class="w-24 text-center"
            />
            <Button size="lg" class="flex-grow" @click="cartStore.addItem(currentProduct, quantity)">
              Добавить в корзину
            </Button>
          </template>
          <Button v-else size="lg" class="flex-grow" disabled>
            Нет в наличии
          </Button>
        </div>

        <p v-if="currentProduct.stock_quantity > 0" class="text-sm text-green-600">
          В наличии: {{ currentProduct.stock_quantity }} шт.
        </p>
      </div>
    </div>
  </div>
</template>

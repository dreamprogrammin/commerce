<script setup lang="ts">
import type { ProductWithImages } from '@/types'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()

const accessories = ref<ProductWithImages[]>([])
const similarProducts = ref<ProductWithImages[]>([])

const slug = computed(() => route.params.slug as string)

const { data: product, pending: isLoading } = useAsyncData(
  `product-${slug.value}`,
  async () => {
    // Сбрасываем массивы
    accessories.value = []
    similarProducts.value = []

    // 1. Загружаем основной товар
    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)

    if (!fetchedProduct) {
      return null
    }

    // 2. Запускаем ПАРАЛЛЕЛЬНУЮ загрузку аксессуаров и похожих товаров
    await Promise.all([
      // Загрузка аксессуаров
      (async () => {
        if (fetchedProduct.accessory_ids && fetchedProduct.accessory_ids.length > 0) {
          accessories.value = await productsStore.fetchProductsByIds(fetchedProduct.accessory_ids)
        }
      })(),
      // Загрузка похожих товаров
      (async () => {
        if (fetchedProduct.category_id) {
          // СОЗДАЕМ ПРАВИЛЬНЫЙ МАССИВ ДЛЯ ИСКЛЮЧЕНИЯ
          const excludeIds = [fetchedProduct.id, ...fetchedProduct.accessory_ids || []]

          similarProducts.value = await productsStore.fetchSimilarProducts(
            fetchedProduct.category_id,
            excludeIds, // <-- ПЕРЕДАЕМ МАССИВ
          )
        }
      })(),
    ])

    return fetchedProduct
  },
  {
    watch: [slug],
    lazy: true,
    default: () => null,
  },
)

watch(isLoading, (newIsLoadingValue) => {
  if (newIsLoadingValue === false && !product.value) {
    showError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
  }
})
// --- Мета-теги ---
useHead(() => ({
  title: product.value?.name || 'Загрузка товара...',
  meta: [
    {
      name: 'description',
      content: product.value?.description || `Купить ${product.value?.name || 'товар'} в нашем интернет-магазине.`,
    },
  ],
}))

// --- Локальное состояние для корзины ---
const quantity = ref(1)

// Сбрасываем количество при переходе на другой товар
watch(() => product.value?.id, () => {
  quantity.value = 1
}, { immediate: true })
</script>

<template>
  <div class="container py-12">
    <!-- Используем ClientOnly для идеальной гидратации и управления состояниями -->
    <ClientOnly>
      <!-- Состояние загрузки -->
      <ProductDetailSkeleton v-if="isLoading" />

      <!-- Состояние с данными -->
      <div v-else-if="product">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 h-[80vh]">
          <div class="lg:col-span-8 h-full">
            <ProductGallery
              v-if="product.product_images && product.product_images.length > 0"
              :images="product.product_images"
            />

            <!-- Заглушка, если у товара вообще нет фото -->
            <div v-else class="bg-muted rounded-lg flex items-center justify-center h-full">
              <p class="text-muted-foreground">
                Изображения отсутствуют
              </p>
            </div>
          </div>
          <!-- ПРАВАЯ КОЛОНКА: Информация о товаре (остается без изменений) -->
          <div class="space-y-6 lg:col-span-4">
            <div>
              <NuxtLink v-if="product.categories" :to="`/catalog/${product.categories.slug}`" class="text-sm text-muted-foreground hover:text-primary transition-colors">
                {{ product.categories.name }}
              </NuxtLink>
              <h1 class="text-3xl lg:text-4xl font-bold mt-1">
                {{ product.name }}
              </h1>
            </div>
            <p class="text-4xl font-bold">
              {{ product.price }} ₸
            </p>
            <div v-if="product.description" class="prose prose-sm max-w-none text-muted-foreground">
              <p>{{ product.description }}</p>
            </div>
            <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
              При покупке вы получите <span class="font-bold">{{ product.bonus_points_award }} бонусов</span>
            </div>
            <div class="flex items-center gap-4 pt-4">
              <template v-if="product.stock_quantity > 0">
                <Input v-model.number="quantity" type="number" min="1" :max="product.stock_quantity" class="w-24 text-center" />
                <Button size="lg" class="flex-grow" @click="cartStore.addItem(product, quantity)">
                  Добавить в корзину
                </Button>
              </template>
              <Button v-else size="lg" class="flex-grow" disabled>
                Нет в наличии
              </Button>
            </div>
            <p v-if="product.stock_quantity > 0" class="text-sm text-green-600">
              В наличии: {{ product.stock_quantity }} шт.
            </p>
          </div>
        </div>

        <!-- ======== "ПОХОЖИЕ ТОВАРЫ" ======== -->
        <ProductCarousel v-if="similarProducts.length > 0" :products="similarProducts" class="mt-16 pt-8 border-t">
          <!-- Используем слот `header` для передачи нашего заголовка -->
          <template #header>
            <h2 class="text-2xl font-bold mb-6">
              Похожие товары
            </h2>
          </template>
        </ProductCarousel>

        <div v-if="accessories.length > 0" class="mt-16 pt-8 border-t">
          <h2 class="text-2xl font-bold mb-6">
            С этим товаром покупают
          </h2>
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            <!--
          Проходим по массиву СВЯЗЕЙ (`product.product_accessories`).
          Из каждой СВЯЗИ (`link`) мы извлекаем вложенный ТОВАР (`link.accessory`).
        -->
            <ProductCard
              v-for="item in accessories"
              :key="item.id"
              :product="item"
            />
          </div>
        </div>
      </div>

      <!-- Состояние "Товар не найден" -->
      <div v-else class="text-center py-20">
        <h1 class="text-2xl font-bold">
          Товар не найден
        </h1>
        <p class="text-muted-foreground mt-2">
          Возможно, товар был удален или ссылка неверна.
        </p>
        <NuxtLink to="/catalog" class="inline-block mt-4 text-primary hover:underline">
          ← Вернуться в каталог
        </NuxtLink>
      </div>

      <!-- Fallback для серверного рендеринга -->
      <template #fallback>
        <ProductDetailSkeleton />
      </template>
    </ClientOnly>
  </div>
</template>

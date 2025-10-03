<script setup lang="ts">
import type { ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()

const accessories = ref<ProductWithImages[]>([])
const similarProducts = ref<ProductWithImages[]>([])

const slug = computed(() => route.params.slug as string)

const selectedAccessoryIds = ref<string[]>([])

const { data: product, pending: isLoading } = useAsyncData(
  `product-${slug.value}`,
  async () => {
    // Сбрасываем массивы
    accessories.value = []
    similarProducts.value = []
    selectedAccessoryIds.value = []
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

const totalPrice = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.price)

  const selectedAccessories = accessories.value.filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  )

  for (const acc of selectedAccessories) {
    total += Number(acc.price)
  }

  return total
})

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
function addToCart() {
  if (!product.value)
    return

  // 1. Добавляем основной товар
  cartStore.addItem(product.value, quantity.value)

  // 2. Находим и добавляем все выбранные аксессуары (по 1 шт.)
  const selectedAccessories = accessories.value.filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selectedAccessories) {
    cartStore.addItem(acc, 1)
  }

  toast.success('Товары добавлены в корзину')
}
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
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div class="lg:col-span-8 top-24">
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
          <div class="lg:col-span-4 sticky top-24">
            <div class="space-y-6">
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

            <div v-if="accessories.length > 0" class="pt-4 border-t">
              <h3 class="font-semibold mb-3">
                С этим товаром покупают:
              </h3>
              <div class="space-y-3">
                <!-- Проходим циклом по всем доступным аксессуарам -->
                <div
                  v-for="acc in accessories"
                  :key="acc.id"
                  class="flex items-center justify-between p-3 rounded-md border has-[[data-state=checked]]:border-primary"
                >
                  <div class="flex items-center gap-3">
                    <Checkbox
                      :id="`acc-${acc.id}`"
                      :checked="selectedAccessoryIds.includes(acc.id)"
                      @update:checked="(checked) => {
                        if (checked) {
                          selectedAccessoryIds.push(acc.id)
                        }
                        else {
                          selectedAccessoryIds = selectedAccessoryIds.filter(id => id !== acc.id)
                        }
                      }"
                    />
                    <label :for="`acc-${acc.id}`" class="text-sm font-medium leading-none cursor-pointer">
                      {{ acc.name }}
                    </label>
                  </div>
                  <span class="text-sm font-semibold whitespace-nowrap">+ {{ acc.price }} ₸</span>
                </div>
              </div>
            </div>

            <div class="pt-4 border-t">
              <div class="flex justify-between items-baseline">
                <span class="text-lg font-medium">Общая стоимость:</span>
                <!-- Используем наше новое computed-свойство -->
                <p class="text-4xl font-bold">
                  {{ totalPrice }} ₸
                </p>
              </div>
            </div>

            <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
              При покупке вы получите <span class="font-bold">{{ product.bonus_points_award }} бонусов</span>
            </div>
            <div class="flex items-center gap-4 pt-4">
              <template v-if="product.stock_quantity > 0">
                <Input v-model.number="quantity" type="number" min="1" :max="product.stock_quantity" class="w-24 text-center" />
                <Button size="lg" class="flex-grow" @click="addToCart">
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

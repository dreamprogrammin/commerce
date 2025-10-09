<script setup lang="ts">
import type { ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()

const { getPublicUrl } = useSupabaseStorage()

const slug = computed(() => route.params.slug as string)

// `selectedAccessoryIds` остается здесь, это чисто клиентское UI-состояние
const selectedAccessoryIds = ref<string[]>([])

// --- ИЗМЕНЕНИЕ №1: Логика загрузки инкапсулирована в `useAsyncData` ---
const { data, pending: isLoading } = useAsyncData(
  `product-page-${slug.value}`, // Используем более уникальный ключ
  async () => {
    // Сбрасываем ВЫБРАННЫЕ аксессуары при каждой загрузке
    selectedAccessoryIds.value = []

    // 1. Загружаем основной товар
    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)

    if (!fetchedProduct) {
      // Возвращаем объект со структурой, но с null, чтобы избежать ошибок
      return { product: null, accessories: [], similarProducts: [] }
    }

    // 2. Создаем локальные переменные для результатов
    let fetchedAccessories: ProductWithImages[] = []
    let fetchedSimilarProducts: ProductWithImages[] = []

    // 3. Запускаем параллельную загрузку
    await Promise.all([
      (async () => {
        if (fetchedProduct.accessory_ids && fetchedProduct.accessory_ids.length > 0) {
          fetchedAccessories = await productsStore.fetchProductsByIds(fetchedProduct.accessory_ids)
        }
      })(),
      (async () => {
        if (fetchedProduct.category_id) {
          const excludeIds = [fetchedProduct.id, ...fetchedProduct.accessory_ids || []]
          fetchedSimilarProducts = await productsStore.fetchSimilarProducts(
            fetchedProduct.category_id,
            excludeIds,
          )
        }
      })(),
    ])

    // 4. ВОЗВРАЩАЕМ ОДИН БОЛЬШОЙ ОБЪЕКТ со всеми данными
    return {
      product: fetchedProduct,
      accessories: fetchedAccessories,
      similarProducts: fetchedSimilarProducts,
    }
  },
  {
    watch: [slug],
    lazy: true,
  },
)

const product = computed(() => data.value?.product)
const accessories = computed(() => data.value?.accessories || [])
const similarProducts = computed(() => data.value?.similarProducts || [])
const digitColumns = ref<HTMLElement[]>([])

// --- `totalPrice` и `totalBonuses` теперь используют `computed`-свойства ---
const totalPrice = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.price)
  const selected = accessories.value.filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.price)
  }
  return total
})

const totalBonuses = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.bonus_points_award)
  const selected = accessories.value.filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.bonus_points_award)
  }
  return total
})

const mainItemInCart = computed(() => {
  if (!product.value)
    return undefined
  return cartStore.items.find(item => item.product.id === product.value?.id)
})

// `computed` для получения количества ОСНОВНОГО товара в корзине
const quantityInCart = computed(() => {
  return mainItemInCart.value ? mainItemInCart.value.quantity : 0
})

function addToCart() {
  if (!product.value)
    return

  // Добавляем основной товар (если его еще нет)
  if (!mainItemInCart.value) {
    cartStore.addItem(product.value, 1) // Добавляем 1 шт.
  }

  // Находим и добавляем все выбранные аксессуары (по 1 шт.)
  const selectedAccessories = accessories.value.filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selectedAccessories) {
    // Проверяем, нет ли уже этого аксессуара в корзине, чтобы не дублировать
    const accInCart = cartStore.items.find(item => item.product.id === acc.id)
    if (!accInCart) {
      cartStore.addItem(acc, 1)
    }
  }

  toast.success('Товары добавлены в корзину')
}

useFlipCounter(totalPrice, digitColumns)

watch(isLoading, (newIsLoading) => {
  if (newIsLoading === false && !product.value) {
    showError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
  }
})

useHead(() => ({
  title: product.value?.name || 'Загрузка товара...',
  meta: [
    { name: 'description', content: product.value?.description || `Купить ${product.value?.name || 'товар'} в нашем интернет-магазине.` },
  ],
}))

const quantity = ref(1)
// const animatedPrice = useAnimatedCounter(totalPrice)
// const formattedAnimatedPrice = computed(() => {
//   return animatedPrice.value.toLocaleString('ru-RU')
// })
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
                <div
                  v-for="acc in accessories"
                  :key="acc.id"
                  class="flex items-center justify-between p-2 rounded-md border cursor-pointer select-none transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted hover:bg-muted/50"
                  @click="() => {
                    const isChecked = selectedAccessoryIds.includes(acc.id)
                    if (isChecked) {
                      selectedAccessoryIds = selectedAccessoryIds.filter(id => id !== acc.id)
                    }
                    else {
                      selectedAccessoryIds.push(acc.id)
                    }
                  }"
                >
                  <!-- Левая часть: Чекбокс, Картинка, Название -->
                  <div class="flex items-center gap-3">
                    <div @click.stop>
                      <Checkbox
                        :id="`acc-${acc.id}`"
                        :model-value="selectedAccessoryIds.includes(acc.id)"
                        @update:model-value="(checkedState) => {
                          if (checkedState === true) {
                            if (!selectedAccessoryIds.includes(acc.id)) {
                              selectedAccessoryIds.push(acc.id)
                            }
                          }
                          else if (checkedState === false) {
                            selectedAccessoryIds = selectedAccessoryIds.filter(id => id !== acc.id)
                          }
                        }"
                      />
                    </div>
                    <!-- Контейнер для картинки -->
                    <div class="w-12 h-12 bg-muted rounded-md overflow-hidden flex-shrink-0">
                      <NuxtImg
                        v-if="acc.product_images && acc.product_images.length > 0"
                        :src="getPublicUrl(BUCKET_NAME_PRODUCT, acc.product_images[0]?.image_url || null) || undefined"
                        :alt="acc.name"
                        class="w-full h-full object-cover"
                        format="webp"
                        quality="80"
                      />
                      <!-- Заглушка, если у аксессуара нет фото -->
                      <div v-else class="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Нет фото
                      </div>
                    </div>
                    <span class="text-sm font-medium leading-none">
                      {{ acc.name }}
                    </span>
                  </div>
                  <!-- Правая часть: Цена -->
                  <span class="text-sm font-semibold whitespace-nowrap">+ {{ acc.price }} ₸</span>
                </div>
              </div>
            </div>

            <div :key="`price-${product.id}`" class="pt-4 border-t">
              <div class="flex justify-between items-baseline">
                <span class="text-lg font-medium">Общая стоимость:</span>
                <div class="text-4xl font-bold flex items-center gap-0.5">
                  <!-- Колонки для цифр - динамически по длине числа -->
                  <div
                    v-for="(digit, i) in String(Math.round(totalPrice)).split('')"
                    :key="`digit-${i}`"
                    :ref="el => { if (el) digitColumns[i] = el as HTMLElement }"
                    class="digit-column"
                  >
                    <!-- Лента с цифрами от 0 до 9 -->
                    <div class="digit-ribbon">
                      <div v-for="d in 10" :key="d" class="digit-item">
                        {{ d - 1 }}
                      </div>
                    </div>
                  </div>
                  <span class="ml-2">₸</span>
                </div>
              </div>
            </div>

            <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
              При покупке вы получите <span class="font-bold">{{ totalBonuses }} бонусов</span>
            </div>
            <div class="flex items-center gap-4 pt-4">
              <template v-if="product.stock_quantity > 0">
                <!--
            Если ОСНОВНОГО товара НЕТ в корзине, показываем кнопку.
            Она теперь добавляет и основной товар, и выбранные аксессуары.
          -->
                <Button
                  v-if="!mainItemInCart"
                  size="lg"
                  class="flex-grow"
                  @click="addToCart"
                >
                  Добавить в корзину
                </Button>
                <!--
            Если ОСНОВНОЙ товар УЖЕ в корзине, показываем счетчик.
            Он будет управлять количеством ТОЛЬКО основного товара.
          -->
                <QuantitySelector
                  v-else
                  :product="product"
                  :quantity="quantityInCart"
                  class="flex-grow"
                />
              </template>
              <Button v-else size="lg" class="flex-grow" disabled>
                Нет в наличии
              </Button>
            </div>
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

<style scoped>
.digit-column {
  height: 2.5rem;
  line-height: 2.5rem;
  overflow: hidden;
  position: relative;
  width: 1.5rem;
  text-align: center;
  border-radius: 0.25rem;
  transition: background-color 0.3s ease;
}

.digit-ribbon {
  position: relative;
  will-change: transform;
}

.digit-item {
  height: 2.5rem;
  line-height: 2.5rem;
}
</style>

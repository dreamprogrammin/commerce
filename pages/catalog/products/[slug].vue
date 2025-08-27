<script setup lang="ts">
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const slug = computed(() => route.params.slug as string)

// Добавляем локальное состояние загрузки
const isLocalLoading = ref(true)

const { data: product, pending: isAsyncLoading, error } = await useAsyncData(
  () => `product-${slug.value}`, // Динамический ключ
  async () => {
    isLocalLoading.value = true
    try {
      const result = await productsStore.fetchProductBySlug(slug.value)
      return result || null
    }
    finally {
      isLocalLoading.value = false
    }
  },
  {
    watch: [slug],
    server: true,
    default: () => null,
  },
)

// Комбинируем состояния загрузки
const isLoading = computed(() => isAsyncLoading.value || isLocalLoading.value)

// Отслеживаем изменения slug и показываем loading
watch(slug, () => {
  isLocalLoading.value = true
}, { immediate: false })

// Проверяем ошибки после загрузки
watchEffect(() => {
  if (!isLoading.value && (error.value || !product.value)) {
    throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
  }
})

useHead(() => ({
  title: product.value?.name || 'Загрузка...',
  meta: [
    {
      name: 'description',
      content: product.value?.description || `Купить ${product.value?.name || 'товар'} в нашем магазине`,
    },
  ],
}))

const quantity = ref(1)

// Сбрасываем количество при смене товара
watch(() => product.value?.id, () => {
  quantity.value = 1
})
</script>

<template>
  <div class="container py-12">
    <!-- Показываем скелетон при любой загрузке -->
    <ProductImagesSkeleton v-if="isLoading" />

    <!-- Показываем товар только когда загрузка завершена -->
    <div v-else-if="product" class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <!-- Левая колонка: Изображение -->
      <div>
        <div class="aspect-square bg-muted rounded-lg overflow-hidden border">
          <NuxtImg
            v-if="product.image_url"
            :src="`/product-images/${product.image_url}`"
            :alt="product.name"
            width="800"
            height="800"
            fit="contain"
            format="webp"
            quality="80"
            placeholder
            loading="lazy"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
            Нет фото
          </div>
        </div>
      </div>

      <!-- Правая колонка: Информация и покупка -->
      <div class="space-y-6">
        <div>
          <NuxtLink
            v-if="product.categories"
            :to="`/catalog/${product.categories.slug}`"
            class="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
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
            <Input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="product.stock_quantity"
              class="w-24 text-center"
              aria-label="Количество товара"
            />
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

    <!-- Fallback -->
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
  </div>
</template>

<script setup lang="ts">
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()

const slug = computed(() => route.params.slug as string)

// --- Упрощенная загрузка данных ---
// Мы используем ключ, зависящий от slug, чтобы Nuxt кэшировал результаты.
// `pending` будет нашим ЕДИНСТВЕННЫМ источником состояния загрузки.
const { data: product, pending: isLoading } = await useAsyncData(
  `product-${slug.value}`,
  () => productsStore.fetchProductBySlug(slug.value),
  {
    // `watch` будет перезапускать `fetchProductBySlug` при смене slug.
    watch: [slug],
    // `default` помогает избежать ошибок рендеринга на стороне сервера, если данные не пришли.
    default: () => null,
    lazy: true,
  },
)

// --- Обработка ошибок и 404 ---
// Этот watchEffect сработает на сервере и на клиенте, если данные не загрузились.
watch(isLoading, (newIsLoadingValue) => {
  // Мы запускаем проверку только тогда, когда загрузка ЗАКОНЧИЛАСЬ
  // (т.е. newIsLoadingValue стало false).
  // И если после этого product всё ещё пуст, значит, это реальная ошибка 404.
  if (newIsLoadingValue === false && !product.value) {
    // showError - это рекомендуемый Nuxt способ вызова ошибки
    // на стороне клиента асинхронно.
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

if (isLoading.value) {
  console.log('не возвращает true всегда false поэтому я не вижу скелета')
}

// --- Локальное состояние для корзины ---
const quantity = ref(1)

// Сбрасываем количество при переходе на другой товар
watch(() => product.value?.id, () => {
  quantity.value = 1
}, { immediate: true })
</script>

<template>
  <div class="container py-12">
    <!-- Используем `pending` от `useAsyncData` для показа скелетона. -->
    <!-- Важно: этот скелетон теперь будет виден только при ПЕРВОЙ загрузке страницы -->
    <!-- или если вы переходите на товар, который еще не был загружен. -->
    <ProductDetailSkeleton v-if="isLoading" />

    <!-- Отображаем товар, как только `isLoading` становится `false` и `product` существует -->
    <div v-else-if="product" class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <!-- Левая колонка: Изображение (без изменений) -->
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
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground">
            Нет фото
          </div>
        </div>
      </div>

      <!-- Правая колонка: Информация и покупка (без изменений) -->
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

    <!-- Этот блок можно оставить на случай, если `createError` по какой-то причине не сработает -->
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

<script setup lang="ts">
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const slug = route.params.slug as string

const { data: product, pending: isLoading, error } = await useAsyncData(
  `product-${slug}`,
  () => productsStore.fetchProductBySlug(slug),
  {
    watch: [() => route.params.slug],
  },
)

if (error.value || !product.value) {
  throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
}

useHead(() => ({
  title: product.value?.name || 'Товар',
  meta: [
    {
      name: 'description',
      content: product.value?.description || `Купить ${product.value?.name} в нашем магазине`,
    },
  ],
}))

const quantity = ref(1)
</script>

<template>
  <div class="container py-12">
    <!-- Показываем скелетон, пока данные грузятся (например, при медленном клиентском переходе) -->
    <div v-if="isLoading">
      <ProductImagesSkeleton />
    </div>
    <!--
      После загрузки, если `currentProduct` существует, показываем основную разметку.
      Эта проверка дублирует проверку в <script>, но является хорошей практикой для шаблона.
    -->
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
        <!-- TODO: Добавить галерею с дополнительными фото, если они будут -->
      </div>

      <!-- Правая колонка: Информация и покупка -->
      <div class="space-y-6">
        <div>
          <!-- "Хлебные крошки" - ссылка на категорию товара -->
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

        <!-- Описание товара, обернутое в `prose` для красивого форматирования текста -->
        <div v-if="product.description" class="prose prose-sm max-w-none text-muted-foreground">
          <p>{{ product.description }}</p>
        </div>

        <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
          При покупке вы получите <span class="font-bold">{{ product.bonus_points_award }} бонусов</span>
        </div>

        <!-- Блок добавления в корзину -->
        <div class="flex items-center gap-4 pt-4">
          <!-- ИЗМЕНЕНО: Добавлена проверка на наличие товара на складе -->
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
          <!-- Если товара нет в наличии, показываем сообщение -->
          <Button v-else size="lg" class="flex-grow" disabled>
            Нет в наличии
          </Button>
        </div>

        <!-- Индикатор наличия на складе -->
        <p v-if="product.stock_quantity > 0" class="text-sm text-green-600">
          В наличии: {{ product.stock_quantity }} шт.
        </p>
      </div>
    </div>
  </div>
</template>

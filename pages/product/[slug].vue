<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const { getPublicUrl } = useSupabaseStorage()
const BUCKET_NAME = 'product-images'

const { currentProduct, isLoading } = storeToRefs(productsStore)
const slug = route.params.slug as string

// --- 3. Загрузка данных ---
// `useAsyncData` выполняет загрузку на сервере для SEO и быстрой первой отрисовки.
// `product-${slug}` - уникальный ключ, чтобы Nuxt не загружал данные для одного и того же товара повторно.
const { error } = await useAsyncData(`product-${slug}`, () => productsStore.fetchProductBySlug(slug))

// --- 4. Обработка ошибок и состояния "не найдено" ---
// ИЗМЕНЕНО: Проверяем не только `currentProduct.value`, но и ошибку от `useAsyncData`.
// Эта проверка выполняется на сервере. Если товар не найден, Nuxt сразу отдаст 404.
if (error.value || !currentProduct.value) {
  // `fatal: true` говорит Nuxt, что это критическая ошибка и нужно немедленно показать страницу ошибки.
  throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
}

// --- 5. SEO и метаданные страницы ---
// ИЗМЕНЕНО: Оборачиваем в `watchEffect`, чтобы title обновлялся,
// даже если пользователь переходит между страницами товаров без перезагрузки.
watchEffect(() => {
  if (currentProduct.value) {
    useHead({
      title: currentProduct.value.name,
      meta: [{ name: 'description', content: currentProduct.value.description || `Купить ${currentProduct.value.name} в нашем магазине` }],
    })
  }
})

// --- 6. Локальное состояние для UI ---
// Количество товара для добавления в корзину.
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
    <div v-else-if="currentProduct" class="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
      <!-- Левая колонка: Изображение -->
      <div>
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
        <!-- TODO: Добавить галерею с дополнительными фото, если они будут -->
      </div>

      <!-- Правая колонка: Информация и покупка -->
      <div class="space-y-6">
        <div>
          <!-- "Хлебные крошки" - ссылка на категорию товара -->
          <NuxtLink
            v-if="currentProduct.categories"
            :to="`/catalog/${currentProduct.categories.slug}`"
            class="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {{ currentProduct.categories.name }}
          </NuxtLink>
          <h1 class="text-3xl lg:text-4xl font-bold mt-1">
            {{ currentProduct.name }}
          </h1>
        </div>

        <p class="text-4xl font-bold">
          {{ currentProduct.price }} ₸
        </p>

        <!-- Описание товара, обернутое в `prose` для красивого форматирования текста -->
        <div v-if="currentProduct.description" class="prose prose-sm max-w-none text-muted-foreground">
          <p>{{ currentProduct.description }}</p>
        </div>

        <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
          При покупке вы получите <span class="font-bold">{{ currentProduct.bonus_points_award }} бонусов</span>
        </div>

        <!-- Блок добавления в корзину -->
        <div class="flex items-center gap-4 pt-4">
          <!-- ИЗМЕНЕНО: Добавлена проверка на наличие товара на складе -->
          <template v-if="currentProduct.stock_quantity > 0">
            <Input
              v-model.number="quantity"
              type="number"
              min="1"
              :max="currentProduct.stock_quantity"
              class="w-24 text-center"
              aria-label="Количество товара"
            />
            <Button size="lg" class="flex-grow" @click="cartStore.addItem(currentProduct, quantity)">
              Добавить в корзину
            </Button>
          </template>
          <!-- Если товара нет в наличии, показываем сообщение -->
          <Button v-else size="lg" class="flex-grow" disabled>
            Нет в наличии
          </Button>
        </div>

        <!-- Индикатор наличия на складе -->
        <p v-if="currentProduct.stock_quantity > 0" class="text-sm text-green-600">
          В наличии: {{ currentProduct.stock_quantity }} шт.
        </p>
      </div>
    </div>
  </div>
</template>

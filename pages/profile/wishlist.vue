<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

definePageMeta({
  layout: 'profile',
})

const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const router = useRouter()

const { wishlistProducts: products, isLoading } = storeToRefs(wishlistStore)

// Загрузка данных избранного при открытии страницы
await useAsyncData('user-wishlist-page', async () => {
  await wishlistStore.fetchWishlistProducts()
  // Нам не нужно возвращать данные, так как они уже в сторе
})

const pageTitle = computed(() => `Избранное (${products.value.length || 0})`)

// Если пользователь не залогинен, перенаправляем (хотя это делает middleware)
if (!authStore.isLoggedIn) {
  router.replace('/auth/login')
}
</script>

<template>
  <div class="container py-12">
    <h1 class="text-3xl font-bold mb-8">
      {{ pageTitle }}
    </h1>

    <!-- Состояние загрузки -->
    <div v-if="isLoading" class="text-center py-20">
      Загрузка избранных товаров...
    </div>

    <!-- Состояние, когда избранное пусто -->
    <div v-else-if="products.length === 0" class="text-center py-20 border-2 border-dashed rounded-lg bg-muted">
      <h2 class="text-2xl font-semibold">
        Ваш список избранного пуст
      </h2>
      <p class="text-muted-foreground mt-2">
        Добавляйте товары, чтобы не потерять их!
      </p>
      <NuxtLink to="/catalog" class="inline-block mt-4">
        <Button>Перейти в каталог</Button>
      </NuxtLink>
    </div>

    <!-- Список товаров -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      <div v-for="product in products" :key="product.id">
        <!-- Используем вашу карточку товара, которая теперь универсальна -->
        <ProductCard :product="product" class="h-full" />
      </div>
    </div>
  </div>
</template>

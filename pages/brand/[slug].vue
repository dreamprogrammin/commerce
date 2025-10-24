<!-- pages/brand/[slug].vue -->
<script setup lang="ts">
import type { IBreadcrumbItem, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const productsStore = useProductsStore()
const { getPublicUrl } = useSupabaseStorage()
const brandSlug = route.params.slug as string

// -- Локальное состояние страницы --
const products = ref<ProductWithGallery[]>([])
const isLoading = ref(true)

// 1. Умная загрузка информации о бренде
const { data: brand, pending: brandPending } = await useAsyncData(
  `brand-${brandSlug}`,
  async () => {
    // Сначала ищем бренд в сторе
    let foundBrand = productsStore.brands.find(b => b.slug === brandSlug)

    // Если в сторе нет, делаем запрос к API
    if (!foundBrand) {
      // Убедимся, что список брендов загружен, если он пуст
      if (productsStore.brands.length === 0) {
        await productsStore.fetchAllBrands()
        // Повторяем поиск после загрузки
        foundBrand = productsStore.brands.find(b => b.slug === brandSlug)
      }
    }
    return foundBrand || null
  },
)

// 2. Загружаем товары, принадлежащие этому бренду
watchEffect(async () => {
  if (brand.value) {
    isLoading.value = true
    products.value = []

    const result = await productsStore.fetchProducts({
      categorySlug: 'all',
      brandIds: [brand.value.id],
    })

    products.value = result.products
    isLoading.value = false
  }
})

// 3. Собираем "хлебные крошки" (Breadcrumbs)
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  const crumbs: IBreadcrumbItem[] = [
    { id: 'brands', name: 'Бренды', href: '/brands' }, // Ссылка на будущую страницу всех брендов
  ]
  if (brand.value) {
    crumbs.push({ id: brand.value.id, name: brand.value.name, href: `/brand/${brand.value.slug}` })
  }
  return crumbs
})

// Устанавливаем заголовок страницы для SEO
useHead({
  title: () => brand.value?.name || 'Бренд не найден',
  meta: [
    { name: 'description', content: () => `Товары бренда ${brand.value?.name || ''}` },
  ],
})
</script>

<template>
  <div class="container mx-auto py-8">
    <!-- Хлебные крошки -->
    <Breadcrumbs :items="breadcrumbs" class="mb-6" />

    <!-- Шапка с информацией о бренде -->
    <div v-if="brandPending" class="text-center py-20">
      Загрузка...
    </div>
    <div v-else-if="brand" class="mb-12 text-center border-b pb-8">
      <NuxtImg
        v-if="brand.logo_url"
        :src="getPublicUrl('brand-logos', brand.logo_url) || undefined"
        :alt="brand.name"
        class="h-24 mx-auto mb-4 object-contain"
        placeholder
        provider="supabase"
      />
      <h1 class="text-4xl font-bold">
        {{ brand.name }}
      </h1>
      <p v-if="brand.description" class="text-muted-foreground mt-2 max-w-2xl mx-auto">
        {{ brand.description }}
      </p>
    </div>
    <div v-else class="text-center py-20">
      <h1 class="text-4xl font-bold">
        Бренд не найден
      </h1>
      <p class="text-muted-foreground mt-2">
        Возможно, вы перешли по неверной ссылке.
      </p>
    </div>

    <!-- Сетка с товарами -->
    <main v-if="brand">
      <h2 class="text-2xl font-bold mb-6">
        Товары бренда
      </h2>

      <ProductGridSkeleton v-if="isLoading" />
      <ProductGrid v-else-if="products.length > 0" :products="products" />
      <div v-else class="text-center py-20 text-muted-foreground border-2 border-dashed rounded-lg">
        <h3 class="text-xl font-semibold">
          Товаров этого бренда пока нет в наличии
        </h3>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import type { ProductImageRow, ProductUpdate } from '@/types'
import { storeToRefs } from 'pinia'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })
const adminProductsStore = useAdminProductsStore()
const { currentProduct, isLoading } = storeToRefs(adminProductsStore) // Делаем ref'ы из стора реактивными
const route = useRoute()
const router = useRouter()
const productId = route.params.id as string

useAsyncData(
  `admin-product-${productId}`,
  () => adminProductsStore.fetchProductById(productId),
)

async function handleUpdate(payload: {
  data: ProductUpdate
  newImageFiles: File[]
  imagesToDelete: string[]
  existingImages: ProductImageRow[]
}) {
  const updatedProduct = await adminProductsStore.updateProduct(
    productId,
    payload.data,
    payload.newImageFiles,
    payload.imagesToDelete,
    payload.existingImages,
  )
  if (updatedProduct) {
    router.push('/admin/products')
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">
        Редактирование товара
      </h1>
      <div v-if="isLoading && !currentProduct" class="text-center py-20">
        Загрузка данных о товаре...
      </div>

      <ProductForm v-else :product="currentProduct" @submit="handleUpdate" />
    </div>
  </div>
</template>

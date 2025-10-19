<script setup lang="ts">
import type { AttributeValuePayload, ProductImageRow, ProductUpdate } from '@/types'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const route = useRoute()
const router = useRouter()
const productId = route.params.id as string

const { data: currentProduct, pending: isLoading, error } = await useAsyncData(
  `admin-product-${productId}`,
  async () => {
    const product = await adminProductsStore.fetchProductById(productId)
    // Если товар не найден, "выбрасываем" ошибку, которую Nuxt поймает
    if (!currentProduct) {
      throw createError({ statusCode: 404, statusMessage: 'Товар не найден' })
    }
    return product
  },
)

if (error.value) {
  // Можно показать страницу 404 или перенаправить
  console.error('Ошибка загрузки товара:', error.value)
  router.replace('/admin/products')
}
/**
 * Обработчик события @update от компонента ProductForm.
 */
async function handleUpdate(payload: {
  data: ProductUpdate
  newImageFiles: File[]
  imagesToDelete: string[]
  existingImages: ProductImageRow[]
  attributeValues: AttributeValuePayload[]
}) {
  const updatedProduct = await adminProductsStore.updateProduct(
    productId,
    payload.data,
    payload.newImageFiles,
    payload.imagesToDelete,
    payload.existingImages,
  )

  if (updatedProduct) {
    const valuesToSave = payload.attributeValues.map(value => ({
      ...value,
      product_id: productId,
    }))
    await adminProductsStore.saveProductAttributeValues(productId, valuesToSave)

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
      <div v-if="isLoading" class="text-center py-20">
        Загрузка данных о товаре...
      </div>
      <ProductForm
        v-else-if="currentProduct"
        :initial-data="currentProduct"
        @update="handleUpdate"
      />
      <div v-else class="text-center py-20 text-destructive">
        <p>Не удалось загрузить товар. Возможно, он был удален.</p>
      </div>
    </div>
  </div>
</template>

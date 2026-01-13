<script setup lang="ts">
import type { AttributeValuePayload, ProductImageRow, ProductUpdate } from '@/types'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const route = useRoute()
const router = useRouter()
const productId = route.params.id as string

// ✅ Добавляем SEO composable
const { notifyProduct } = useSeoIndexing()

// --- 1. ЗАГРУЗКА ДАННЫХ ---
// Мы используем `data`, `pending`, `error` как есть, без переименования.
const { data, pending, error } = await useAsyncData(
  `admin-product-${productId}`,
  async () => {
    const product = await adminProductsStore.fetchProductById(productId)
    if (!product) {
      // Выбрасываем ошибку, которую Nuxt обработает
      throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
    }
    return product
  },
)

// --- 2. ОБРАБОТЧИК СОБЫТИЯ ---
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

    // ✅ Уведомляем поисковики об обновлении товара
    if (updatedProduct.slug) {
      try {
        await notifyProduct(updatedProduct.slug)
        toast.success('✅ Товар обновлен и отправлен в поисковики')
      } catch (error) {
        console.error('SEO notification error:', error)
        toast.warning('⚠️ Товар обновлен, но не удалось уведомить поисковики')
      }
    }

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
      <div v-if="pending" class="text-center py-20">
        Загрузка данных о товаре...
      </div>
      <ProductForm
        v-else-if="data"
        :initial-data="data"
        @update="handleUpdate"
      />
      <div v-else class="text-center py-20 text-destructive">
        <p>Не удалось загрузить товар. Возможно, он был удален или произошла ошибка.</p>
        <p v-if="error">
          {{ error.statusMessage }}
        </p>
      </div>
    </div>
  </div>
</template>
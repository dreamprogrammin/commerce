<script setup lang="ts">
import type { ProductInsert } from '@/types'
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })

const adminProductsStore = useAdminProductsStore()
const router = useRouter()

/**
 * Обработчик события @create от компонента ProductForm.
 */
async function handleCreate(payload: {
  data: ProductInsert
  newImageFiles: File[]
}) {
  // Вызываем обновленный метод стора, который теперь проще
  const newProduct = await adminProductsStore.createProduct(
    payload.data,
    payload.newImageFiles,
  )

  if (newProduct) {
    router.push('/admin/products')
  }
}
</script>

<template>
  <div class="p-4 md:p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-3xl font-bold mb-6">
        Новый товар
      </h1>
      <ProductForm @create="handleCreate" />
    </div>
  </div>
</template>

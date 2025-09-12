<script setup lang="ts">
import ProductForm from '@/components/admin/products/ProductForm.vue'
import { useAdminProductsStore } from '@/stores/adminStore/adminProductsStore'

definePageMeta({ layout: 'admin' })
const adminProductsStore = useAdminProductsStore()
const router = useRouter()

async function handleCreate(formDataRef: Ref<any>, newImageFiles: File[], imagesToDelete: string[]) {
  const result = await adminProductsStore.saveProduct( // <-- Вызываем ту же saveProduct
    formDataRef.value,
    newImageFiles,
    imagesToDelete,
  )
  if (result) {
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
      <ProductForm @submit="handleCreate" />
    </div>
  </div>
</template>
